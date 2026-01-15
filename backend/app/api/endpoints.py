from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
import pandas as pd
import io

from app.core.database import get_db
from app.models.transaction import (
    Transaction as TransactionModel,
    Settings as SettingsModel,
)
from app.schemas import (
    Transaction,
    TransactionCreate,
    TransactionUpdate,
    SettingsUpdate,
    ChatRequest,
    TextAnalysisRequest,
)
from app.services.pdf_processor import extract_text_from_pdf, anonymize_text
from app.services.llm_client import analyze_transactions

router = APIRouter()


def get_setting(db: Session, key: str, default: str = ""):
    setting = db.query(SettingsModel).filter(SettingsModel.key == key).first()
    return setting.value if setting else default


def set_setting(db: Session, key: str, value: str):
    setting = db.query(SettingsModel).filter(SettingsModel.key == key).first()
    if not setting:
        setting = SettingsModel(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    db.commit()


@router.get("/transactions", response_model=List[Transaction])
def read_transactions(
    skip: int = 0, limit: int = 1000, db: Session = Depends(get_db)
):  # Increased limit
    transactions = (
        db.query(TransactionModel)
        .order_by(TransactionModel.date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return transactions


@router.post("/transactions", response_model=Transaction)
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    db_transaction = TransactionModel(**transaction.model_dump())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


@router.patch("/transactions/{transaction_id}", response_model=Transaction)
def update_transaction(
    transaction_id: int, transaction: TransactionUpdate, db: Session = Depends(get_db)
):
    db_transaction = (
        db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    )
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    update_data = transaction.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_transaction, key, value)

    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    db_transaction = (
        db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    )
    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(db_transaction)
    db.commit()
    return {"ok": True}


@router.delete("/transactions")
def delete_all_transactions(db: Session = Depends(get_db)):
    db.query(TransactionModel).delete()
    db.commit()
    return {"ok": True}


@router.post("/parse_pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """
    Step 1: Parse PDF and return anonymized text for user review.
    Does NOT save to DB yet.
    """
    content = await file.read()

    # 1. Extract
    try:
        raw_text = extract_text_from_pdf(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(e)}")

    # 2. Anonymize
    clean_text = anonymize_text(raw_text)

    return {
        "filename": file.filename,
        "text": clean_text,
        "message": "PDF parsed successfully. Please review the text before analysis.",
    }


@router.post("/analyze_text")
async def analyze_text(request: TextAnalysisRequest, db: Session = Depends(get_db)):
    """
    Step 2: Analyze the REVIEWED text and save transactions to DB.
    """
    api_key = get_setting(db, "api_key")
    base_url = get_setting(db, "base_url", "https://openrouter.ai/api/v1")
    model_name = get_setting(db, "model_name", "qwen/qwen3-next-80b-a3b-instruct")

    if not api_key:
        raise HTTPException(status_code=400, detail="API Key not configured")

    # 3. Analyze with LLM
    try:
        extracted_data = await analyze_transactions(
            request.text, api_key, base_url, model_name, request.language
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM analysis failed: {str(e)}")

    # 4. Save to DB
    saved_count = 0
    added_transactions = []
    for item in extracted_data:
        # Convert date string to datetime object if possible
        try:
            date_obj = pd.to_datetime(item.get("Date")).to_pydatetime()
        except Exception:
            date_obj = None

        trans = TransactionModel(
            date=date_obj,
            description=item.get("Description", "Unknown"),
            amount=float(item.get("Amount", 0)),
            category=item.get("Category", "Other"),
            source=request.source_filename,
            card_last_four=item.get("CardLastFour"),
        )
        db.add(trans)
        added_transactions.append(trans)
        saved_count += 1

    db.commit()

    # Refresh to get IDs
    for t in added_transactions:
        db.refresh(t)

    return {
        "message": "Successfully analyzed text",
        "transactions_added": saved_count,
        "transactions": added_transactions,
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    keys = ["api_key", "base_url", "model_name", "monthly_income", "investments"]
    return {k: get_setting(db, k) for k in keys}


@router.post("/settings")
def update_settings(settings: SettingsUpdate, db: Session = Depends(get_db)):
    if settings.api_key is not None:
        set_setting(db, "api_key", settings.api_key)
    if settings.base_url is not None:
        set_setting(db, "base_url", settings.base_url)
    if settings.model_name is not None:
        set_setting(db, "model_name", settings.model_name)
    if settings.monthly_income is not None:
        set_setting(db, "monthly_income", str(settings.monthly_income))
    if settings.investments is not None:
        set_setting(db, "investments", str(settings.investments))
    return {"status": "updated"}


@router.post("/chat")
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    api_key = get_setting(db, "api_key")
    base_url = get_setting(db, "base_url", "https://openrouter.ai/api/v1")
    model_name = get_setting(db, "model_name", "qwen/qwen3-next-80b-a3b-instruct")

    if not api_key:
        raise HTTPException(status_code=400, detail="API Key not configured")

    # Load transactions for context
    transactions = db.query(TransactionModel).all()
    if not transactions:
        return StreamingResponse(
            iter(["No transaction data available yet. Please upload a PDF first."]),
            media_type="text/plain",
        )

    # Convert SQLAlchemy models to dicts for DataFrame
    data = [
        {
            "Date": t.date,
            "Description": t.description,
            "Amount": t.amount,
            "Category": t.category,
            "Source": t.source,
        }
        for t in transactions
    ]

    df = pd.DataFrame(data)

    # Get financial context
    income = float(get_setting(db, "monthly_income", "0"))
    investments = float(get_setting(db, "investments", "0"))

    # Use the streaming service function
    # Note: endpoints must import the new stream_chat_with_data function
    from app.services.llm_client import stream_chat_with_data

    return StreamingResponse(
        stream_chat_with_data(
            request.history,
            request.message,
            df,
            api_key,
            base_url,
            model_name,
            income,
            investments,
            request.language,
        ),
        media_type="text/plain",
    )


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    transactions = db.query(TransactionModel).all()
    if not transactions:
        return {"total_expense": 0, "category_summary": []}

    data = [
        {"Amount": t.amount, "Category": t.category, "CardLastFour": t.card_last_four}
        for t in transactions
    ]
    df = pd.DataFrame(data)

    # Simple aggregation
    # Filter positive amounts (expenses)
    expenses = df[df["Amount"] > 0].copy()

    total = expenses["Amount"].sum()
    cat_summary = (
        expenses.groupby("Category")["Amount"]
        .sum()
        .reset_index()
        .to_dict(orient="records")
    )

    # Card Summary
    expenses["CardLastFour"] = expenses["CardLastFour"].fillna("Unknown")
    card_summary = (
        expenses.groupby("CardLastFour")["Amount"]
        .sum()
        .reset_index()
        .to_dict(orient="records")
    )

    return {
        "total_expense": total,
        "category_summary": cat_summary,
        "card_summary": card_summary,
    }
