from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class TransactionBase(BaseModel):
    date: datetime
    description: str
    amount: float
    category: str
    source: str = "manual"
    card_last_four: Optional[str] = None


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[datetime] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    source: Optional[str] = None
    card_last_four: Optional[str] = None


class Transaction(TransactionBase):
    id: int

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    monthly_income: Optional[float] = None
    investments: Optional[float] = None


class ChatRequest(BaseModel):
    message: str
    history: List[dict] = []
    language: str = "zh"


class TextAnalysisRequest(BaseModel):
    text: str
    source_filename: str
    language: str = "zh"
