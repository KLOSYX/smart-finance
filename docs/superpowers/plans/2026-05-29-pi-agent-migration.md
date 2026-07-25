# Pi Agent Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/api/chat` LangChain pandas dataframe agent with a Node.js pi-agent sidecar that uses controlled finance tools and preserves the existing streaming API.

**Architecture:** FastAPI remains the public backend and sends one JSON request to a Node runner through stdin. The Node runner creates a pi-agent session with a finance-specific system prompt, custom deterministic transaction tools, and JSONL stdout events. Python parses those events and streams plain text to the frontend.

**Tech Stack:** FastAPI, Python 3.11, asyncio subprocesses, TypeScript, Vitest, `tsx`, and `@earendil-works/pi-coding-agent`.

---

## File Structure

- Create `agent/package.json`: Node sidecar scripts and dependencies.
- Create `agent/tsconfig.json`: TypeScript compiler settings for the sidecar.
- Create `agent/src/types.ts`: Shared transaction, request, and stream event types.
- Create `agent/src/financeTools.ts`: Pure deterministic transaction aggregation and filtering functions.
- Create `agent/src/financeAgent.ts`: pi-agent session construction, finance prompt, custom tools, and event streaming adapter.
- Create `agent/src/index.ts`: CLI entrypoint that reads stdin JSON and writes JSONL events.
- Create `agent/tests/financeTools.test.ts`: Unit tests for deterministic finance tools.
- Create `backend/app/services/pi_agent_client.py`: Async Python subprocess client for the Node runner.
- Modify `backend/app/services/llm_client.py`: Remove LangChain pandas agent chat execution and delegate chat streaming to `pi_agent_client`.
- Modify `backend/app/api/endpoints.py`: Build transaction rows as JSON-compatible values and call the new streaming service.
- Modify `backend/pyproject.toml`: Remove `langchain-experimental` after the dataframe agent path is gone.
- Create `backend/tests/test_pi_agent_client.py`: Unit tests for JSONL parsing and subprocess failure behavior.

## External SDK Notes

The pi SDK docs show `createAgentSession()` as the main factory, event subscriptions via `session.subscribe`, text streaming through `message_update` events with `assistantMessageEvent.type === "text_delta"`, and tool lifecycle events such as `tool_execution_start` and `tool_execution_end`. The docs also show `tools`, `customTools`, `noTools: "builtin"`, and `resourceLoader: new DefaultResourceLoader({ systemPromptOverride: ... })` as the intended way to control available tools and prompts.

## Task 1: Backend Subprocess Event Parser

**Files:**
- Create: `backend/app/services/pi_agent_client.py`
- Test: `backend/tests/test_pi_agent_client.py`

- [ ] **Step 1: Write failing parser tests**

Create `backend/tests/test_pi_agent_client.py`:

```python
import pytest

from app.services.pi_agent_client import parse_agent_event, render_agent_event


def test_parse_agent_event_returns_json_object():
    assert parse_agent_event('{"type":"text","delta":"hello"}\n') == {
        "type": "text",
        "delta": "hello",
    }


def test_parse_agent_event_ignores_invalid_json():
    assert parse_agent_event("debug line\n") is None


def test_render_text_event_returns_delta():
    assert render_agent_event({"type": "text", "delta": "hello"}) == "hello"


def test_render_status_event_returns_progress_line():
    assert (
        render_agent_event({"type": "status", "message": "tool:start:summarize_transactions"})
        == "\n> 调用工具: summarize_transactions\n"
    )


def test_render_error_event_returns_agent_error():
    assert (
        render_agent_event({"type": "error", "message": "boom"})
        == "Agent Error: boom"
    )
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run: `uv run pytest tests/test_pi_agent_client.py -q`

Expected: FAIL because `app.services.pi_agent_client` does not exist.

- [ ] **Step 3: Implement minimal parser functions**

Create `backend/app/services/pi_agent_client.py`:

```python
import json
from typing import Any


def parse_agent_event(line: str) -> dict[str, Any] | None:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) else None


