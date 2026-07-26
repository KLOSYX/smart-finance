from __future__ import annotations

import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


DATABASE_URL = os.getenv("SMART_FINANCE_DATABASE_URL", "sqlite:///./sql_app.db")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
    if DATABASE_URL.startswith("sqlite")
    else {},
)


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def ensure_database() -> None:
    """Run the one-way schema migration before serving requests."""
    if DATABASE_URL.startswith("sqlite:///"):
        database_path = Path(DATABASE_URL.removeprefix("sqlite:///"))
        if not database_path.is_absolute():
            database_path = Path.cwd() / database_path
        if database_path.exists():
            with sqlite3.connect(database_path) as connection:
                has_revision = connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
                ).fetchone()
            if not has_revision:
                backup = database_path.with_name(
                    f"{database_path.stem}.pre-ledger-{datetime.now():%Y%m%d%H%M%S}{database_path.suffix}.bak"
                )
                shutil.copy2(database_path, backup)

    alembic_config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(alembic_config, "head")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
