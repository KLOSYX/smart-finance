"""Track smart-entry progress, failures, and retries."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0007_import_tracking"
down_revision = "0006_allow_reimport"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("statement_imports") as batch_op:
        batch_op.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("completed_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("error_message", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("request_payload_json", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1")
        )
    op.execute(
        "UPDATE statement_imports "
        "SET updated_at = imported_at, "
        "completed_at = CASE WHEN status = 'committed' THEN imported_at ELSE NULL END"
    )


def downgrade() -> None:
    with op.batch_alter_table("statement_imports") as batch_op:
        batch_op.drop_column("attempt_count")
        batch_op.drop_column("request_payload_json")
        batch_op.drop_column("error_message")
        batch_op.drop_column("completed_at")
        batch_op.drop_column("updated_at")
