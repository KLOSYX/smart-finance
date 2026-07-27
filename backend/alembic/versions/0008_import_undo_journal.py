"""Add per-record undo journals for reversible smart imports."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0008_import_undo_journal"
down_revision = "0007_import_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("review_candidates") as batch_op:
        batch_op.add_column(sa.Column("undo_payload_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("review_candidates") as batch_op:
        batch_op.drop_column("undo_payload_json")
