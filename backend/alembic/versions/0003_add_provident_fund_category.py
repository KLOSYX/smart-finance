"""Add housing provident fund as a built-in asset category."""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0003_add_provident_fund_category"
down_revision = "0002_household_finance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT id FROM categories WHERE domain = 'asset' AND code = 'provident_fund'")
    ).first()
    if existing is None:
        bind.execute(
            sa.text(
                "INSERT INTO categories(domain, code, name, is_default, is_archived, created_at) "
                "VALUES ('asset', 'provident_fund', '住房公积金', 1, 0, :created_at)"
            ),
            {"created_at": datetime.now(timezone.utc)},
        )


def downgrade() -> None:
    bind = op.get_bind()
    referenced = bind.execute(
        sa.text(
            "SELECT 1 FROM assets a JOIN categories c ON c.id = a.category_id "
            "WHERE c.domain = 'asset' AND c.code = 'provident_fund' LIMIT 1"
        )
    ).first()
    if referenced is None:
        bind.execute(
            sa.text("DELETE FROM categories WHERE domain = 'asset' AND code = 'provident_fund'")
        )
