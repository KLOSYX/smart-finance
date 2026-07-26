from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config


def test_legacy_transactions_migrate_to_household_cashflow(tmp_path, monkeypatch):
    database = tmp_path / "legacy.db"
    connection = sqlite3.connect(database)
    connection.executescript(
        """
        create table transactions (id integer primary key, date datetime, description text, amount real, category text, source text, card_last_four text, raw_text text);
        create table settings (key text primary key, value text);
        insert into settings values ('model_name', 'qwen/qwen3-next-80b-a3b-instruct');
        insert into transactions values (1, '2026-05-02', 'Cafe', 12.34, '餐饮', 'may.pdf', '1234', null);
        insert into transactions values (2, '2026-05-03', 'Refund', -8.00, 'Transportation', 'manual', null, null);
        """
    )
    connection.commit()
    connection.close()

    monkeypatch.setenv("SMART_FINANCE_DATABASE_URL", f"sqlite:///{database}")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    connection = sqlite3.connect(database)
    tables = {row[0] for row in connection.execute("select name from sqlite_master where type='table'")}
    assert {"assets", "asset_snapshots", "cashflow_transactions", "review_candidates", "categories"} <= tables
    assert "transactions" not in tables
    rows = connection.execute(
        "select transaction_date, amount_cents, flow_type, household_role, fingerprint from cashflow_transactions order by id"
    ).fetchall()
    assert rows[0][:4] == ("2026-05-02", 1234, "expense", "shared")
    assert rows[1][:4] == ("2026-05-03", 800, "expense_refund", "shared")
    assert len(rows[0][4]) == 64
    assert connection.execute("select value from settings where key = 'model_name'").fetchone()[0] == "openai/gpt-5.6-luna"
    review_categories = connection.execute(
        "select domain, code, name from categories where name = '待复核' order by domain"
    ).fetchall()
    assert review_categories == [
        ("asset", "needs_review_asset", "待复核"),
        ("expense", "needs_review", "待复核"),
        ("income", "needs_review_income", "待复核"),
    ]
    content_hash_index = next(
        row for row in connection.execute("pragma index_list('statement_imports')").fetchall()
        if row[1] == "ix_statement_imports_content_sha256"
    )
    assert content_hash_index[2] == 0
    connection.close()
