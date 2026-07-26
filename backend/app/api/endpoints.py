from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.category import normalize_legacy_expense_category
from app.models.transaction import (
    Asset,
    AssetSnapshot,
    Cashflow,
    Category,
    ImportBatch,
    ReviewCandidate,
    Settings,
)
from app.schemas import (
    AssetCreate,
    AssetResponse,
    AssetUpdate,
    CashflowBulkDeleteRequest,
    CashflowCreate,
    CashflowPage,
    CashflowResponse,
    CashflowUpdate,
    CategoryCreate,
    CategoryResponse,
    ChatRequest,
    ImportCommitRequest,
    ImportExtractRequest,
    ImportExtractResponse,
    ImportPreview,
    ImportSummary,
    ReviewBatchResponse,
    ReviewCandidateResponse,
    SettingsUpdate,
)
from app.services.llm_client import analyze_financial_records, stream_chat_with_data
from app.services.pdf_processor import extract_text_from_pdf


router = APIRouter()
DEFAULT_LLM_MODEL = "openai/gpt-5.6-luna"
MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
ROLE_VALUES = {"husband", "wife", "shared"}
FLOW_VALUES = {"income", "expense", "expense_refund", "transfer"}
REVIEW_CATEGORY_CODES = {"needs_review", "needs_review_income", "needs_review_asset"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _setting(db: Session, key: str, default: str = "") -> str:
    row = db.get(Settings, key)
    return row.value if row else default


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Settings, key)
    if row is None:
        db.add(Settings(key=key, value=value))
    else:
        row.value = value


def _month_bounds(month: str | None) -> tuple[date, date, str]:
    if month is None:
        today = date.today()
        month = today.strftime("%Y-%m")
    if not MONTH_RE.fullmatch(month):
        raise HTTPException(422, "month must use YYYY-MM")
    start = date.fromisoformat(f"{month}-01")
    end = date(
        start.year + (start.month == 12), 1 if start.month == 12 else start.month + 1, 1
    )
    return start, end, month


