from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Role = Literal["husband", "wife", "shared"]
FlowType = Literal["income", "expense", "expense_refund", "transfer"]
Domain = Literal["asset", "income", "expense"]


class CategoryCreate(BaseModel):
    domain: Domain
    name: str = Field(min_length=1, max_length=50)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    domain: Domain
    code: str
    name: str
    is_default: bool
    is_archived: bool


class AssetBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category_id: int
    channel: str = Field(min_length=1, max_length=100)
    household_role: Role = "shared"
    note: str | None = Field(default=None, max_length=1000)


class AssetCreate(AssetBase):
    current_value_cents: int = Field(ge=0)
    valuation_date: date


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category_id: int | None = None
    channel: str | None = Field(default=None, min_length=1, max_length=100)
    household_role: Role | None = None
    note: str | None = Field(default=None, max_length=1000)
    current_value_cents: int | None = Field(default=None, ge=0)
    valuation_date: date | None = None


class AssetResponse(AssetBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_name: str
    current_value_cents: int
    previous_value_cents: int | None
    monthly_change_cents: int
    monthly_change_rate: float | None
    valuation_date: date
    status: Literal["current", "stale"]


class CashflowBase(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=500)
    amount_cents: int = Field(gt=0, le=100_000_000_00)
    flow_type: FlowType
    category_id: int | None = None
    channel: str | None = Field(default=None, max_length=100)
    household_role: Role = "shared"
    card_last_four: str | None = Field(default=None, max_length=4)


class CashflowCreate(CashflowBase):
    pass


class CashflowUpdate(BaseModel):
    transaction_date: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    amount_cents: int | None = Field(default=None, gt=0, le=100_000_000_00)
    flow_type: FlowType | None = None
    category_id: int | None = None
    channel: str | None = Field(default=None, max_length=100)
    household_role: Role | None = None
    card_last_four: str | None = Field(default=None, max_length=4)


class CashflowResponse(CashflowBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_name: str | None
    import_id: int | None


class CashflowPage(BaseModel):
    items: list[CashflowResponse]
    page: int
    page_size: int
    total: int


class CashflowBulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=1000)

    @field_validator("ids")
    @classmethod
    def unique_positive_ids(cls, values: list[int]) -> list[int]:
        if any(value <= 0 for value in values):
            raise ValueError("cashflow ids must be positive")
        return list(dict.fromkeys(values))


class ImportPreview(BaseModel):
    filename: str
    content_sha256: str
    text: str
    source_type: Literal["pdf", "text", "file"]


class ImportImageInput(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    mime_type: Literal["image/jpeg", "image/png", "image/webp"]
    data_url: str = Field(min_length=32, max_length=7_500_000)

    @model_validator(mode="after")
    def validate_data_url(self):
        expected_prefix = f"data:{self.mime_type};base64,"
        if not self.data_url.startswith(expected_prefix):
            raise ValueError("image data URL does not match its MIME type")
        return self


class ImportExtractRequest(BaseModel):
    filename: str = Field(min_length=1)
    content_sha256: str = Field(min_length=64, max_length=64)
    text: str = Field(default="", max_length=200_000)
    source_type: Literal["pdf", "text", "file"] = "text"
    import_kind: Literal["cashflow", "asset", "mixed"] = "mixed"
    instruction: str | None = Field(default=None, max_length=4_000)
    images: list[ImportImageInput] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def require_source_content(self):
        if not self.text.strip() and not self.images:
            raise ValueError("text or at least one image is required")
        return self


class ReviewCandidateResponse(BaseModel):
    id: int
    candidate_type: Literal["cashflow", "asset_snapshot"]
    payload: dict[str, Any]
    status: Literal["pending", "confirmed", "ignored"]


class ImportExtractResponse(BaseModel):
    import_id: int
    filename: str
    auto_committed_count: int
    auto_committed_assets: int
    auto_committed_cashflows: int
    pending_review_count: int
    asset_months: list[str]
    cashflow_months: list[str]
    candidates: list[ReviewCandidateResponse]


class ReviewBatchResponse(BaseModel):
    import_id: int
    filename: str
    source_type: str
    import_kind: str
    imported_at: datetime
    candidates: list[ReviewCandidateResponse]


class ReviewCandidateUpdate(BaseModel):
    id: int
    candidate_type: Literal["cashflow", "asset_snapshot"] | None = None
    payload: dict[str, Any]
    include: bool = True


class ImportCommitRequest(BaseModel):
    candidates: list[ReviewCandidateUpdate]


class ImportSummary(BaseModel):
    id: int
    filename: str
    content_sha256: str | None
    source_type: str
    import_kind: str
    status: str
    imported_at: datetime
    candidate_count: int
    committed_count: int


class SettingsUpdate(BaseModel):
    husband_name: str | None = None
    wife_name: str | None = None
    default_role: Role | None = None
    api_key: str | None = None
    base_url: str | None = None
    model_name: str | None = None
    llm_extraction_enabled: bool | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[dict[str, Any]] = Field(default_factory=list)


class ResetRequest(BaseModel):
    confirmation: Literal["清空全部数据"]
