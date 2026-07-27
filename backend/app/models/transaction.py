from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship


Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("domain", "code", name="uq_categories_domain_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String, nullable=False, index=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    is_archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class ImportBatch(Base):
    __tablename__ = "statement_imports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String, nullable=False)
    content_sha256 = Column(String, nullable=True, index=True)
    source_type = Column(String, nullable=False, default="pdf")
    import_kind = Column(String, nullable=False, default="cashflow")
    status = Column(String, nullable=False, default="review")
    period_start = Column(Date, nullable=True)
    period_end = Column(Date, nullable=True)
    imported_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    request_payload_json = Column(Text, nullable=True)
    attempt_count = Column(Integer, nullable=False, default=1)

    cashflows = relationship(
        "Cashflow", back_populates="import_batch", passive_deletes=True
    )
    review_candidates = relationship(
        "ReviewCandidate",
        back_populates="import_batch",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ReportingMonth(Base):
    __tablename__ = "reporting_months"

    month = Column(String, primary_key=True)
    status = Column(String, nullable=False, default="open")
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=False, index=True
    )
    channel = Column(String, nullable=False)
    household_role = Column(String, nullable=False, default="shared", index=True)
    note = Column(Text, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    category = relationship("Category")
    snapshots = relationship(
        "AssetSnapshot",
        back_populates="asset",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class AssetSnapshot(Base):
    __tablename__ = "asset_snapshots"
    __table_args__ = (
        UniqueConstraint("asset_id", "valuation_date", name="uq_asset_snapshot_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    asset_id = Column(
        Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    valuation_date = Column(Date, nullable=False, index=True)
    value_cents = Column(Integer, nullable=False)
    source = Column(String, nullable=False, default="manual")
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    asset = relationship("Asset", back_populates="snapshots")


class Cashflow(Base):
    __tablename__ = "cashflow_transactions"
    __table_args__ = (
        Index("ix_cashflow_date_type", "transaction_date", "flow_type"),
        Index("ix_cashflow_date_category", "transaction_date", "category_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    transaction_date = Column(Date, nullable=False)
    description = Column(String, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    flow_type = Column(String, nullable=False, index=True)
    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    channel = Column(String, nullable=True)
    household_role = Column(String, nullable=False, default="shared", index=True)
    card_last_four = Column(String, nullable=True)
    fingerprint = Column(String, nullable=False, index=True)
    import_id = Column(
        Integer,
        ForeignKey("statement_imports.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    category = relationship("Category")
    import_batch = relationship("ImportBatch", back_populates="cashflows")


class ReviewCandidate(Base):
    __tablename__ = "review_candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    import_id = Column(
        Integer,
        ForeignKey("statement_imports.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_type = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
    confidence = Column(Float, nullable=False, default=0)
    warning = Column(String, nullable=True)
    undo_payload_json = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    import_batch = relationship("ImportBatch", back_populates="review_candidates")


class Settings(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False, default="")
