from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import router
from app.core.database import get_db
from app.models.transaction import Asset, AssetSnapshot, Base, Cashflow, Category
from app.services.reconciliation import monthly_reconciliation


@pytest.fixture
def ledger():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        category = Category(domain="asset", code="cash", name="现金")
        db.add(category)
        db.commit()
        yield db, category.id
    engine.dispose()


def asset(ledger, snapshots, archived=False):
    db, category_id = ledger
    row = Asset(
        name="家庭账户", category_id=category_id, channel="银行", is_archived=archived
    )
    db.add(row)
    db.flush()
    for day, value in snapshots:
        db.add(
            AssetSnapshot(
                asset_id=row.id,
                valuation_date=date.fromisoformat(day),
                value_cents=value,
            )
        )
    db.commit()
    return row


def flow(ledger, kind, cents, day="2026-07-15"):
    db, _ = ledger
    db.add(
        Cashflow(
            transaction_date=date.fromisoformat(day),
            description=kind,
            flow_type=kind,
            amount_cents=cents,
            fingerprint=f"{kind}-{cents}-{day}",
        )
    )
    db.commit()


def report(
    ledger, today=date(2026, 8, 31), start=date(2026, 7, 1), end=date(2026, 8, 1)
):
    return monthly_reconciliation(ledger[0], start, end, today)


@pytest.mark.parametrize(
    "closing,expected_gap", [(1_040_000, 60_000), (1_100_000, 0), (1_160_000, -60_000)]
)
def test_reconciles_income_expenses_refunds_and_transfers(
    ledger, closing, expected_gap
):
    asset(
        ledger,
        [("2026-06-30", 1_000_000), ("2026-07-31", closing), ("2026-08-31", 9_999_999)],
    )
    flow(ledger, "income", 200_000)
    flow(ledger, "expense", 120_000)
    flow(ledger, "expense_refund", 20_000)
    flow(ledger, "transfer", 700_000)
    flow(ledger, "expense", 900_000, "2026-08-01")
    result = report(ledger)
    assert result["status"] == "snapshots_ready"
    assert result["recorded_expense_cents"] == 100_000
    assert result["gap_cents"] == expected_gap
    assert result["closing_assets_cents"] == closing
    assert result["asset_change_cents"] == closing - 1_000_000
    assert result["record_count"] == 4


def test_refund_only_month_retains_negative_net_expense(ledger):
    asset(ledger, [("2026-06-30", 100_000), ("2026-07-31", 110_000)])
    flow(ledger, "expense_refund", 10_000)
    result = report(ledger)
    assert result["recorded_expense_cents"] == -10_000
    assert result["inferred_expense_cents"] == -10_000
    assert result["gap_cents"] == 0


def test_new_asset_missing_baseline_is_not_assumed_zero(ledger):
    asset(ledger, [("2026-06-30", 100), ("2026-07-31", 100)])
    asset(ledger, [("2026-07-31", 500_000)])
    result = report(ledger)
    assert result["status"] == "unavailable"
    assert result["opening_assets_cents"] is None
    assert result["inferred_expense_cents"] is None
    assert result["gap_cents"] is None
    assert result["missing_opening_count"] == 1


def test_explicit_zero_baseline_is_valid(ledger):
    asset(ledger, [("2026-06-30", 0), ("2026-07-31", 100_000)])
    flow(ledger, "income", 100_000)
    assert report(ledger)["gap_cents"] == 0


def test_stale_snapshots_are_exposed_and_not_labeled_complete(ledger):
    asset(ledger, [("2026-05-31", 100), ("2026-07-20", 80)])
    result = report(ledger)
    assert result["status"] == "estimated"
    assert result["ready_asset_count"] == 0
    assert result["assets"][0]["issues"] == ["stale_opening", "stale_closing"]
    assert result["gap_cents"] == 20


def test_missing_month_update_is_visible(ledger):
    asset(ledger, [("2026-06-30", 100)])
    result = report(ledger)
    assert result["status"] == "estimated"
    assert result["assets"][0]["issues"] == ["missing_closing_update"]


def test_current_month_uses_same_cutoff_for_assets_and_flows(ledger):
    asset(ledger, [("2026-06-30", 100), ("2026-07-15", 80), ("2026-07-31", 500)])
    flow(ledger, "expense", 20)
    flow(ledger, "income", 900, "2026-07-16")
    result = report(ledger, today=date(2026, 7, 15))
    assert result["status"] == "estimated"
    assert result["is_partial_month"] is True
    assert result["closing_assets_cents"] == 80
    assert result["income_cents"] == 0
    assert result["gap_cents"] == 0


def test_excludes_archived_and_later_assets(ledger):
    asset(ledger, [("2026-06-30", 100), ("2026-07-31", 100)])
    asset(ledger, [("2026-06-30", 800), ("2026-07-31", 999)], archived=True)
    asset(ledger, [("2026-08-01", 500)])
    result = report(ledger)
    assert result["asset_count"] == 1
    assert result["gap_cents"] == 0


def test_empty_or_future_period_has_no_fabricated_gap(ledger):
    assert report(ledger)["gap_cents"] is None
    asset(ledger, [("2026-06-30", 100)])
    result = report(ledger, today=date(2026, 6, 30))
    assert result["status"] == "unavailable"
    assert result["gap_cents"] is None


def test_leap_year_and_year_boundary(ledger):
    asset(ledger, [("2024-01-31", 200), ("2024-02-29", 100)])
    result = report(ledger, start=date(2024, 2, 1), end=date(2024, 3, 1))
    assert result["closing_date"] == date(2024, 2, 29)
    assert result["gap_cents"] == 100
    asset(ledger, [("2023-12-31", 300), ("2024-01-31", 200)])
    result = report(ledger, start=date(2024, 1, 1), end=date(2024, 2, 1))
    assert result["opening_date"] == date(2023, 12, 31)


def test_endpoint_validates_month_and_serializes_read_only(ledger):
    db, _ = ledger
    asset(ledger, [("2026-06-30", 100), ("2026-07-31", 80)])
    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: db
    before = (db.query(AssetSnapshot).count(), db.query(Cashflow).count())
    with TestClient(app) as client:
        response = client.get(
            "/api/analytics/reconciliation", params={"month": "2026-07"}
        )
        assert response.status_code == 200
        assert response.json()["gap_cents"] == 20
        assert response.json()["opening_date"] == "2026-06-30"
        for invalid in ("0000-01", "0001-01", "9999-12"):
            assert (
                client.get(
                    "/api/analytics/reconciliation", params={"month": invalid}
                ).status_code
                == 422
            )
        assert (
            client.get("/api/analytics/reconciliation?month=2026-13").status_code == 422
        )
    assert (db.query(AssetSnapshot).count(), db.query(Cashflow).count()) == before