def render_agent_event(event: dict[str, Any]) -> str | None:
    event_type = event.get("type")
    if event_type == "text":
        delta = event.get("delta", "")
        return delta if isinstance(delta, str) else ""
    if event_type == "status":
        message = event.get("message", "")
        if isinstance(message, str) and message.startswith("tool:start:"):
            return f"\n> 调用工具: {message.removeprefix('tool:start:')}\n"
        if isinstance(message, str) and message.startswith("tool:end:"):
            return f"\n> 工具完成: {message.removeprefix('tool:end:')}\n"
        return None
    if event_type == "error":
        message = event.get("message", "Unknown pi-agent error")
        return f"Agent Error: {message}"
    return None
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run: `uv run pytest tests/test_pi_agent_client.py -q`

Expected: PASS for parser tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pi_agent_client.py backend/tests/test_pi_agent_client.py
git commit -m "test: add pi agent event parser"
```

## Task 2: Backend Async Sidecar Client

**Files:**
- Modify: `backend/app/services/pi_agent_client.py`
- Test: `backend/tests/test_pi_agent_client.py`

- [ ] **Step 1: Add failing async streaming tests**

Append to `backend/tests/test_pi_agent_client.py`:

```python
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock


class FakeStdout:
    def __init__(self, lines):
        self._lines = [line.encode("utf-8") for line in lines]

    async def readline(self):
        if not self._lines:
            return b""
        return self._lines.pop(0)


class FakeStdin:
    def __init__(self):
        self.payload = b""
        self.closed = False

    def write(self, payload):
        self.payload += payload

    async def drain(self):
        return None

    def close(self):
        self.closed = True

    async def wait_closed(self):
        return None


class FakeProcess:
    def __init__(self, stdout_lines, stderr=b"", returncode=0):
        self.stdin = FakeStdin()
        self.stdout = FakeStdout(stdout_lines)
        self.stderr = SimpleNamespace(read=AsyncMock(return_value=stderr))
        self.returncode = returncode
        self.terminated = False

    async def wait(self):
        return self.returncode

    def terminate(self):
        self.terminated = True


@pytest.mark.asyncio
async def test_stream_pi_agent_chat_sends_request_and_yields_text(monkeypatch):
    process = FakeProcess(['{"type":"text","delta":"hello"}\n', '{"type":"done"}\n'])

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income=0,
            investments=0,
            language="en",
        )
    ]

    assert chunks == ["hello"]
    assert b'"message": "hi"' in process.stdin.payload
    assert process.stdin.closed is True


@pytest.mark.asyncio
async def test_stream_pi_agent_chat_reports_nonzero_exit(monkeypatch):
    process = FakeProcess([], stderr=b"missing package", returncode=1)

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income=0,
            investments=0,
            language="en",
        )
    ]

    assert chunks == ["Agent Error: missing package"]
```

- [ ] **Step 2: Run async tests to verify they fail**

Run: `uv run pytest tests/test_pi_agent_client.py -q`

Expected: FAIL because `stream_pi_agent_chat` does not exist.

- [ ] **Step 3: Implement subprocess streaming**

Update `backend/app/services/pi_agent_client.py`:

```python
import asyncio
import json
from pathlib import Path
from typing import Any, AsyncIterator


AGENT_DIR = Path(__file__).resolve().parents[3] / "agent"
AGENT_ENTRYPOINT = AGENT_DIR / "src" / "index.ts"


def parse_agent_event(line: str) -> dict[str, Any] | None:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) else None


def render_agent_event(event: dict[str, Any]) -> str | None:
    event_type = event.get("type")
    if event_type == "text":
        delta = event.get("delta", "")
        return delta if isinstance(delta, str) else ""
    if event_type == "status":
        message = event.get("message", "")
        if isinstance(message, str) and message.startswith("tool:start:"):
            return f"\n> 调用工具: {message.removeprefix('tool:start:')}\n"
        if isinstance(message, str) and message.startswith("tool:end:"):
            return f"\n> 工具完成: {message.removeprefix('tool:end:')}\n"
        return None
    if event_type == "error":
        message = event.get("message", "Unknown pi-agent error")
        return f"Agent Error: {message}"
    return None


