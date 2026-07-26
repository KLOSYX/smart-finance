from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database as core_database
from app.main import app
from app.models.category import DEFAULT_CATEGORIES
from app.models.transaction import Asset, AssetSnapshot, Base, Cashflow, Category, ImportBatch, ReviewCandidate


@pytest.fixture(scope="module")
def ledger_context(tmp_path_factory):
    database_path = tmp_path_factory.mktemp("household") / "household.db"
    engine = create_engine(f"sqlite:///{database_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = session_factory()
    for domain, rows in DEFAULT_CATEGORIES.items():
        for code, name in rows:
            db.add(Category(domain=domain, code=code, name=name, is_default=True, is_archived=False))
    db.commit()
    db.close()
    original_session_local = core_database.SessionLocal
    core_database.SessionLocal = session_factory
    try:
        with TestClient(app) as client:
            yield client, session_factory
    finally:
        core_database.SessionLocal = original_session_local
        engine.dispose()


@pytest.fixture(autouse=True)
def clean_ledger(ledger_context):
    _, session_factory = ledger_context
    db = session_factory()
    db.query(ReviewCandidate).delete()
    db.query(Cashflow).delete()
    db.query(ImportBatch).delete()
    db.query(AssetSnapshot).delete()
    db.query(Asset).delete()
    db.commit()
    yield
    db.query(ReviewCandidate).delete()
    db.query(Cashflow).delete()
    db.query(ImportBatch).delete()
    db.query(AssetSnapshot).delete()
    db.query(Asset).delete()
    db.commit()
    db.close()


def _category_id(client: TestClient, domain: str, code: str) -> int:
    rows = client.get("/api/metadata/categories", params={"domain": domain}).json()
    return next(row["id"] for row in rows if row["code"] == code)


def test_asset_keeps_current_value_only_and_tracks_snapshots(ledger_context):
    client, _ = ledger_context
    category_id = _category_id(client, "asset", "time_deposit")
    created = client.post("/api/assets", json={
        "name": "招商银行定期", "category_id": category_id, "channel": "招商银行",
        "household_role": "shared", "current_value_cents": 100_000_00,
        "valuation_date": "2026-06-30",
    })
    assert created.status_code == 200
    asset_id = created.json()["id"]
    updated = client.patch(f"/api/assets/{asset_id}", json={
        "current_value_cents": 102_000_00, "valuation_date": "2026-07-31",
    })
    assert updated.status_code == 200
    assert updated.json()["monthly_change_cents"] == 2_000_00
    assert "cost" not in updated.json()
    assert client.delete(f"/api/assets/{asset_id}").status_code == 200
    assert client.get("/api/assets").json() == []


def test_asset_monthly_change_uses_previous_natural_month_not_prior_same_month_snapshot(ledger_context):
    client, _ = ledger_context
    category_id = _category_id(client, "asset", "demand_deposit")
    created = client.post("/api/assets", json={
        "name": "家庭活期", "category_id": category_id, "channel": "招商银行",
        "household_role": "shared", "current_value_cents": 100_000_00,
        "valuation_date": "2026-06-30",
    }).json()
    client.patch(f"/api/assets/{created['id']}", json={
        "current_value_cents": 101_000_00, "valuation_date": "2026-07-01",
    })
    latest = client.patch(f"/api/assets/{created['id']}", json={
        "current_value_cents": 105_000_00, "valuation_date": "2026-07-26",
    })
    assert latest.status_code == 200
    assert latest.json()["previous_value_cents"] == 100_000_00
    assert latest.json()["monthly_change_cents"] == 5_000_00


def test_provident_fund_is_a_builtin_asset_category(ledger_context):
    client, _ = ledger_context
    categories = client.get("/api/metadata/categories", params={"domain": "asset"}).json()
    provident_fund = next(row for row in categories if row["code"] == "provident_fund")
    assert provident_fund["name"] == "住房公积金"
    assert provident_fund["is_default"] is True


def test_pending_review_is_a_fixed_category_in_every_domain(ledger_context):
    client, _ = ledger_context
    expected = {
        "asset": "needs_review_asset",
        "income": "needs_review_income",
        "expense": "needs_review",
    }
    for domain, code in expected.items():
        categories = client.get("/api/metadata/categories", params={"domain": domain}).json()
        category = next(row for row in categories if row["code"] == code)
        assert category["name"] == "待复核"
        assert category["is_default"] is True


def test_cashflow_types_use_positive_amounts_and_exclude_transfers(ledger_context):
    client, _ = ledger_context
    salary = _category_id(client, "income", "salary")
    dining = _category_id(client, "expense", "dining")
    payloads = [
        ("income", salary, 20_000_00, "工资"),
        ("expense", dining, 2_000_00, "餐饮"),
        ("expense_refund", dining, 300_00, "退款"),
        ("transfer", None, 5_000_00, "信用卡还款"),
    ]
    for index, (flow_type, category_id, amount, description) in enumerate(payloads):
        response = client.post("/api/cashflows", json={
            "transaction_date": f"2026-07-{index + 1:02d}", "description": description,
            "amount_cents": amount, "flow_type": flow_type, "category_id": category_id,
            "channel": "招商银行", "household_role": "shared",
        })
        assert response.status_code == 200
    analytics = client.get("/api/analytics/cashflow", params={"month": "2026-07"}).json()
    assert analytics["income_cents"] == 20_000_00
    assert analytics["expense_cents"] == 1_700_00
    assert analytics["balance_cents"] == 18_300_00


def test_cashflows_can_be_deleted_in_bulk_and_by_natural_month(ledger_context):
    client, _ = ledger_context
    dining = _category_id(client, "expense", "dining")
    ids = []
    for transaction_date, description in (
        ("2026-07-01", "七月早餐"),
        ("2026-07-15", "七月午餐"),
        ("2026-08-01", "八月早餐"),
    ):
        response = client.post("/api/cashflows", json={
            "transaction_date": transaction_date,
            "description": description,
            "amount_cents": 1000,
            "flow_type": "expense",
            "category_id": dining,
            "channel": "支付宝",
            "household_role": "shared",
        })
        ids.append(response.json()["id"])

    bulk = client.post("/api/cashflows/bulk-delete", json={"ids": [ids[0], ids[0]]})
    assert bulk.status_code == 200
    assert bulk.json()["deleted_count"] == 1

    whole_month = client.delete("/api/cashflows/month/2026-07")
    assert whole_month.status_code == 200
    assert whole_month.json()["deleted_count"] == 1
    remaining = client.get("/api/cashflows", params={"month": "2026-08"}).json()
    assert [row["id"] for row in remaining["items"]] == [ids[2]]


def test_identical_cashflows_are_allowed_for_manual_cleanup(ledger_context):
    client, _ = ledger_context
    dining = _category_id(client, "expense", "dining")
    payload = {
        "transaction_date": "2026-07-02", "description": "晚餐", "amount_cents": 18800,
        "flow_type": "expense", "category_id": dining, "channel": "支付宝",
        "household_role": "wife",
    }
    assert client.post("/api/cashflows", json=payload).status_code == 200
    duplicate = client.post("/api/cashflows", json=payload)
    assert duplicate.status_code == 200
    rows = client.get("/api/cashflows", params={"month": "2026-07"}).json()["items"]
    assert len(rows) == 2


def test_custom_category_can_be_added_and_archived(ledger_context):
    client, _ = ledger_context
    created = client.post("/api/metadata/categories", json={"domain": "expense", "name": "宠物"}).json()
    assert created["is_default"] is False
    assert client.delete(f"/api/metadata/categories/{created['id']}").status_code == 200
    assert created["id"] not in [row["id"] for row in client.get("/api/metadata/categories").json()]


def test_pdf_preview_rejects_invalid_and_image_only_files(ledger_context, monkeypatch):
    client, _ = ledger_context
    invalid = client.post("/api/imports/preview", files={"file": ("not-a-pdf.pdf", b"not a pdf", "application/pdf")})
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "pdf_invalid"

    monkeypatch.setattr("app.api.endpoints.extract_text_from_pdf", lambda _stream: "")
    image_only = client.post(
        "/api/imports/preview",
        files={"file": ("scan.pdf", b"%PDF-1.7\nimage-only", "application/pdf")},
    )
    assert image_only.status_code == 422
    assert image_only.json()["detail"]["code"] == "pdf_no_text"


def test_same_pdf_can_be_previewed_again(ledger_context, monkeypatch):
    client, _ = ledger_context
    content = b"%PDF-1.7\nknown-content"
    monkeypatch.setattr("app.api.endpoints.extract_text_from_pdf", lambda _stream: "7月工资到账 18500 元")
    first = client.post("/api/imports/preview", files={"file": ("known.pdf", content, "application/pdf")})
    second = client.post("/api/imports/preview", files={"file": ("known.pdf", content, "application/pdf")})
    assert first.status_code == second.status_code == 200
    assert first.json()["content_sha256"] == second.json()["content_sha256"]
    assert first.json()["text"] == "7月工资到账 18500 元"


def test_same_text_can_be_previewed_again(ledger_context):
    client, _ = ledger_context
    text = "户名：张三\n商户：姓名餐厅\n7月支出 185 元"
    first = client.post("/api/imports/text-preview", json={"text": text})
    second = client.post("/api/imports/text-preview", json={"text": text})
    assert first.status_code == second.status_code == 200
    assert first.json()["content_sha256"] == second.json()["content_sha256"]
    assert first.json()["text"] == text


def test_review_queue_returns_pending_candidates_grouped_by_import(ledger_context):
    client, session_factory = ledger_context
    db = session_factory()
    batch = ImportBatch(
        filename="待复核工资.txt",
        content_sha256="f" * 64,
        source_type="text",
        import_kind="cashflow",
        status="review",
    )
    db.add(batch)
    db.flush()
    db.add(ReviewCandidate(
        import_id=batch.id,
        candidate_type="cashflow",
        payload_json='{"transaction_date":"2026-07-25","description":"工资","amount":18500,"flow_type":"expense","category_code":"needs_review","household_role":"husband"}',
        confidence=0.45,
        warning="置信度低，需要重点复核",
        status="pending",
    ))
    db.add(ReviewCandidate(
        import_id=batch.id,
        candidate_type="cashflow",
        payload_json='{"transaction_date":"2026-07-25","description":"奖金","amount":3000,"flow_type":"income","category_code":"needs_review_income","household_role":"wife"}',
        confidence=0.99,
        warning=None,
        status="pending",
    ))
    db.commit()
    batch_id = batch.id
    db.close()

    queue = client.get("/api/imports/review-queue")
    assert queue.status_code == 200
    assert queue.json()[0]["import_id"] == batch_id
    assert queue.json()[0]["candidates"][0]["payload"]["description"] == "工资"
    assert len(queue.json()[0]["candidates"]) == 2
    assert all(candidate["status"] == "pending" for candidate in queue.json()[0]["candidates"])
    assert all("confidence" not in candidate for candidate in queue.json()[0]["candidates"])


def test_review_can_correct_cashflow_candidate_into_asset(ledger_context):
    client, session_factory = ledger_context
    db = session_factory()
    batch = ImportBatch(
        filename="误识别资产.txt",
        content_sha256="e" * 64,
        source_type="text",
        import_kind="asset",
        status="review",
    )
    db.add(batch)
    db.flush()
    candidate = ReviewCandidate(
        import_id=batch.id,
        candidate_type="cashflow",
        payload_json='{"transaction_date":"2026-07-25","description":"支付宝余额","amount":12680,"flow_type":"income"}',
        confidence=0.4,
        status="pending",
    )
    db.add(candidate)
    db.commit()
    batch_id = batch.id
    candidate_id = candidate.id
    db.close()

    result = client.post(f"/api/imports/{batch_id}/commit", json={
        "candidates": [{
            "id": candidate_id,
            "candidate_type": "asset_snapshot",
            "include": True,
            "payload": {
                "name": "支付宝余额",
                "valuation_date": "2026-07-25",
                "value": 12680,
                "category_code": "e_wallet",
                "channel": "支付宝",
                "household_role": "shared",
            },
        }],
    })
    assert result.status_code == 200
    assets = client.get("/api/assets").json()
    assert assets[0]["name"] == "支付宝余额"
    assert assets[0]["current_value_cents"] == 1_268_000


def test_asset_import_merges_duplicate_snapshots_within_same_batch(ledger_context):
    client, session_factory = ledger_context
    db = session_factory()
    batch = ImportBatch(
        filename="重复资产快照.txt",
        content_sha256="d" * 64,
        source_type="text",
        import_kind="asset",
        status="review",
    )
    db.add(batch)
    db.flush()
    candidates = []
    for value in (1000, 1200):
        candidate = ReviewCandidate(
            import_id=batch.id,
            candidate_type="asset_snapshot",
            payload_json=(
                '{"name":"支付宝基金","valuation_date":"2026-07-01",'
                f'"value":{value},"category_code":"fund","channel":"支付宝","household_role":"wife"}}'
            ),
            confidence=0,
            status="pending",
        )
        db.add(candidate)
        candidates.append(candidate)
    db.commit()
    batch_id = batch.id
    candidate_ids = [candidate.id for candidate in candidates]
    db.close()

    response = client.post(f"/api/imports/{batch_id}/commit", json={
        "candidates": [
            {
                "id": candidate_id,
                "candidate_type": "asset_snapshot",
                "include": True,
                "payload": {
                    "name": "支付宝基金",
                    "valuation_date": "2026-07-01",
                    "value": value,
                    "category_code": "fund",
                    "channel": "支付宝",
                    "household_role": "wife",
                },
            }
            for candidate_id, value in zip(candidate_ids, (1000, 1200), strict=True)
        ],
    })

    assert response.status_code == 200
    assets = client.get("/api/assets").json()
    assert len(assets) == 1
    assert assets[0]["current_value_cents"] == 120_000


def test_review_queue_normalizes_social_security_and_batch_can_be_discarded(ledger_context):
    client, session_factory = ledger_context
    text = "住房公积金余额 52220 元"
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    db = session_factory()
    batch = ImportBatch(
        filename="公积金.txt",
        content_sha256=digest,
        source_type="text",
        import_kind="asset",
        status="review",
    )
    db.add(batch)
    db.flush()
    db.add(ReviewCandidate(
        import_id=batch.id,
        candidate_type="asset_snapshot",
        payload_json=(
            '{"name":"公积金","valuation_date":"2026-07-01","value":52220,'
            '"category_code":"social_security","channel":"公积金","household_role":"wife"}'
        ),
        confidence=0,
        status="pending",
    ))
    db.commit()
    batch_id = batch.id
    db.close()

    queue = client.get("/api/imports/review-queue").json()
    assert queue[0]["candidates"][0]["payload"]["category_code"] == "provident_fund"

    discarded = client.delete(f"/api/imports/{batch_id}/review")
    assert discarded.status_code == 200
    assert discarded.json()["discarded_candidates"] == 1
    assert client.get("/api/imports/review-queue").json() == []
    assert client.post("/api/imports/text-preview", json={"text": text}).status_code == 200


def test_multimodal_extract_requires_text_or_image(ledger_context):
    client, _ = ledger_context
    response = client.post("/api/imports/extract", json={
        "filename": "空输入",
        "content_sha256": "a" * 64,
        "text": "",
        "source_type": "file",
        "import_kind": "asset",
        "instruction": "只识别资产",
        "images": [],
    })
    assert response.status_code == 422


def test_extract_corrects_declared_type_and_reports_destinations(ledger_context, monkeypatch):
    client, _ = ledger_context

    async def fake_extract(*_args, **_kwargs):
        return [
            {
                "candidate_type": "cashflow",
                "transaction_date": "2026-07-25",
                "description": "工资",
                "amount": 18500,
                "flow_type": "income",
                "category_code": "salary",
                "channel": "招商银行",
                "household_role": "husband",
            },
            {
                "candidate_type": "cashflow",
                "transaction_date": "2026-07-26",
                "description": "来源不明收入",
                "amount": 500,
                "flow_type": "income",
                "category_code": "needs_review_income",
                "channel": "支付宝",
                "household_role": "shared",
            },
        ]

    monkeypatch.setattr("app.api.endpoints.analyze_financial_records", fake_extract)
    assert client.put("/api/settings", json={"api_key": "test-key"}).status_code == 200
    response = client.post("/api/imports/extract", json={
        "filename": "混合识别.txt",
        "content_sha256": "b" * 64,
        "text": "工资与来源不明收入",
        "source_type": "text",
        "import_kind": "asset",
        "images": [],
    })
    assert response.status_code == 200
    result = response.json()
    assert result["auto_committed_count"] == 1
    assert result["auto_committed_assets"] == 0
    assert result["auto_committed_cashflows"] == 1
    assert result["cashflow_months"] == ["2026-07"]
    assert result["pending_review_count"] == 1
    assert [row["payload"]["category_code"] for row in result["candidates"]] == ["needs_review_income"]

    cashflows = client.get("/api/cashflows", params={"month": "2026-07"}).json()["items"]
    assert [row["description"] for row in cashflows] == ["工资"]
    queue = client.get("/api/imports/review-queue").json()
    assert len(queue) == 1
    assert [row["payload"]["description"] for row in queue[0]["candidates"]] == ["来源不明收入"]

    repeated = client.post("/api/imports/extract", json={
        "filename": "混合识别.txt",
        "content_sha256": "b" * 64,
        "text": "工资与来源不明收入",
        "source_type": "text",
        "import_kind": "mixed",
        "images": [],
    })
    assert repeated.status_code == 200
    assert repeated.json()["auto_committed_cashflows"] == 1
    repeated_rows = client.get("/api/cashflows", params={"month": "2026-07"}).json()["items"]
    assert [row["description"] for row in repeated_rows] == ["工资", "工资"]
    assert len(client.get("/api/imports/review-queue").json()) == 2


def test_extract_converts_negative_expense_into_refund(ledger_context, monkeypatch):
    client, _ = ledger_context

    async def fake_extract(*_args, **_kwargs):
        return [
            {
                "candidate_type": "cashflow",
                "transaction_date": "2026-07-20",
                "description": "餐厅消费",
                "amount": 200,
                "flow_type": "expense",
                "category_code": "dining",
                "channel": "信用卡",
                "household_role": "shared",
            },
            {
                "candidate_type": "cashflow",
                "transaction_date": "2026-07-22",
                "description": "餐厅退款",
                "amount": -200,
                "flow_type": "expense",
                "category_code": "dining",
                "channel": "信用卡",
                "household_role": "shared",
            },
        ]

    monkeypatch.setattr("app.api.endpoints.analyze_financial_records", fake_extract)
    assert client.put("/api/settings", json={"api_key": "test-key"}).status_code == 200
    response = client.post("/api/imports/extract", json={
        "filename": "含退款账单.txt",
        "content_sha256": "e" * 64,
        "text": "餐厅消费 200.00\n餐厅退款 -200.00",
        "source_type": "text",
        "import_kind": "cashflow",
        "images": [],
    })

    assert response.status_code == 200
    rows = client.get("/api/cashflows", params={"month": "2026-07"}).json()["items"]
    assert [(row["flow_type"], row["amount_cents"]) for row in rows] == [
        ("expense_refund", 20_000),
        ("expense", 20_000),
    ]
    analytics = client.get("/api/analytics/cashflow", params={"month": "2026-07"}).json()
    assert analytics["expense_cents"] == 0


def test_empty_extraction_does_not_lock_content_hash(ledger_context, monkeypatch):
    client, _ = ledger_context

    async def fake_empty(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.endpoints.analyze_financial_records", fake_empty)
    payload = {
        "filename": "无记录.txt",
        "content_sha256": "c" * 64,
        "text": "这里只是一段说明",
        "source_type": "text",
        "import_kind": "mixed",
        "images": [],
    }
    first = client.post("/api/imports/extract", json=payload)
    second = client.post("/api/imports/extract", json=payload)
    assert first.status_code == second.status_code == 422
    assert "未被标记为已导入" in first.json()["detail"]


def test_existing_import_marker_does_not_block_same_hash(ledger_context, monkeypatch):
    client, session_factory = ledger_context
    db = session_factory()
    db.add(ImportBatch(
        filename="旧空批次",
        content_sha256="d" * 64,
        source_type="file",
        import_kind="asset",
        status="committed",
    ))
    db.commit()
    db.close()

    async def fake_asset(*_args, **_kwargs):
        return [{
            "candidate_type": "asset_snapshot",
            "name": "支付宝基金",
            "valuation_date": "2026-07-26",
            "value": 1000,
            "category_code": "fund",
            "channel": "支付宝",
            "household_role": "husband",
        }]

    monkeypatch.setattr("app.api.endpoints.analyze_financial_records", fake_asset)
    response = client.post("/api/imports/extract", json={
        "filename": "重新识别图片",
        "content_sha256": "d" * 64,
        "text": "支付宝基金 1000 元",
        "source_type": "file",
        "import_kind": "asset",
        "images": [],
    })
    assert response.status_code == 200
    assert response.json()["auto_committed_assets"] == 1