def _shift_month(start: date, offset: int) -> date:
    index = start.year * 12 + start.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def _money_to_cents(value) -> int:
    try:
        return abs(
            int(
                (Decimal(str(value or 0)) * 100).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
        )
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(422, f"invalid amount: {value!r}") from exc


def _normalize_cashflow_direction(payload: dict) -> None:
    """Keep stored amounts positive and use flow_type as the source of direction."""
    try:
        amount = Decimal(str(payload.get("amount") or 0))
    except InvalidOperation:
        return
    flow_type = str(payload.get("flow_type") or "expense")
    if amount < 0 and flow_type == "expense":
        payload["flow_type"] = "expense_refund"
    amount = abs(amount)
    payload["amount"] = int(amount) if amount == amount.to_integral() else float(amount)


def _fingerprint(
    transaction_date: date,
    description: str,
    amount_cents: int,
    flow_type: str,
    channel: str | None,
    card_last_four: str | None,
) -> str:
    raw = "|".join(
        (
            transaction_date.isoformat(),
            description.strip().lower(),
            str(amount_cents),
            flow_type,
            (channel or "").strip().lower(),
            card_last_four or "",
        )
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _category(
    db: Session, category_id: int | None, domain: str | None = None
) -> Category | None:
    if category_id is None:
        return None
    row = db.get(Category, category_id)
    if row is None or row.is_archived or (domain and row.domain != domain):
        raise HTTPException(422, "category does not match this record")
    return row


def _category_by_code(db: Session, code: str | None, domain: str) -> Category:
    normalized = (
        normalize_legacy_expense_category(code)
        if domain == "expense"
        else str(code or "").strip().lower()
    )
    if domain == "asset" and normalized == "social_security":
        normalized = "provident_fund"
    row = (
        db.query(Category)
        .filter(
            Category.domain == domain,
            Category.code == normalized,
            Category.is_archived.is_(False),
        )
        .first()
    )
    if row is None:
        fallback = {
            "asset": "needs_review_asset",
            "income": "needs_review_income",
            "expense": "needs_review",
        }[domain]
        row = (
            db.query(Category)
            .filter(Category.domain == domain, Category.code == fallback)
            .one()
        )
    return row


def _cashflow_schema(row: Cashflow) -> CashflowResponse:
    return CashflowResponse(
        id=row.id,
        transaction_date=row.transaction_date,
        description=row.description,
        amount_cents=row.amount_cents,
        flow_type=row.flow_type,
        category_id=row.category_id,
        category_name=row.category.name if row.category else None,
        channel=row.channel,
        household_role=row.household_role,
        card_last_four=row.card_last_four,
        import_id=row.import_id,
    )


def _latest_snapshots(
    db: Session, asset: Asset, as_of: date | None = None
) -> list[AssetSnapshot]:
    query = db.query(AssetSnapshot).filter(AssetSnapshot.asset_id == asset.id)
    if as_of:
        query = query.filter(AssetSnapshot.valuation_date <= as_of)
    return (
        query.order_by(AssetSnapshot.valuation_date.desc(), AssetSnapshot.id.desc())
        .limit(2)
        .all()
    )


def _asset_schema(db: Session, asset: Asset) -> AssetResponse:
    snapshots = _latest_snapshots(db, asset)
    if not snapshots:
        raise HTTPException(500, "asset has no snapshot")
    current = snapshots[0]
    month_start = current.valuation_date.replace(day=1)
    previous = (
        db.query(AssetSnapshot)
        .filter(
            AssetSnapshot.asset_id == asset.id,
            AssetSnapshot.valuation_date < month_start,
        )
        .order_by(AssetSnapshot.valuation_date.desc(), AssetSnapshot.id.desc())
        .first()
    )
    change = current.value_cents - (
        previous.value_cents if previous else current.value_cents
    )
    rate = change / previous.value_cents if previous and previous.value_cents else None
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        category_id=asset.category_id,
        category_name=asset.category.name,
        channel=asset.channel,
        household_role=asset.household_role,
        note=asset.note,
        current_value_cents=current.value_cents,
        previous_value_cents=previous.value_cents if previous else None,
        monthly_change_cents=change,
        monthly_change_rate=rate,
        valuation_date=current.valuation_date,
        status="current"
        if current.valuation_date >= date.today().replace(day=1)
        else "stale",
    )


@router.get("/metadata/categories", response_model=list[CategoryResponse])
def list_categories(domain: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Category).filter(Category.is_archived.is_(False))
    if domain:
        if domain not in {"asset", "income", "expense"}:
            raise HTTPException(422, "invalid category domain")
        query = query.filter(Category.domain == domain)
    return query.order_by(
        Category.domain, Category.is_default.desc(), Category.id
    ).all()


@router.post("/metadata/categories", response_model=CategoryResponse)
def create_category(request: CategoryCreate, db: Session = Depends(get_db)):
    code = (
        "custom_"
        + hashlib.sha1(
            f"{request.domain}:{request.name}:{_now().isoformat()}".encode()
        ).hexdigest()[:10]
    )
    row = Category(
        domain=request.domain,
        code=code,
        name=request.name.strip(),
        is_default=False,
        is_archived=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/metadata/categories/{category_id}")
def archive_category(category_id: int, db: Session = Depends(get_db)):
    row = db.get(Category, category_id)
    if row is None:
        raise HTTPException(404, "category not found")
    if row.is_default:
        raise HTTPException(409, "default categories cannot be deleted")
    row.is_archived = True
    db.commit()
    return {"ok": True}


@router.get("/assets", response_model=list[AssetResponse])
def list_assets(
    role: str | None = None,
    category_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.is_archived.is_(False))
    )
    if role:
        query = query.filter(Asset.household_role == role)
    if category_id:
        query = query.filter(Asset.category_id == category_id)
    return [
        _asset_schema(db, row) for row in query.order_by(Asset.updated_at.desc()).all()
    ]


@router.post("/assets", response_model=AssetResponse)
def create_asset(request: AssetCreate, db: Session = Depends(get_db)):
    _category(db, request.category_id, "asset")
    asset = Asset(
        name=request.name.strip(),
        category_id=request.category_id,
        channel=request.channel.strip(),
        household_role=request.household_role,
        note=request.note,
    )
    db.add(asset)
    db.flush()
    db.add(
        AssetSnapshot(
            asset_id=asset.id,
            valuation_date=request.valuation_date,
            value_cents=request.current_value_cents,
            source="manual",
        )
    )
    db.commit()
    db.refresh(asset)
    return _asset_schema(db, asset)


@router.patch("/assets/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, request: AssetUpdate, db: Session = Depends(get_db)):
    asset = (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.id == asset_id, Asset.is_archived.is_(False))
        .first()
    )
    if asset is None:
        raise HTTPException(404, "asset not found")
    values = request.model_dump(exclude_unset=True)
    current_value = values.pop("current_value_cents", None)
    valuation_date = values.pop("valuation_date", None)
    if "category_id" in values:
        _category(db, values["category_id"], "asset")
    for key, value in values.items():
        setattr(asset, key, value.strip() if isinstance(value, str) else value)
    if current_value is not None or valuation_date is not None:
        latest = _latest_snapshots(db, asset)[0]
        snapshot_date = valuation_date or latest.valuation_date
        snapshot_value = (
            current_value if current_value is not None else latest.value_cents
        )
        snapshot = (
            db.query(AssetSnapshot)
            .filter(
                AssetSnapshot.asset_id == asset.id,
                AssetSnapshot.valuation_date == snapshot_date,
            )
            .first()
        )
        if snapshot:
            snapshot.value_cents = snapshot_value
            snapshot.updated_at = _now()
        else:
            db.add(
                AssetSnapshot(
                    asset_id=asset.id,
                    valuation_date=snapshot_date,
                    value_cents=snapshot_value,
                    source="manual",
                )
            )
    db.commit()
    db.refresh(asset)
    return _asset_schema(db, asset)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(404, "asset not found")
    db.delete(asset)
    db.commit()
    return {"ok": True}


@router.get("/cashflows", response_model=CashflowPage)
def list_cashflows(
    month: str | None = None,
    flow_type: str | None = None,
    role: str | None = None,
    category_id: int | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    query = db.query(Cashflow).options(joinedload(Cashflow.category))
    if month:
        start, end, _ = _month_bounds(month)
        query = query.filter(
            Cashflow.transaction_date >= start, Cashflow.transaction_date < end
        )
    if flow_type:
        query = query.filter(Cashflow.flow_type == flow_type)
    if role:
        query = query.filter(Cashflow.household_role == role)
    if category_id:
        query = query.filter(Cashflow.category_id == category_id)
    if search:
        query = query.filter(Cashflow.description.ilike(f"%{search.strip()}%"))
    total = query.count()
    rows = (
        query.order_by(Cashflow.transaction_date.desc(), Cashflow.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return CashflowPage(
        items=[_cashflow_schema(row) for row in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/cashflows", response_model=CashflowResponse)
def create_cashflow(request: CashflowCreate, db: Session = Depends(get_db)):
    domain = (
        "income"
        if request.flow_type == "income"
        else "expense"
        if request.flow_type in {"expense", "expense_refund"}
        else None
    )
    _category(db, request.category_id, domain) if request.category_id else None
    fingerprint = _fingerprint(
        request.transaction_date,
        request.description,
        request.amount_cents,
        request.flow_type,
        request.channel,
        request.card_last_four,
    )
    row = Cashflow(**request.model_dump(), fingerprint=fingerprint)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _cashflow_schema(row)


@router.patch("/cashflows/{cashflow_id}", response_model=CashflowResponse)
def update_cashflow(
    cashflow_id: int, request: CashflowUpdate, db: Session = Depends(get_db)
):
    row = (
        db.query(Cashflow)
        .options(joinedload(Cashflow.category))
        .filter(Cashflow.id == cashflow_id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "cashflow not found")
    values = request.model_dump(exclude_unset=True)
    for key, value in values.items():
        setattr(row, key, value)
    domain = (
        "income"
        if row.flow_type == "income"
        else "expense"
        if row.flow_type in {"expense", "expense_refund"}
        else None
    )
    if row.category_id:
        _category(db, row.category_id, domain)
    row.fingerprint = _fingerprint(
        row.transaction_date,
        row.description,
        row.amount_cents,
        row.flow_type,
        row.channel,
        row.card_last_four,
    )
    db.commit()
    db.refresh(row)
    return _cashflow_schema(row)


@router.post("/cashflows/bulk-delete")
def bulk_delete_cashflows(
    request: CashflowBulkDeleteRequest, db: Session = Depends(get_db)
):
    deleted = (
        db.query(Cashflow)
        .filter(Cashflow.id.in_(request.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted_count": deleted}


@router.delete("/cashflows/month/{month}")
def delete_cashflow_month(month: str, db: Session = Depends(get_db)):
    start, end, selected = _month_bounds(month)
    deleted = (
        db.query(Cashflow)
        .filter(Cashflow.transaction_date >= start, Cashflow.transaction_date < end)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "month": selected, "deleted_count": deleted}


@router.delete("/cashflows/{cashflow_id}")
def delete_cashflow(cashflow_id: int, db: Session = Depends(get_db)):
    row = db.get(Cashflow, cashflow_id)
    if row is None:
        raise HTTPException(404, "cashflow not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/imports/preview", response_model=ImportPreview)
async def preview_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    if not content:
        raise HTTPException(
            422, {"code": "pdf_empty", "message": "PDF 文件为空，请重新选择文件"}
        )
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(
            413, {"code": "pdf_too_large", "message": "PDF 超过 20 MB，请压缩后重试"}
        )
    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            422, {"code": "pdf_invalid", "message": "所选文件不是有效的 PDF"}
        )
    digest = hashlib.sha256(content).hexdigest()
    try:
        extracted_text = extract_text_from_pdf(io.BytesIO(content)).strip()
    except Exception as exc:
        message = str(exc).lower()
        if "password" in message or "encrypted" in message:
            detail = {
                "code": "pdf_encrypted",
                "message": "该 PDF 已加密，请先取消密码保护后再上传",
            }
        else:
            detail = {
                "code": "pdf_corrupt",
                "message": "PDF 文件损坏或格式不受支持，请重新导出后再试",
            }
        raise HTTPException(422, detail) from exc
    if not extracted_text:
        raise HTTPException(
            422,
            {
                "code": "pdf_no_text",
                "message": "该 PDF 是扫描件或图片型账单，暂时无法直接提取文字；请先进行 OCR，或将识别后的文本粘贴到“智能录入”",
            },
        )
    return ImportPreview(
        filename=file.filename or "账单.pdf",
        content_sha256=digest,
        text=extracted_text,
        source_type="pdf",
    )


@router.post("/imports/text-preview", response_model=ImportPreview)
def preview_text(payload: dict, db: Session = Depends(get_db)):
    text = str(payload.get("text", "")).strip()
    if not text:
        raise HTTPException(422, "text is required")
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return ImportPreview(
        filename=str(payload.get("filename") or "粘贴文本"),
        content_sha256=digest,
        text=text,
        source_type="text",
    )


def _candidate_response(row: ReviewCandidate) -> ReviewCandidateResponse:
    payload = json.loads(row.payload_json)
    if (
        row.candidate_type == "asset_snapshot"
        and payload.get("category_code") == "social_security"
    ):
        payload["category_code"] = "provident_fund"
    return ReviewCandidateResponse(
        id=row.id,
        candidate_type=row.candidate_type,
        payload=payload,
        status=row.status,
    )


@router.get("/imports/review-queue", response_model=list[ReviewBatchResponse])
def review_queue(db: Session = Depends(get_db)):
    batches = (
        db.query(ImportBatch)
        .join(ReviewCandidate, ReviewCandidate.import_id == ImportBatch.id)
        .filter(ReviewCandidate.status == "pending")
        .options(joinedload(ImportBatch.review_candidates))
        .order_by(ImportBatch.imported_at.asc(), ImportBatch.id.asc())
        .distinct()
        .all()
    )
    return [
        ReviewBatchResponse(
            import_id=batch.id,
            filename=batch.filename,
            source_type=batch.source_type,
            import_kind=batch.import_kind,
            imported_at=batch.imported_at,
            candidates=[
                _candidate_response(candidate)
                for candidate in batch.review_candidates
                if candidate.status == "pending"
            ],
        )
        for batch in batches
    ]


@router.delete("/imports/{import_id}/review")
def discard_review_batch(import_id: int, db: Session = Depends(get_db)):
    batch = db.get(ImportBatch, import_id)
    if batch is None or batch.status != "review":
        raise HTTPException(404, "待复核导入不存在")
    candidate_count = len(batch.review_candidates)
    db.delete(batch)
    db.commit()
    return {"ok": True, "discarded_candidates": candidate_count}


def _normalize_candidate_category(
    db: Session,
    candidate_type: str,
    payload: dict,
) -> bool:
    if candidate_type == "asset_snapshot":
        category = _category_by_code(db, payload.get("category_code"), "asset")
        payload["category_code"] = category.code
        return category.code in REVIEW_CATEGORY_CODES
    _normalize_cashflow_direction(payload)
    flow_type = str(payload.get("flow_type") or "expense")
    if flow_type == "transfer":
        payload.pop("category_code", None)
        return False
    domain = "income" if flow_type == "income" else "expense"
    category = _category_by_code(db, payload.get("category_code"), domain)
    payload["category_code"] = category.code
    return category.code in REVIEW_CATEGORY_CODES


def _mark_candidate_for_review(
    candidate: ReviewCandidate, payload: dict, reason: str
) -> None:
    if candidate.candidate_type == "asset_snapshot":
        payload["category_code"] = "needs_review_asset"
    elif str(payload.get("flow_type") or "expense") == "income":
        payload["category_code"] = "needs_review_income"
    else:
        payload["category_code"] = "needs_review"
    candidate.payload_json = json.dumps(payload, ensure_ascii=False)
    candidate.warning = reason
    candidate.status = "pending"


def _commit_candidate_payload(
    db: Session,
    batch: ImportBatch,
    candidate: ReviewCandidate,
    payload: dict,
    candidate_type: str,
    pending_asset_snapshots: dict[tuple[int, date], AssetSnapshot],
) -> tuple[date | None, bool]:
    candidate.candidate_type = candidate_type
    if candidate_type == "cashflow":
        _normalize_cashflow_direction(payload)
    candidate.payload_json = json.dumps(payload, ensure_ascii=False)
    if candidate_type == "cashflow":
        try:
            tx_date = date.fromisoformat(str(payload["transaction_date"])[:10])
            flow_type = str(payload.get("flow_type", "expense"))
            if flow_type not in FLOW_VALUES:
                raise ValueError("invalid flow type")
            amount = _money_to_cents(payload.get("amount"))
            description = str(payload.get("description") or "未命名流水").strip()
            channel = str(payload.get("channel") or "").strip() or None
            role = str(payload.get("household_role") or "shared")
            role = role if role in ROLE_VALUES else "shared"
            card = str(payload.get("card_last_four") or "").strip() or None
            domain = (
                "income"
                if flow_type == "income"
                else "expense"
                if flow_type in {"expense", "expense_refund"}
                else None
            )
            category = (
                _category_by_code(db, payload.get("category_code"), domain)
                if domain
                else None
            )
            fingerprint = _fingerprint(
                tx_date, description, amount, flow_type, channel, card
            )
        except (KeyError, ValueError) as exc:
            raise HTTPException(422, f"候选流水字段不完整: {candidate.id}") from exc
        db.add(
            Cashflow(
                transaction_date=tx_date,
                description=description,
                amount_cents=amount,
                flow_type=flow_type,
                category_id=category.id if category else None,
                channel=channel,
                household_role=role,
                card_last_four=card,
                fingerprint=fingerprint,
                import_id=batch.id,
            )
        )
        candidate.status = "confirmed"
        return tx_date, True

    try:
        valuation_date = date.fromisoformat(str(payload["valuation_date"])[:10])
        value_cents = _money_to_cents(payload.get("value"))
        name = str(payload.get("name") or "未命名资产").strip()
        channel = str(payload.get("channel") or "其他").strip()
        role = str(payload.get("household_role") or "shared")
        role = role if role in ROLE_VALUES else "shared"
        category = _category_by_code(db, payload.get("category_code"), "asset")
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, f"候选资产字段不完整: {candidate.id}") from exc
    asset = (
        db.query(Asset)
        .filter(
            Asset.name == name,
            Asset.channel == channel,
            Asset.household_role == role,
            Asset.is_archived.is_(False),
        )
        .first()
    )
    if asset is None:
        asset = Asset(
            name=name, category_id=category.id, channel=channel, household_role=role
        )
        db.add(asset)
        db.flush()
    snapshot_key = (asset.id, valuation_date)
    snapshot = pending_asset_snapshots.get(snapshot_key)
    if snapshot is None:
        snapshot = (
            db.query(AssetSnapshot)
            .filter(
                AssetSnapshot.asset_id == asset.id,
                AssetSnapshot.valuation_date == valuation_date,
            )
            .first()
        )
    if snapshot:
        snapshot.value_cents = value_cents
        snapshot.source = "import"
    else:
        snapshot = AssetSnapshot(
            asset_id=asset.id,
            valuation_date=valuation_date,
            value_cents=value_cents,
            source="import",
        )
        db.add(snapshot)
    pending_asset_snapshots[snapshot_key] = snapshot
    candidate.status = "confirmed"
    return valuation_date, True


@router.post("/imports/extract", response_model=ImportExtractResponse)
async def extract_import(request: ImportExtractRequest, db: Session = Depends(get_db)):
    if _setting(db, "llm_extraction_enabled", "true") != "true":
        raise HTTPException(409, "智能提取已在设置中关闭")
    api_key = _setting(db, "api_key")
    if not api_key:
        raise HTTPException(400, "请先在设置中配置 LLM API Key")
    try:
        extracted = await analyze_financial_records(
            request.text,
            api_key,
            _setting(db, "base_url", "https://openrouter.ai/api/v1"),
            _setting(db, "model_name", DEFAULT_LLM_MODEL),
            request.import_kind,
            instruction=request.instruction,
            images=[image.model_dump() for image in request.images],
        )
    except Exception as exc:
        prefix = (
            "图片识别失败，请确认设置中的模型支持视觉输入"
            if request.images
            else "智能提取失败"
        )
        raise HTTPException(502, f"{prefix}: {exc}") from exc
    batch = ImportBatch(
        filename=request.filename,
        content_sha256=request.content_sha256,
        source_type=request.source_type,
        import_kind=request.import_kind,
        status="review",
        imported_at=_now(),
    )
    db.add(batch)
    db.flush()
    pending_rows: list[ReviewCandidate] = []
    pending_asset_snapshots: dict[tuple[int, date], AssetSnapshot] = {}
    dates: list[date] = []
    auto_committed = 0
    auto_assets = 0
    auto_cashflows = 0
    asset_months: set[str] = set()
    cashflow_months: set[str] = set()
    candidate_count = 0
    for item in extracted:
        payload = dict(item)
        candidate_type = str(
            item.get("candidate_type")
            or ("asset_snapshot" if "value" in item else "cashflow")
        )
        if candidate_type not in {"cashflow", "asset_snapshot"}:
            continue
        candidate_count += 1
        row = ReviewCandidate(
            import_id=batch.id,
            candidate_type=candidate_type,
            payload_json=json.dumps(payload, ensure_ascii=False),
            confidence=0,
            warning=None,
            status="pending",
            created_at=_now(),
        )
        db.add(row)
        db.flush()
        try:
            requires_review = _normalize_candidate_category(db, candidate_type, payload)
        except (HTTPException, ValueError):
            requires_review = True
            _mark_candidate_for_review(
                row, payload, "分类或记录类型无法确定，请人工复核"
            )
        if requires_review:
            row.payload_json = json.dumps(payload, ensure_ascii=False)
            pending_rows.append(row)
            continue
        try:
            committed_date, committed = _commit_candidate_payload(
                db,
                batch,
                row,
                payload,
                candidate_type,
                pending_asset_snapshots,
            )
        except HTTPException:
            _mark_candidate_for_review(
                row, payload, "日期、金额或必填字段无法确定，请人工复核"
            )
            pending_rows.append(row)
            continue
        if committed_date:
            dates.append(committed_date)
            if candidate_type == "asset_snapshot":
                asset_months.add(committed_date.strftime("%Y-%m"))
            else:
                cashflow_months.add(committed_date.strftime("%Y-%m"))
        auto_committed += int(committed)
        if committed:
            if candidate_type == "asset_snapshot":
                auto_assets += 1
            else:
                auto_cashflows += 1
    if candidate_count == 0:
        db.rollback()
        raise HTTPException(
            422, "未识别到可录入记录；本次内容未被标记为已导入，可以修改提示后重试"
        )
    batch.status = "review" if pending_rows else "committed"
    if dates:
        batch.period_start, batch.period_end = min(dates), max(dates)
    db.commit()
    for row in pending_rows:
        db.refresh(row)
    return ImportExtractResponse(
        import_id=batch.id,
        filename=batch.filename,
        auto_committed_count=auto_committed,
        auto_committed_assets=auto_assets,
        auto_committed_cashflows=auto_cashflows,
        pending_review_count=len(pending_rows),
        asset_months=sorted(asset_months),
        cashflow_months=sorted(cashflow_months),
        candidates=[_candidate_response(row) for row in pending_rows],
    )


@router.post("/imports/{import_id}/commit", response_model=ImportSummary)
def commit_import(
    import_id: int, request: ImportCommitRequest, db: Session = Depends(get_db)
):
    batch = db.get(ImportBatch, import_id)
    if batch is None or batch.status != "review":
        raise HTTPException(404, "待复核导入不存在")
    candidates = {row.id: row for row in batch.review_candidates}
    pending_asset_snapshots: dict[tuple[int, date], AssetSnapshot] = {}
    dates: list[date] = []
    for item in request.candidates:
        candidate = candidates.get(item.id)
        if candidate is None or candidate.status != "pending":
            raise HTTPException(422, f"invalid candidate: {item.id}")
        if not item.include:
            candidate.status = "ignored"
            continue
        payload = item.payload
        candidate_type = item.candidate_type or candidate.candidate_type
        committed_date, _ = _commit_candidate_payload(
            db,
            batch,
            candidate,
            payload,
            candidate_type,
            pending_asset_snapshots,
        )
        if committed_date:
            dates.append(committed_date)
    batch.status = "committed"
    if dates:
        batch.period_start, batch.period_end = min(dates), max(dates)
    db.commit()
    return _import_summary(batch)


def _import_summary(batch: ImportBatch) -> ImportSummary:
    return ImportSummary(
        id=batch.id,
        filename=batch.filename,
        content_sha256=batch.content_sha256,
        source_type=batch.source_type,
        import_kind=batch.import_kind,
        status=batch.status,
        imported_at=batch.imported_at,
        candidate_count=len(batch.review_candidates),
        committed_count=sum(
            row.status == "confirmed" for row in batch.review_candidates
        ),
    )


@router.get("/imports", response_model=list[ImportSummary])
def list_imports(db: Session = Depends(get_db)):
    rows = (
        db.query(ImportBatch)
        .options(joinedload(ImportBatch.review_candidates))
        .order_by(ImportBatch.imported_at.desc())
        .all()
    )
    return [_import_summary(row) for row in rows]


def _asset_total_as_of(db: Session, as_of: date) -> int:
    assets = db.query(Asset).filter(Asset.is_archived.is_(False)).all()
    total = 0
    for asset in assets:
        snapshots = _latest_snapshots(db, asset, as_of)
        if snapshots:
            total += snapshots[0].value_cents
    return total


def _cashflow_totals(rows: list[Cashflow]) -> tuple[int, int, int]:
    income = sum(row.amount_cents for row in rows if row.flow_type == "income")
    expense = sum(row.amount_cents for row in rows if row.flow_type == "expense")
    refunds = sum(row.amount_cents for row in rows if row.flow_type == "expense_refund")
    net_expense = max(0, expense - refunds)
    return income, net_expense, income - net_expense


@router.get("/analytics/overview")
def overview_analytics(month: str | None = None, db: Session = Depends(get_db)):
    start, end, selected = _month_bounds(month)
    cashflows = (
        db.query(Cashflow)
        .filter(Cashflow.transaction_date >= start, Cashflow.transaction_date < end)
        .all()
    )
    income, expense, balance = _cashflow_totals(cashflows)
    today = date.today()
    as_of = min(today, end - timedelta(days=1))
    total_assets = _asset_total_as_of(db, as_of)
    assets = (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.is_archived.is_(False))
        .all()
    )
    structure: dict[str, int] = {}
    stale: list[dict] = []
    for asset in assets:
        snapshots = _latest_snapshots(db, asset, as_of)
        if not snapshots:
            continue
        structure[asset.category.name] = (
            structure.get(asset.category.name, 0) + snapshots[0].value_cents
        )
        if snapshots[0].valuation_date < start:
            stale.append(
                {
                    "asset_id": asset.id,
                    "name": asset.name,
                    "valuation_date": snapshots[0].valuation_date.isoformat(),
                }
            )
    trend = []
    cashflow_trend = []
    for offset in range(-5, 1):
        mstart = _shift_month(start, offset)
        mend = _shift_month(mstart, 1)
        month_rows = (
            db.query(Cashflow)
            .filter(
                Cashflow.transaction_date >= mstart, Cashflow.transaction_date < mend
            )
            .all()
        )
        mi, me, mb = _cashflow_totals(month_rows)
        trend.append(
            {
                "month": mstart.strftime("%Y-%m"),
                "value_cents": _asset_total_as_of(db, mend - timedelta(days=1)),
            }
        )
        cashflow_trend.append(
            {
                "month": mstart.strftime("%Y-%m"),
                "income_cents": mi,
                "expense_cents": me,
                "balance_cents": mb,
            }
        )
    categories: dict[tuple[str, str], int] = {}
    for row in cashflows:
        if row.flow_type == "transfer":
            continue
        direction = "income" if row.flow_type == "income" else "expense"
        signed = (
            -row.amount_cents if row.flow_type == "expense_refund" else row.amount_cents
        )
        label = row.category.name if row.category else "转账"
        categories[(direction, label)] = categories.get((direction, label), 0) + signed
    return {
        "month": selected,
        "metrics": {
            "total_assets_cents": total_assets,
            "income_cents": income,
            "expense_cents": expense,
            "balance_cents": balance,
        },
        "asset_trend": trend,
        "asset_structure": [
            {"name": name, "value_cents": value}
            for name, value in sorted(
                structure.items(), key=lambda item: item[1], reverse=True
            )
        ],
        "cashflow_trend": cashflow_trend,
        "top_income": [
            {"name": name, "value_cents": value}
            for (direction, name), value in sorted(
                categories.items(), key=lambda item: item[1], reverse=True
            )
            if direction == "income"
        ][:5],
        "top_expense": [
            {"name": name, "value_cents": value}
            for (direction, name), value in sorted(
                categories.items(), key=lambda item: item[1], reverse=True
            )
            if direction == "expense"
        ][:5],
        "attention": {
            "stale_assets": stale,
            "pending_review_count": db.query(ReviewCandidate)
            .filter(ReviewCandidate.status == "pending")
            .count(),
        },
    }


@router.get("/analytics/assets")
def asset_analytics(db: Session = Depends(get_db)):
    assets = (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.is_archived.is_(False))
        .all()
    )
    rows = [_asset_schema(db, asset) for asset in assets]
    current_total = sum(row.current_value_cents for row in rows)
    previous_total = sum(
        row.previous_value_cents
        if row.previous_value_cents is not None
        else row.current_value_cents
        for row in rows
    )
    month_start = date.today().replace(day=1)
    complete = sum(row.valuation_date >= month_start for row in rows)
    return {
        "total_assets_cents": current_total,
        "monthly_change_cents": current_total - previous_total,
        "snapshot_completeness": complete / len(rows) if rows else 0,
        "updated_assets": complete,
        "total_assets": len(rows),
    }


@router.get("/analytics/cashflow")
def cashflow_analytics(month: str | None = None, db: Session = Depends(get_db)):
    start, end, selected = _month_bounds(month)
    rows = (
        db.query(Cashflow)
        .options(joinedload(Cashflow.category))
        .filter(Cashflow.transaction_date >= start, Cashflow.transaction_date < end)
        .all()
    )
    income, expense, balance = _cashflow_totals(rows)
    breakdown: dict[tuple[str, str], int] = {}
    for row in rows:
        if row.flow_type == "transfer":
            continue
        direction = "income" if row.flow_type == "income" else "expense"
        value = (
            -row.amount_cents if row.flow_type == "expense_refund" else row.amount_cents
        )
        label = row.category.name if row.category else "未分类"
        breakdown[(direction, label)] = breakdown.get((direction, label), 0) + value
    return {
        "month": selected,
        "income_cents": income,
        "expense_cents": expense,
        "balance_cents": balance,
        "pending_review_count": db.query(ReviewCandidate)
        .filter(ReviewCandidate.status == "pending")
        .count(),
        "income_breakdown": [
            {"name": name, "value_cents": value}
            for (kind, name), value in breakdown.items()
            if kind == "income"
        ],
        "expense_breakdown": [
            {"name": name, "value_cents": value}
            for (kind, name), value in breakdown.items()
            if kind == "expense" and value > 0
        ],
    }


@router.get("/insights")
def insights(month: str | None = None, db: Session = Depends(get_db)):
    start, end, selected = _month_bounds(month)
    previous_start = _shift_month(start, -1)
    current = (
        db.query(Cashflow)
        .filter(Cashflow.transaction_date >= start, Cashflow.transaction_date < end)
        .all()
    )
    previous = (
        db.query(Cashflow)
        .filter(
            Cashflow.transaction_date >= previous_start,
            Cashflow.transaction_date < start,
        )
        .all()
    )
    ci, ce, cb = _cashflow_totals(current)
    pi, pe, pb = _cashflow_totals(previous)
    result = []
    if pi:
        change = (ci - pi) / pi
        result.append(
            {
                "severity": "positive" if change >= 0 else "neutral",
                "title": "本月收入变化",
                "summary": f"本月收入较上月{'增加' if change >= 0 else '减少'} {abs(change):.1%}。",
                "evidence": f"{selected} 收入 ¥{ci / 100:,.2f}；上月 ¥{pi / 100:,.2f}",
                "source": "已确认收支流水",
                "link": f"/cashflow?month={selected}&type=income",
            }
        )
    if pe:
        change = (ce - pe) / pe
        result.append(
            {
                "severity": "warning" if change > 0.15 else "neutral",
                "title": "本月支出变化",
                "summary": f"扣除退款后，本月支出较上月{'增加' if change >= 0 else '减少'} {abs(change):.1%}。",
                "evidence": f"{selected} 支出 ¥{ce / 100:,.2f}；上月 ¥{pe / 100:,.2f}",
                "source": "已确认收支流水",
                "link": f"/cashflow?month={selected}&type=expense",
            }
        )
    result.append(
        {
            "severity": "positive" if cb >= 0 else "warning",
            "title": "家庭现金结余",
            "summary": "本月收入高于净支出。"
            if cb >= 0
            else "本月净支出高于收入，需要留意现金流。",
            "evidence": f"{selected} 现金结余 ¥{cb / 100:,.2f}",
            "source": "收入减去支出（已扣除退款）",
            "link": f"/cashflow?month={selected}",
        }
    )
    stale_count = 0
    for asset in db.query(Asset).filter(Asset.is_archived.is_(False)).all():
        snapshots = _latest_snapshots(db, asset)
        stale_count += bool(snapshots and snapshots[0].valuation_date < start)
    if stale_count:
        result.append(
            {
                "severity": "warning",
                "title": "资产快照待更新",
                "summary": f"有 {stale_count} 项资产尚未录入本月快照，资产总额可能不是最新状态。",
                "evidence": f"检查周期：{selected}",
                "source": "资产估值日期",
                "link": "/assets?status=stale",
            }
        )
    pending = (
        db.query(ReviewCandidate).filter(ReviewCandidate.status == "pending").count()
    )
    if pending:
        result.append(
            {
                "severity": "warning",
                "title": "智能录入待复核",
                "summary": f"有 {pending} 条模型提取结果尚未确认，不会计入资产或收支。",
                "evidence": "模型结果必须人工确认后入账",
                "source": "待复核导入",
                "link": "/cashflow?review=pending",
            }
        )
    return {"month": selected, "items": result}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    defaults = {
        "husband_name": "丈夫",
        "wife_name": "妻子",
        "default_role": "shared",
        "api_key": "",
        "base_url": "https://openrouter.ai/api/v1",
        "model_name": DEFAULT_LLM_MODEL,
        "llm_extraction_enabled": "true",
    }
    return {
        **{key: _setting(db, key, value) for key, value in defaults.items()},
        "api_key": _setting(db, "api_key") and "••••••••",
        "llm_extraction_enabled": _setting(db, "llm_extraction_enabled", "true")
        == "true",
        "language": "简体中文",
    }


@router.put("/settings")
def update_settings(request: SettingsUpdate, db: Session = Depends(get_db)):
    values = request.model_dump(exclude_unset=True)
    for key, value in values.items():
        if key == "api_key" and value == "••••••••":
            continue
        _set_setting(
            db, key, str(value).lower() if isinstance(value, bool) else str(value)
        )
    db.commit()
    return {"ok": True}


@router.get("/data/export")
def export_data(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["类型", "日期", "名称/描述", "分类", "渠道", "家庭角色", "金额(元)"]
    )
    for asset in (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.is_archived.is_(False))
        .all()
    ):
        latest = _latest_snapshots(db, asset)
        if latest:
            writer.writerow(
                [
                    "资产",
                    latest[0].valuation_date,
                    asset.name,
                    asset.category.name,
                    asset.channel,
                    asset.household_role,
                    latest[0].value_cents / 100,
                ]
            )
    for row in (
        db.query(Cashflow)
        .options(joinedload(Cashflow.category))
        .order_by(Cashflow.transaction_date)
        .all()
    ):
        writer.writerow(
            [
                row.flow_type,
                row.transaction_date,
                row.description,
                row.category.name if row.category else "",
                row.channel or "",
                row.household_role,
                row.amount_cents / 100,
            ]
        )
    data = output.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=smart-finance-export.csv"
        },
    )


@router.delete("/data/reset")
def reset_data(confirmation: str = Query(...), db: Session = Depends(get_db)):
    if confirmation != "清空全部数据":
        raise HTTPException(422, "confirmation mismatch")
    db.query(ReviewCandidate).delete()
    db.query(Cashflow).delete()
    db.query(ImportBatch).delete()
    db.query(AssetSnapshot).delete()
    db.query(Asset).delete()
    db.commit()
    return {"ok": True}


@router.post("/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    api_key = _setting(db, "api_key")
    if not api_key:
        raise HTTPException(400, "请先在设置中配置 LLM API Key")
    rows = (
        db.query(Cashflow)
        .options(joinedload(Cashflow.category))
        .order_by(Cashflow.transaction_date)
        .all()
    )
    dataframe = pd.DataFrame(
        [
            {
                "Date": row.transaction_date,
                "Description": row.description,
                "AmountCents": -row.amount_cents
                if row.flow_type == "expense_refund"
                else row.amount_cents
                if row.flow_type == "expense"
                else -row.amount_cents,
                "CategoryCode": row.category.code if row.category else "other_expense",
                "ImportId": row.import_id,
                "CardLastFour": row.card_last_four,
            }
            for row in rows
        ]
    )

    async def generator():
        async for token in stream_chat_with_data(
            request.history,
            request.message,
            dataframe,
            api_key,
            _setting(db, "base_url", "https://openrouter.ai/api/v1"),
            _setting(db, "model_name", DEFAULT_LLM_MODEL),
            language="zh",
        ):
            yield token

    return StreamingResponse(generator(), media_type="text/plain")
