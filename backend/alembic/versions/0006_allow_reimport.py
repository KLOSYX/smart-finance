"""Allow the same source content to be imported more than once."""

from __future__ import annotations

from alembic import op


revision = "0006_allow_reimport"
down_revision = "0005_review_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_statement_imports_content_sha256", table_name="statement_imports")
    op.create_index(
        "ix_statement_imports_content_sha256",
        "statement_imports",
        ["content_sha256"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_statement_imports_content_sha256", table_name="statement_imports")
    op.create_index(
        "ix_statement_imports_content_sha256",
        "statement_imports",
        ["content_sha256"],
        unique=True,
    )
