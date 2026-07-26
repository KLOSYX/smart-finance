"""Use GPT-5.6 Luna as the default multimodal model."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0004_multimodal_default_model"
down_revision = "0003_add_provident_fund_category"
branch_labels = None
depends_on = None

OLD_DEFAULT = "qwen/qwen3-next-80b-a3b-instruct"
NEW_DEFAULT = "openai/gpt-5.6-luna"


def upgrade() -> None:
    op.get_bind().execute(
        sa.text("UPDATE settings SET value = :new WHERE key = 'model_name' AND value = :old"),
        {"new": NEW_DEFAULT, "old": OLD_DEFAULT},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("UPDATE settings SET value = :old WHERE key = 'model_name' AND value = :new"),
        {"old": OLD_DEFAULT, "new": NEW_DEFAULT},
    )
