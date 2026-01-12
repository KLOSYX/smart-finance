from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import endpoints
from app.core.database import init_db

app = FastAPI(title="Smart Finance API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB
init_db()

app.include_router(endpoints.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to Smart Finance API"}
