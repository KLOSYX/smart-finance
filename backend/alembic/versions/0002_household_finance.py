"""Upgrade the expense ledger to household assets and cashflow.

This is intentionally a breaking, one-way migration. Existing expense rows are
preserved as shared-household cashflows; negative legacy rows become expense
refunds and all stored amounts become positive.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

from app.models.category import DEFAULT_CATEGORIES, normalize_legacy_expense_category


revision = "0002_household_finance"
down_revision = "0001_long_term_ledger"
branch_labels = None
depends_on = None


def _fingerprint(row) -> str:
    raw = "|".join(
        (
            str(row["transaction_date"]),
            str(row["description"] or "").strip().lower(),
            str(abs(int(row["amount_cents"]))),
            "expense_refund" if int(row["amount_cents"]) < 0 else "expense",
            str(row["card_last_four"] or ""),
        )
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    with op.batch_alter_table("statement_imports") as batch:
        batch.add_column(sa.Column("source_type", sa.String(), nullable=False, server_default="pdf"))
        batch.add_column(sa.Column("import_kind", sa.String(), nullable=False, server_default="cashflow"))
        batch.add_column(sa.Column("status", sa.String(), nullable=False, server_default="committed"))

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("domain", sa.String(), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("domain", "code", name="uq_categories_domain_code"),
    )
    op.create_index("ix_categories_domain", "categories", ["domain"])

    category_ids: dict[str, int] = {}
    for domain, rows in DEFAULT_CATEGORIES.items():
        for code, name in rows:
            result = bind.execute(
                sa.text(
                    "INSERT INTO categories(domain, code, name, is_default, is_archived, created_at) "
                    "VALUES (:domain, :code, :name, 1, 0, :created_at)"
                ),
                {"domain": domain, "code": code, "name": name, "created_at": now},
            )
            category_ids[code] = result.lastrowid

    op.create_table(
        "reporting_months",
        sa.Column("month", sa.String(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    bind.execute(
        sa.text(
            "INSERT INTO reporting_months(month, status, completed_at, updated_at) "
            "SELECT month, status, completed_at, updated_at FROM expense_months"
        )
    )

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("household_role", sa.String(), nullable=False, server_default="shared"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_assets_category_id", "assets", ["category_id"])
    op.create_index("ix_assets_household_role", "assets", ["household_role"])

    op.create_table(
        "asset_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("valuation_date", sa.Date(), nullable=False),
        sa.Column("value_cents", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("asset_id", "valuation_date", name="uq_asset_snapshot_date"),
    )
    op.create_index("ix_asset_snapshots_asset_id", "asset_snapshots", ["asset_id"])
    op.create_index("ix_asset_snapshots_valuation_date", "asset_snapshots", ["valuation_date"])

    op.create_table(
        "cashflow_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("flow_type", sa.String(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("channel", sa.String(), nullable=True),
        sa.Column("household_role", sa.String(), nullable=False, server_default="shared"),
        sa.Column("card_last_four", sa.String(), nullable=True),
        sa.Column("fingerprint", sa.String(), nullable=False),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("statement_imports.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_cashflow_transactions_flow_type", "cashflow_transactions", ["flow_type"])
    op.create_index("ix_cashflow_transactions_category_id", "cashflow_transactions", ["category_id"])
    op.create_index("ix_cashflow_transactions_household_role", "cashflow_transactions", ["household_role"])
    op.create_index("ix_cashflow_transactions_fingerprint", "cashflow_transactions", ["fingerprint"])
    op.create_index("ix_cashflow_transactions_import_id", "cashflow_transactions", ["import_id"])
    op.create_index("ix_cashflow_date_type", "cashflow_transactions", ["transaction_date", "flow_type"])
    op.create_index("ix_cashflow_date_category", "cashflow_transactions", ["transaction_date", "category_id"])

    rows = bind.execute(
        sa.text(
            "SELECT id, transaction_date, description, amount_cents, category_code, "
            "card_last_four, import_id, created_at, updated_at FROM transactions ORDER BY id"
        )
    ).mappings().all()
    for row in rows:
        flow_type = "expense_refund" if int(row["amount_cents"]) < 0 else "expense"
        category_code = normalize_legacy_expense_category(row["category_code"])
        bind.execute(
            sa.text(
                "INSERT INTO cashflow_transactions("
                "id, transaction_date, description, amount_cents, flow_type, category_id, channel, household_role, "
                "card_last_four, fingerprint, import_id, created_at, updated_at"
                ") VALUES ("
                ":id, :transaction_date, :description, :amount_cents, :flow_type, :category_id, NULL, 'shared', "
                ":card_last_four, :fingerprint, :import_id, :created_at, :updated_at)"
            ),
            {
                "id": row["id"],
                "transaction_date": row["transaction_date"],
                "description": row["description"],
                "amount_cents": abs(int(row["amount_cents"])),
                "flow_type": flow_type,
                "category_id": category_ids[category_code],
                "card_last_four": row["card_last_four"],
                "fingerprint": _fingerprint(row),
                "import_id": row["import_id"],
                "created_at": row["created_at"] or now,
                "updated_at": row["updated_at"] or now,
            },
        )

    op.create_table(
        "review_candidates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("statement_imports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("candidate_type", sa.String(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("warning", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_review_candidates_import_id", "review_candidates", ["import_id"])
    op.create_index("ix_review_candidates_status", "review_candidates", ["status"])

    op.drop_table("transactions")
    op.drop_table("expense_months")


def downgrade() -> None:
    raise RuntimeError("The household finance migration is intentionally one-way.")
