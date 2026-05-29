# Pi Agent Migration Design

## Goal

Migrate the chat agent from LangChain's pandas dataframe agent to a dedicated Node.js pi-agent runtime while keeping the existing FastAPI backend and frontend chat contract stable.

## Current State

The current chat flow lives in `backend/app/services/llm_client.py`.

- PDF transaction extraction uses LangChain prompt chains and should remain in Python for this migration.
- Chat uses `create_pandas_dataframe_agent` with `allow_dangerous_code=True`.
- FastAPI streams plain text from `/api/chat` to the frontend.
- Transaction data is loaded from SQLAlchemy models, converted into a pandas DataFrame, and passed to the dataframe agent.

This migration focuses only on the chat agent. It does not change PDF parsing, transaction storage, dashboard statistics, or frontend screens unless a small API compatibility adjustment is required.

## Target Architecture

Add a Node.js sidecar under `agent/` that uses `@earendil-works/pi-coding-agent` as the agent SDK.

FastAPI remains the public backend. For `/api/chat`, FastAPI will:

1. Load transactions and user financial context from the database.
2. Build a compact JSON payload with the current message, recent history, language, financial context, and transaction rows.
3. Spawn or invoke the Node pi-agent runner.
4. Stream text chunks from the runner back to the existing frontend.

The Node agent runner will:

1. Create a pi-agent session with a finance-specific system prompt.
2. Register custom transaction-analysis tools.
3. Disable broad built-in coding tools for app chat usage.
4. Send the user's finance question to the agent.
5. Emit newline-delimited JSON events to stdout so Python can stream text safely.

## Files And Responsibilities

- `agent/package.json`: Node package metadata, scripts, and pi-agent dependency.
- `agent/src/index.ts`: CLI entrypoint that reads one JSON request from stdin and streams JSON events to stdout.
- `agent/src/financeAgent.ts`: Builds the pi-agent session, system prompt, custom tools, and event subscriptions.
- `agent/src/financeTools.ts`: Pure transaction aggregation and query helpers exposed to pi-agent as tools.
- `agent/src/types.ts`: Shared request, transaction, event, and tool result types.
- `backend/app/services/pi_agent_client.py`: Python async subprocess client for the Node runner.
- `backend/app/services/llm_client.py`: Remove LangChain dataframe agent chat path and delegate chat streaming to `pi_agent_client`.
- `backend/app/api/endpoints.py`: Keep the `/chat` response shape and pass DB-derived payload to the new service.
- `backend/pyproject.toml`: Remove `langchain-experimental` if no longer needed after the chat migration.
- `backend/tests/test_pi_agent_client.py`: Unit tests for subprocess event parsing and failure handling.
- `agent/tests/financeTools.test.ts`: Unit tests for deterministic finance tools.

## Data Contract

FastAPI sends a single JSON object to the Node runner through stdin:

```json
{
  "message": "这个月餐饮花了多少？",
  "history": [{"role": "user", "content": "上次问过交通"}],
  "language": "zh",
  "financialContext": {
    "monthlyIncome": 12000,
    "investments": 50000
  },
  "transactions": [
    {
      "date": "2026-05-01T00:00:00",
      "description": "Cafe",
      "amount": 38.5,
      "category": "餐饮",
      "source": "statement.pdf",
      "cardLastFour": "1234"
    }
  ]
}
```

The Node runner emits newline-delimited JSON:

```json
{"type":"status","message":"tool:start:summarize_transactions"}
{"type":"text","delta":"本月餐饮支出为 ¥38.50。"}
{"type":"error","message":"Agent Error: ..."}
{"type":"done"}
```

Python forwards `text.delta` chunks to the frontend. `status` events can be converted into short human-readable progress lines. `error` events produce a concise agent error message.

## Agent Tools

The pi-agent runtime will not receive filesystem or shell tools for this application chat path. It receives only finance tools backed by the request payload:

- `summarize_transactions`: Totals net spend, positive spend, refunds, category totals, card totals, and date range.
- `filter_transactions`: Filters by category, date range, amount sign, card suffix, and text search.
- `top_merchants`: Groups descriptions and returns top merchants by spend or refund.
- `budget_metrics`: Computes income-aware metrics such as net spending, estimated savings, savings rate, and investment ratio when monthly income or investments are available.

These tools are deterministic TypeScript functions. The model reasons over tool outputs instead of writing arbitrary pandas code.

## Prompt Boundaries

The system prompt will instruct the agent to:

- Answer in the requested language.
- Discuss only personal finance, transaction analysis, budgeting, and spending behavior.
- Treat positive amounts as spending and negative amounts as refunds or credits.
- Use tools for calculations instead of estimating from raw rows.
- Avoid legal, tax, investment product, or medical advice.
- Avoid exposing hidden chain-of-thought; provide concise reasoning summaries and concrete numbers.

## Error Handling

FastAPI handles missing API key before invoking the Node runner, preserving current behavior.

The Python subprocess client handles:

- Node executable missing: stream a clear setup error.
- Agent package missing: stream a clear install error.
- Invalid JSON events: ignore malformed diagnostic lines and continue.
- Non-zero exit: stream stderr summary if no prior error was emitted.
- Timeout or cancellation: terminate the subprocess.

The Node runner handles:

- Invalid stdin JSON: emit an `error` event and exit non-zero.
- Agent creation failure: emit an `error` event and exit non-zero.
- Tool execution failure: return a tool error result for the model when possible.

## Testing

Backend tests will mock subprocess execution and verify:

- Text events stream only their deltas.
- Status events are converted to readable progress text.
- Error events are surfaced.
- Non-zero process exits produce a helpful fallback message.

Node tests will verify the deterministic finance tools:

- Category summary treats positive spending and negative refunds correctly.
- Filters handle category, date, card suffix, and search text.
- Budget metrics calculate savings rate only when income is positive.

End-to-end manual verification will run:

- `uv run pytest tests/test_pi_agent_client.py`
- `npm test` in `agent/`
- A local chat request against `/api/chat` when dependencies and API credentials are available.

## Rollout

The migration is intentionally direct: `/api/chat` uses pi-agent after this branch lands. The old pandas dataframe agent path is removed from chat code to avoid maintaining two agent stacks. PDF extraction may continue to use LangChain OpenAI chat wrappers because that is a separate extraction workflow.

## Out Of Scope

- Rebuilding the frontend chat UI.
- Changing database schema.
- Reworking PDF extraction prompts.
- Adding long-term memory across chat sessions.
- Adding autonomous file, shell, or code editing tools to the finance chat agent.
