# AI Financial Assistant Backend

The FastAPI-based backend for the Smart Finance application, handling transaction processing, database management, and AI integration.

## Features

- **Robust API**: RESTful endpoints built with FastAPI.
- **PDF Processing**: Parses credit card statements using `pdfplumber`.
- **Privacy First**: Automatically masks sensitive information before processing.
- **AI Analysis**: Uses LangChain and OpenAI Models to classify transactions.
- **Financial Advice**: Generates personalized financial insights.
- **Database**: SQLite storage with SQLAlchemy ORM.

## Setup

1. Install dependencies (using uv):
   ```bash
   uv sync
   ```

2. Run the development server:
   ```bash
   uv run uvicorn app.main:app --reload --port 8000
   ```

   - API Base URL: `http://localhost:8000`
   - Interactive Docs: `http://localhost:8000/docs`
