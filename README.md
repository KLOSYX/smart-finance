# Smart Finance

Smart Finance is an intelligent personal finance system designed to automate the tedious process of expense tracking. By leveraging advanced **Large Language Models (LLMs)**, it transforms raw credit card statements into actionable financial insights.

## Core Features

### 1. 💳 Intelligent Credit Card Bill Analysis
Stop entering data manually. Smart Finance allows you to:
- **Parse PDF Statements**: Upload your credit card bills (PDF) directly.
- **Privacy-First Extraction**: Automatically extracts transaction details while anonymizing sensitive text *before* sending data for analysis.
- **AI Classification**: Uses high-intelligence models (like Qwen-Max/Gemini) to accurately categorize messy merchant names into clean categories (e.g., "Dining", "Transport", "Shopping").

### 2. 🤖 AI Agent Expenditure Analysis
Beyond simple charts, our AI Agent acts as your personal CFO:
- **Interactive Analysis**: Chat with your financial data. Ask "How much did I spend on coffee last month?" or "Where can I save money?".
- **Spending Patterns**: The agent identifies recurring payments, abnormal spending spikes, and lifestyle inflation trends.
- **Actionable Advice**: Receive tailored suggestions on budget optimization based on your actual spending history.

### 3. 📊 Comprehensive Dashboard
- **Visual Overview**: Clear breakdown of expenses by category and card.
- **Transaction Management**: Search, filter, and manually adjust any transaction record.
- **Portfolio Tracking**: Keep track of your investment assets alongside your expenses.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Ant Design Pro Components, MUI
- **Backend**: Python, FastAPI, Pandas, SQLAlchemy
- **AI Integration**: LangChain, OpenRouter (supporting various LLMs)

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

Use the provided start script:

```bash
./start.sh
```

### Configuration

Once running, go to **Settings** in the web UI to configure your LLM Provider (API Key, Base URL) and financial profile.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
