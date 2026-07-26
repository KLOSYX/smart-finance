from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import endpoints
from app.core.database import ensure_database

app = FastAPI(title="Smart Finance API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upgrade the database before serving requests. The migration is one-way and
# creates a timestamped backup when it encounters a pre-ledger SQLite file.
ensure_database()

app.include_router(endpoints.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to Smart Finance API"}