async def stream_pi_agent_chat(
    *,
    message: str,
    history: list[dict[str, str]],
    transactions: list[dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    monthly_income: float,
    investments: float,
    language: str,
) -> AsyncIterator[str]:
    request = {
        "message": message,
        "history": history[-5:],
        "language": language,
        "financialContext": {
            "monthlyIncome": monthly_income,
            "investments": investments,
        },
        "llm": {
            "apiKey": api_key,
            "baseUrl": base_url,
            "model": model,
        },
        "transactions": transactions,
    }

    try:
        process = await asyncio.create_subprocess_exec(
            "npx",
            "tsx",
            str(AGENT_ENTRYPOINT),
            cwd=str(AGENT_DIR),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        yield "Agent Error: Node.js/npx is not available. Please install Node.js dependencies in the agent directory."
        return

    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    payload = json.dumps(request, ensure_ascii=False).encode("utf-8")
    process.stdin.write(payload)
    await process.stdin.drain()
    process.stdin.close()
    await process.stdin.wait_closed()

    emitted_error = False
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        event = parse_agent_event(line.decode("utf-8", errors="replace"))
        if event is None:
            continue
        rendered = render_agent_event(event)
        if rendered:
            emitted_error = event.get("type") == "error" or emitted_error
            yield rendered

    returncode = await process.wait()
    if returncode != 0 and not emitted_error:
        stderr = (await process.stderr.read()).decode("utf-8", errors="replace").strip()
        yield f"Agent Error: {stderr or f'pi-agent process exited with code {returncode}'}"
```

- [ ] **Step 4: Run async tests to verify they pass**

Run: `uv run pytest tests/test_pi_agent_client.py -q`

Expected: PASS for parser and async tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pi_agent_client.py backend/tests/test_pi_agent_client.py
git commit -m "feat: add pi agent subprocess client"
```

## Task 3: Deterministic Finance Tools

**Files:**
- Create: `agent/package.json`
- Create: `agent/tsconfig.json`
- Create: `agent/src/types.ts`
- Create: `agent/src/financeTools.ts`
- Create: `agent/tests/financeTools.test.ts`

- [ ] **Step 1: Write failing Node tests**

Create `agent/package.json`:

```json
{
  "name": "smart-finance-agent",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.77.0",
    "tsx": "^4.20.6"
  },
  "devDependencies": {
    "@types/node": "^24.10.1",
    "typescript": "~5.9.3",
    "vitest": "^4.0.0"
  }
}
```

Create `agent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src", "tests"]
}
```

Create `agent/tests/financeTools.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  budgetMetrics,
  filterTransactions,
  summarizeTransactions,
  topMerchants,
} from '../src/financeTools';
import type { FinanceTransaction } from '../src/types';

const transactions: FinanceTransaction[] = [
  { date: '2026-05-01T00:00:00', description: 'Cafe A', amount: 30, category: '餐饮', source: 'a.pdf', cardLastFour: '1234' },
  { date: '2026-05-02T00:00:00', description: 'Metro', amount: 8, category: '交通', source: 'a.pdf', cardLastFour: '1234' },
  { date: '2026-05-03T00:00:00', description: 'Cafe A Refund', amount: -10, category: '餐饮', source: 'a.pdf', cardLastFour: '1234' },
  { date: '2026-05-04T00:00:00', description: 'Book Shop', amount: 90, category: '教育', source: 'b.pdf', cardLastFour: '9876' },
];

describe('finance tools', () => {
  it('summarizes spend, refunds, categories, cards, and date range', () => {
    const summary = summarizeTransactions(transactions);

    expect(summary.netAmount).toBe(118);
    expect(summary.positiveSpend).toBe(128);
    expect(summary.refunds).toBe(-10);
    expect(summary.categoryTotals).toEqual([
      { category: '教育', netAmount: 90, positiveSpend: 90, refunds: 0, count: 1 },
      { category: '餐饮', netAmount: 20, positiveSpend: 30, refunds: -10, count: 2 },
      { category: '交通', netAmount: 8, positiveSpend: 8, refunds: 0, count: 1 },
    ]);
    expect(summary.cardTotals[0]).toEqual({ cardLastFour: '1234', netAmount: 28, count: 3 });
    expect(summary.dateRange).toEqual({ start: '2026-05-01T00:00:00', end: '2026-05-04T00:00:00' });
  });

  it('filters by category, amount sign, card suffix, and search text', () => {
    expect(filterTransactions(transactions, { category: '餐饮', amountSign: 'refund' })).toHaveLength(1);
    expect(filterTransactions(transactions, { cardLastFour: '9876' })).toHaveLength(1);
    expect(filterTransactions(transactions, { searchText: 'cafe' })).toHaveLength(2);
  });

  it('returns top merchants by spending', () => {
    expect(topMerchants(transactions, { limit: 2 })).toEqual([
      { merchant: 'Book Shop', amount: 90, count: 1 },
      { merchant: 'Cafe A', amount: 30, count: 1 },
    ]);
  });

  it('calculates budget metrics only when income is positive', () => {
    expect(budgetMetrics(transactions, { monthlyIncome: 200, investments: 50 })).toEqual({
      monthlyIncome: 200,
      investments: 50,
      netSpending: 118,
      estimatedSavings: 82,
      savingsRate: 0.41,
      investmentToIncomeRatio: 0.25,
    });
    expect(budgetMetrics(transactions, { monthlyIncome: 0, investments: 50 }).savingsRate).toBeNull();
  });
});
```

- [ ] **Step 2: Install dependencies and run tests to verify they fail**

Run: `cd agent && npm install`

Run: `cd agent && npm test`

Expected: FAIL because `src/financeTools.ts` and `src/types.ts` do not exist.

- [ ] **Step 3: Implement finance tool functions**

Create `agent/src/types.ts`:

```typescript
export interface FinanceTransaction {
  date: string | null;
  description: string;
  amount: number;
  category: string;
  source: string | null;
  cardLastFour: string | null;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentRequest {
  message: string;
  history: ChatHistoryMessage[];
  language: 'zh' | 'en' | string;
  financialContext: {
    monthlyIncome: number;
    investments: number;
  };
  llm: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  transactions: FinanceTransaction[];
}

export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
```

Create `agent/src/financeTools.ts`:

```typescript
import type { FinanceTransaction } from './types';

export interface TransactionFilter {
  category?: string;
  startDate?: string;
  endDate?: string;
  amountSign?: 'spend' | 'refund' | 'all';
  cardLastFour?: string;
  searchText?: string;
}

interface CategoryTotal {
  category: string;
  netAmount: number;
  positiveSpend: number;
  refunds: number;
  count: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveSpend(amount: number): number {
  return amount > 0 ? amount : 0;
}

function refundAmount(amount: number): number {
  return amount < 0 ? amount : 0;
}

export function summarizeTransactions(transactions: FinanceTransaction[]) {
  const dateValues = transactions
    .map((transaction) => transaction.date)
    .filter((date): date is string => Boolean(date))
    .sort();

  const categories = new Map<string, CategoryTotal>();
  const cards = new Map<string, { cardLastFour: string; netAmount: number; count: number }>();

  for (const transaction of transactions) {
    const category = transaction.category || 'Other';
    const existing = categories.get(category) ?? {
      category,
      netAmount: 0,
      positiveSpend: 0,
      refunds: 0,
      count: 0,
    };
    existing.netAmount += transaction.amount;
    existing.positiveSpend += positiveSpend(transaction.amount);
    existing.refunds += refundAmount(transaction.amount);
    existing.count += 1;
    categories.set(category, existing);

    const card = transaction.cardLastFour || 'unknown';
    const cardTotal = cards.get(card) ?? { cardLastFour: card, netAmount: 0, count: 0 };
    cardTotal.netAmount += transaction.amount;
    cardTotal.count += 1;
    cards.set(card, cardTotal);
  }

  return {
    count: transactions.length,
    netAmount: roundMoney(transactions.reduce((sum, transaction) => sum + transaction.amount, 0)),
    positiveSpend: roundMoney(transactions.reduce((sum, transaction) => sum + positiveSpend(transaction.amount), 0)),
    refunds: roundMoney(transactions.reduce((sum, transaction) => sum + refundAmount(transaction.amount), 0)),
    categoryTotals: Array.from(categories.values())
      .map((item) => ({
        ...item,
        netAmount: roundMoney(item.netAmount),
        positiveSpend: roundMoney(item.positiveSpend),
        refunds: roundMoney(item.refunds),
      }))
      .sort((left, right) => right.netAmount - left.netAmount),
    cardTotals: Array.from(cards.values())
      .map((item) => ({ ...item, netAmount: roundMoney(item.netAmount) }))
      .sort((left, right) => right.netAmount - left.netAmount),
    dateRange: {
      start: dateValues[0] ?? null,
      end: dateValues[dateValues.length - 1] ?? null,
    },
  };
}

export function filterTransactions(
  transactions: FinanceTransaction[],
  filter: TransactionFilter,
): FinanceTransaction[] {
  const searchText = filter.searchText?.toLowerCase();
  return transactions.filter((transaction) => {
    if (filter.category && transaction.category !== filter.category) return false;
    if (filter.startDate && transaction.date && transaction.date < filter.startDate) return false;
    if (filter.endDate && transaction.date && transaction.date > filter.endDate) return false;
    if (filter.amountSign === 'spend' && transaction.amount <= 0) return false;
    if (filter.amountSign === 'refund' && transaction.amount >= 0) return false;
    if (filter.cardLastFour && transaction.cardLastFour !== filter.cardLastFour) return false;
    if (searchText && !transaction.description.toLowerCase().includes(searchText)) return false;
    return true;
  });
}

export function topMerchants(
  transactions: FinanceTransaction[],
  options: { limit?: number; includeRefunds?: boolean } = {},
) {
  const limit = options.limit ?? 5;
  const grouped = new Map<string, { merchant: string; amount: number; count: number }>();
  for (const transaction of transactions) {
    if (!options.includeRefunds && transaction.amount <= 0) continue;
    const merchant = transaction.description || 'Unknown';
    const item = grouped.get(merchant) ?? { merchant, amount: 0, count: 0 };
    item.amount += transaction.amount;
    item.count += 1;
    grouped.set(merchant, item);
  }
  return Array.from(grouped.values())
    .map((item) => ({ ...item, amount: roundMoney(item.amount) }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, limit);
}

export function budgetMetrics(
  transactions: FinanceTransaction[],
  context: { monthlyIncome: number; investments: number },
) {
  const netSpending = summarizeTransactions(transactions).netAmount;
  const hasIncome = context.monthlyIncome > 0;
  const estimatedSavings = hasIncome ? roundMoney(context.monthlyIncome - netSpending) : null;
  return {
    monthlyIncome: context.monthlyIncome,
    investments: context.investments,
    netSpending,
    estimatedSavings,
    savingsRate: hasIncome && estimatedSavings !== null ? roundMoney(estimatedSavings / context.monthlyIncome) : null,
    investmentToIncomeRatio: hasIncome ? roundMoney(context.investments / context.monthlyIncome) : null,
  };
}
```

- [ ] **Step 4: Run Node tests to verify they pass**

Run: `cd agent && npm test`

Expected: PASS for finance tools.

- [ ] **Step 5: Commit**

```bash
git add agent/package.json agent/package-lock.json agent/tsconfig.json agent/src/types.ts agent/src/financeTools.ts agent/tests/financeTools.test.ts
git commit -m "feat: add deterministic finance tools"
```

## Task 4: Pi-Agent Runner

**Files:**
- Create: `agent/src/financeAgent.ts`
- Create: `agent/src/index.ts`
- Modify: `agent/src/types.ts`
- Test: `agent/tests/financeTools.test.ts`

- [ ] **Step 1: Add failing CLI smoke test**

Create `agent/tests/index.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { readAgentRequest } from '../src/index';

describe('agent CLI helpers', () => {
  it('parses stdin JSON into an agent request', async () => {
    const request = await readAgentRequest(async function* () {
      yield Buffer.from('{"message":"hi","history":[],"language":"en","financialContext":{"monthlyIncome":0,"investments":0},"llm":{"apiKey":"k","baseUrl":"u","model":"m"},"transactions":[]}');
    }());

    expect(request.message).toBe('hi');
    expect(request.transactions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run CLI test to verify it fails**

Run: `cd agent && npm test`

Expected: FAIL because `agent/src/index.ts` does not exist.

- [ ] **Step 3: Implement pi-agent runner and CLI helpers**

Create `agent/src/financeAgent.ts`:

```typescript
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import {
  budgetMetrics,
  filterTransactions,
  summarizeTransactions,
  topMerchants,
} from './financeTools';
import type { AgentRequest, AgentStreamEvent } from './types';

function emit(event: AgentStreamEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function buildSystemPrompt(request: AgentRequest): string {
  const languageInstruction = request.language === 'en' ? 'Answer in English.' : '请用中文回答。';
  return `
You are a finance analysis agent embedded in Smart Finance.
${languageInstruction}
Only discuss personal finance, transaction analysis, budgeting, spending behavior, and the user's provided financial context.
Positive transaction amounts are spending. Negative amounts are refunds or credits.
Use the provided finance tools for calculations instead of estimating from raw rows.
Do not provide legal, tax, medical, or specific investment product advice.
Do not reveal hidden chain-of-thought. Provide concise reasoning summaries, concrete numbers, and actionable next steps.
`;
}

export async function runFinanceAgent(request: AgentRequest): Promise<void> {
  const authStorage = AuthStorage.create();
  authStorage.setApiKey?.('openai-compatible', request.llm.apiKey);

  const modelRegistry = ModelRegistry.create(authStorage);
  const model = await modelRegistry.getModel?.(request.llm.model, {
    baseUrl: request.llm.baseUrl,
    apiKey: request.llm.apiKey,
  });

  const customTools = [
    defineTool({
      name: 'summarize_transactions',
      description: 'Summarize all loaded transaction rows by spend, refunds, category, card, and date range.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => summarizeTransactions(request.transactions),
    }),
    defineTool({
      name: 'filter_transactions',
      description: 'Filter transaction rows by category, date range, amount sign, card suffix, or description search text.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          amountSign: { type: 'string', enum: ['spend', 'refund', 'all'] },
          cardLastFour: { type: 'string' },
          searchText: { type: 'string' },
        },
        additionalProperties: false,
      },
      execute: async (input) => filterTransactions(request.transactions, input),
    }),
    defineTool({
      name: 'top_merchants',
      description: 'Return the top merchants by transaction amount.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
          includeRefunds: { type: 'boolean' },
        },
        additionalProperties: false,
      },
      execute: async (input) => topMerchants(request.transactions, input),
    }),
    defineTool({
      name: 'budget_metrics',
      description: 'Compute income-aware spending and savings metrics.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => budgetMetrics(request.transactions, request.financialContext),
    }),
  ];

  const { session } = await createAgentSession({
    authStorage,
    model,
    modelRegistry,
    noTools: 'builtin',
    customTools,
    resourceLoader: new DefaultResourceLoader({
      systemPromptOverride: buildSystemPrompt(request),
    }),
    sessionManager: SessionManager.inMemory(),
  });

  session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      emit({ type: 'text', delta: event.assistantMessageEvent.delta });
    }
    if (event.type === 'tool_execution_start') {
      emit({ type: 'status', message: `tool:start:${event.toolName}` });
    }
    if (event.type === 'tool_execution_end') {
      emit({ type: 'status', message: `tool:end:${event.toolName}` });
    }
  });

  const history = request.history
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');
  const prompt = `${history ? `Recent chat history:\n${history}\n\n` : ''}Current user question: ${request.message}`;

  await session.prompt(prompt);
  session.dispose();
}
```

Create `agent/src/index.ts`:

```typescript
import { runFinanceAgent } from './financeAgent';
import type { AgentRequest, AgentStreamEvent } from './types';

