"""Create the long-term monthly expense ledger.

The first revision also imports rows from the previous transactions table when
upgrading an existing installation. It deliberately fails before creating a
partial ledger if a legacy row has no usable date.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from alembic import op
import sqlalchemy as sa


revision = "0001_long_term_ledger"
down_revision = None
branch_labels = None
depends_on = None


ALIASES = {
    "住房": "housing", "housing": "housing",
    "餐饮": "dining", "food & dining": "dining", "food": "dining", "dining": "dining",
    "交通": "transportation", "transportation": "transportation",
    "公用事业": "utilities", "utilities": "utilities",
    "购物": "shopping", "shopping": "shopping",
    "娱乐": "entertainment", "entertainment": "entertainment",
    "健康与健身": "health_fitness", "health & fitness": "health_fitness", "health": "health_fitness",
    "旅行": "travel", "travel": "travel",
    "教育": "education", "education": "education",
    "债务": "debt", "debt": "debt",
    "储蓄/投资": "savings_investments", "savings/investments": "savings_investments", "savings_investments": "savings_investments",
    "需要复核": "needs_review", "needs review": "needs_review", "needs_review": "needs_review",
    "其他": "other", "other": "other",
}


def _parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _amount_cents(value) -> int:
    try:
        return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError) as exc:
        raise RuntimeError(f"legacy amount is invalid: {value!r}") from exc


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    legacy_rows = []

    if "transactions" in tables:
        legacy_rows = bind.execute(sa.text("SELECT id, date, description, amount, category, source, card_last_four FROM transactions ORDER BY id")).mappings().all()
        invalid = [row["id"] for row in legacy_rows if _parse_date(row["date"]) is None]
        if invalid:
            raise RuntimeError(f"legacy transactions have invalid dates: {invalid}")
        op.rename_table("transactions", "legacy_transactions")

    op.create_table(
        "statement_imports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_sha256", sa.String(), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_statement_imports_content_sha256", "statement_imports", ["content_sha256"], unique=True)

    op.create_table(
        "expense_months",
        sa.Column("month", sa.String(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False, server_default="open"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("category_code", sa.String(), nullable=False),
        sa.Column("card_last_four", sa.String(), nullable=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("statement_imports.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_transactions_category_code", "transactions", ["category_code"])
    op.create_index("ix_transactions_card_last_four", "transactions", ["card_last_four"])
    op.create_index("ix_transactions_import_id", "transactions", ["import_id"])
    op.create_index("ix_transactions_transaction_date_category", "transactions", ["transaction_date", "category_code"])
    op.create_index("ix_transactions_transaction_date_card", "transactions", ["transaction_date", "card_last_four"])

    if legacy_rows:
        now = datetime.now(timezone.utc)
        grouped: dict[str, list] = {}
        for row in legacy_rows:
            source = (row["source"] or "manual").strip()
            if source != "manual":
                grouped.setdefault(source, []).append(row)

        import_ids: dict[str, int] = {}
        for source, rows in grouped.items():
            dates = [_parse_date(row["date"]) for row in rows]
            result = bind.execute(
                sa.text("INSERT INTO statement_imports(filename, content_sha256, period_start, period_end, imported_at) VALUES (:filename, NULL, :period_start, :period_end, :imported_at)"),
                {"filename": source, "period_start": min(dates), "period_end": max(dates), "imported_at": now},
            )
            import_ids[source] = result.lastrowid

        for row in legacy_rows:
            transaction_date = _parse_date(row["date"])
            source = (row["source"] or "manual").strip()
            bind.execute(
                sa.text("INSERT INTO transactions(id, transaction_date, description, amount_cents, category_code, card_last_four, import_id, created_at, updated_at) VALUES (:id, :transaction_date, :description, :amount_cents, :category_code, :card_last_four, :import_id, :created_at, :updated_at)"),
                {"id": row["id"], "transaction_date": transaction_date, "description": row["description"] or "Unknown", "amount_cents": _amount_cents(row["amount"]), "category_code": ALIASES.get(str(row["category"] or "other").strip().lower(), "other"), "card_last_four": row["card_last_four"], "import_id": import_ids.get(source), "created_at": now, "updated_at": now},
            )

        bind.execute(sa.text("INSERT INTO expense_months(month, status, completed_at, updated_at) SELECT DISTINCT strftime('%Y-%m', transaction_date), 'open', NULL, :updated_at FROM transactions"), {"updated_at": now})
    if "legacy_transactions" in sa.inspect(bind).get_table_names():
        op.drop_table("legacy_transactions")

    if "settings" not in tables:
        op.create_table("settings", sa.Column("key", sa.String(), primary_key=True), sa.Column("value", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    raise RuntimeError("The ledger migration is intentionally one-way.")
