"""Add fixed pending-review categories to every financial domain."""

from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision = "0005_review_categories"
down_revision = "0004_multimodal_default_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    created_at = datetime.now(timezone.utc)
    for domain, code in (
        ("asset", "needs_review_asset"),
        ("income", "needs_review_income"),
    ):
        exists = bind.execute(
            sa.text("SELECT 1 FROM categories WHERE domain = :domain AND code = :code"),
            {"domain": domain, "code": code},
        ).first()
        if exists is None:
            bind.execute(
                sa.text(
                    "INSERT INTO categories(domain, code, name, is_default, is_archived, created_at) "
                    "VALUES (:domain, :code, '待复核', 1, 0, :created_at)"
                ),
                {"domain": domain, "code": code, "created_at": created_at},
            )
    bind.execute(
        sa.text(
            "UPDATE categories SET name = '待复核' "
            "WHERE domain = 'expense' AND code = 'needs_review'"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM categories WHERE "
            "(domain = 'asset' AND code = 'needs_review_asset') OR "
            "(domain = 'income' AND code = 'needs_review_income')"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE categories SET name = '需要复核' "
            "WHERE domain = 'expense' AND code = 'needs_review'"
        )
    )
