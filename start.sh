#!/bin/bash

# Function to kill background processes on exit
cleanup() {
    echo "Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

echo "Starting Backend (FastAPI)..."
cd backend
uv run uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

echo "Starting Frontend (Vite)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "Servers are running."
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop."

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID
