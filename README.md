# Smart Finance (AI 智能理财助手)

Smart Finance is an intelligent personal finance assistant that combines a React frontend with a FastAPI backend to help you manage your finances, analyze expenses, and provide investment advice using AI.

## Features

- **AI Advisor**: Chat with an AI to analyze your spending habits and get financial advice.
- **Dashboard**: Visual overview of your financial health.
- **Transaction Management**: Record and categorize your income and expenses.
- **Portfolios**: Manage and track your investment portfolios.

## Project Structure

- `frontend/`: React application (Vite + TypeScript + MUI + Ant Design Pro Components).
- `backend/`: Python API server (FastAPI + SQLAlchemy + AI integration).

## Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.10+)
- `uv` (Python package manager)

### Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd smart-finance
    ```

2.  **Setup Backend**
    ```bash
    cd backend
    uv sync
    ```

3.  **Setup Frontend**
    ```bash
    cd frontend
    npm install
    ```

### Running the Application

You can use the provided start script to run both frontend and backend:

```bash
./start.sh
```

Or run them strictly:

**Backend:**
```bash
cd backend
uv run uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