function emit(event: AgentStreamEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export async function readAgentRequest(input: AsyncIterable<Buffer>): Promise<AgentRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as AgentRequest;
}

export async function main(): Promise<void> {
  try {
    const request = await readAgentRequest(process.stdin);
    await runFinanceAgent(request);
    emit({ type: 'done' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({ type: 'error', message });
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

- [ ] **Step 4: Reconcile SDK compile errors**

Run: `cd agent && npm run typecheck`

Expected: If SDK signatures differ from the docs, update `financeAgent.ts` to match installed types. Keep `noTools: 'builtin'`, `customTools`, `DefaultResourceLoader.systemPromptOverride`, and event subscriptions as the intended behavior.

- [ ] **Step 5: Run Node tests and typecheck**

Run: `cd agent && npm test`

Run: `cd agent && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agent/src/financeAgent.ts agent/src/index.ts agent/src/types.ts agent/tests/index.test.ts
git commit -m "feat: add pi agent runner"
```

## Task 5: Replace Backend Chat Agent Path

**Files:**
- Modify: `backend/app/services/llm_client.py`
- Modify: `backend/app/api/endpoints.py`
- Modify: `backend/pyproject.toml`
- Test: `backend/tests/test_pipeline.py`

- [ ] **Step 1: Update failing compatibility test**

Modify `backend/tests/test_pipeline.py` `test_financial_advice`:

```python
    @patch("app.services.llm_client.stream_pi_agent_chat")
    def test_financial_advice(self, mock_stream):
        import pandas as pd

        async def fake_stream(**kwargs):
            yield "advice"

        mock_stream.side_effect = fake_stream
        df = pd.DataFrame([{"Category": "Food", "Amount": 100}])

        advice = generate_financial_advice(df, "fake-key", "fake-url", "gpt-3.5")
        self.assertEqual(advice, "advice")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_pipeline.py::TestPipeline::test_financial_advice -q`

Expected: FAIL because `generate_financial_advice` still calls the old dataframe agent path or cannot consume the async pi-agent stream.

- [ ] **Step 3: Replace chat service delegation**

In `backend/app/services/llm_client.py`:

- Remove `warnings`, `pandas as pd`, `AIMessage`, `BaseMessage`, and `create_pandas_dataframe_agent` imports if no longer used.
- Keep `OpenRouterChatOpenAI` only for PDF transaction extraction if needed.
- Import `asyncio` and `stream_pi_agent_chat`.
- Replace `run_autonomous_agent`, `agentic_financial_advice`, `generate_financial_advice`, `stream_autonomous_agent`, and `stream_chat_with_data` with pi-agent backed versions.

Use this implementation shape:

```python
from app.services.pi_agent_client import stream_pi_agent_chat


def _dataframe_to_transactions(df):
    rows = []
    for item in df.to_dict(orient="records"):
        date = item.get("Date")
        rows.append(
            {
                "date": date.isoformat() if hasattr(date, "isoformat") else date,
                "description": item.get("Description", ""),
                "amount": float(item.get("Amount", 0) or 0),
                "category": item.get("Category", "Other"),
                "source": item.get("Source"),
                "cardLastFour": item.get("CardLastFour"),
            }
        )
    return rows


async def _collect_stream(stream):
    chunks = []
    async for chunk in stream:
        chunks.append(chunk)
    return "".join(chunks)


def generate_financial_advice(summary_df, api_key, base_url, model, monthly_income=0, investments=0):
    stream = stream_pi_agent_chat(
        message="Generate a comprehensive financial health report with 3-5 concrete recommendations.",
        history=[],
        transactions=_dataframe_to_transactions(summary_df),
        api_key=api_key,
        base_url=base_url,
        model=model,
        monthly_income=float(monthly_income or 0),
        investments=float(investments or 0),
        language="zh",
    )
    return asyncio.run(_collect_stream(stream))


async def stream_chat_with_data(
    history,
    current_query,
    df,
    api_key,
    base_url,
    model,
    monthly_income=0,
    investments=0,
    language="zh",
):
    async for token in stream_pi_agent_chat(
        message=current_query,
        history=history or [],
        transactions=_dataframe_to_transactions(df),
        api_key=api_key,
        base_url=base_url,
        model=model,
        monthly_income=float(monthly_income or 0),
        investments=float(investments or 0),
        language=language,
    ):
        yield token
```

- [ ] **Step 4: Clean API endpoint comments**

In `backend/app/api/endpoints.py`, remove the stale comment:

```python
    # Use the streaming service function
    # Note: endpoints must import the new stream_chat_with_data function
```

Keep the `StreamingResponse` contract unchanged.

- [ ] **Step 5: Remove unused dependency**

In `backend/pyproject.toml`, remove:

```toml
    "langchain-experimental>=0.4.0",
```

Run: `uv lock`

- [ ] **Step 6: Run backend targeted tests**

Run: `uv run pytest tests/test_pi_agent_client.py tests/test_pipeline.py -q`

Expected: PASS for the updated tests. If pytest capture still fails in this environment, run `uv run python tests/test_pipeline.py` and report the pytest environment issue separately.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/llm_client.py backend/app/api/endpoints.py backend/pyproject.toml backend/uv.lock backend/tests/test_pipeline.py
git commit -m "feat: route backend chat through pi agent"
```

## Task 6: Startup And Documentation

**Files:**
- Modify: `start.sh`
- Modify: `README.md`
- Modify: `README_ZH.md`

- [ ] **Step 1: Update startup script for agent dependencies**

Modify `start.sh` so it installs agent dependencies if `agent/node_modules` is missing before starting the backend:

```bash
if [ ! -d "agent/node_modules" ]; then
    echo "Installing Agent dependencies..."
    cd agent
    npm install
    cd ..
fi
```

Do not start a separate long-running agent server because FastAPI invokes the sidecar per chat request.

- [ ] **Step 2: Document pi-agent setup in English README**

Add to `README.md`:

```markdown
### Agent Runtime

Chat analysis is powered by a Node.js pi-agent sidecar in `agent/`.

Install dependencies:

```bash
cd agent
npm install
```

The FastAPI backend invokes the sidecar with `npx tsx src/index.ts` for `/api/chat`.
```
```

- [ ] **Step 3: Document pi-agent setup in Chinese README**

Add to `README_ZH.md`:

```markdown
### Agent 运行时

聊天分析由 `agent/` 目录中的 Node.js pi-agent sidecar 提供。

安装依赖：

```bash
cd agent
npm install
```

FastAPI 后端会在 `/api/chat` 请求中通过 `npx tsx src/index.ts` 调用该 sidecar。
```
```

- [ ] **Step 4: Run formatting and smoke checks**

Run: `cd agent && npm test && npm run typecheck`

Run: `uv run pytest tests/test_pi_agent_client.py tests/test_pipeline.py -q`

Expected: PASS, except for the already observed pytest capture environment issue if it persists.

- [ ] **Step 5: Commit**

```bash
git add start.sh README.md README_ZH.md
git commit -m "docs: document pi agent runtime"
```

## Task 7: Final Verification

**Files:**
- No planned code changes.

- [ ] **Step 1: Run Node verification**

Run: `cd agent && npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 2: Run backend verification**

Run: `uv run pytest tests/test_pi_agent_client.py tests/test_pipeline.py -q`

Expected: PASS. If the pytest capture issue persists, capture the traceback and run direct Python unittest fallback:

```bash
uv run python tests/test_pipeline.py
```

- [ ] **Step 3: Inspect final diff**

Run: `git status --short`

Run: `git diff --stat master...HEAD`

Expected: Only migration branch files changed.

- [ ] **Step 4: Commit any final fixes**

If final verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize pi agent migration"
```

If no fixes are needed, do not create an empty commit.
