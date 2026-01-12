from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String, index=True)
    amount = Column(Float)
    category = Column(String, index=True)
    source = Column(String)  # e.g. "manual", "statement_jan.pdf"

    # Optional: Original raw text or metadata
    raw_text = Column(String, nullable=True)


class Settings(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(String)
