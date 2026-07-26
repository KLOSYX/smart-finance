import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  budgetMetrics,
  filterTransactions,
  monthlySpendingTrend,
  summarizeTransactions,
  topMerchants,
} from './financeTools.js';
import { createPythonCalculationTool } from './pythonTool.js';
import type { AgentRequest, AgentStreamEvent } from './types.js';

const PROVIDER = 'smart-finance-openai-compatible';

function asToolText(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    details: value,
  };
}

function createFinanceTools(request: AgentRequest) {
  return [
    defineTool({
      name: 'summarize_transactions',
      label: 'Summarize transactions',
      description: 'Summarize total spend, refunds, categories, cards, and date range.',
      parameters: Type.Object({}),
      execute: async () => asToolText(summarizeTransactions(request.transactions)),
    }),
    defineTool({
      name: 'filter_transactions',
      label: 'Filter transactions',
      description: 'Filter transactions by category, date range, amount sign, card suffix, or search text.',
      parameters: Type.Object({
      categoryCode: Type.Optional(Type.String()),
        startDate: Type.Optional(Type.String()),
        endDate: Type.Optional(Type.String()),
        amountSign: Type.Optional(Type.Union([
          Type.Literal('spend'),
          Type.Literal('refund'),
          Type.Literal('all'),
        ])),
        cardLastFour: Type.Optional(Type.String()),
        searchText: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => asToolText(filterTransactions(request.transactions, params)),
    }),
    defineTool({
      name: 'top_merchants',
      label: 'Top merchants',
      description: 'Return the highest-spend merchants.',
      parameters: Type.Object({
        limit: Type.Optional(Type.Number()),
        includeRefunds: Type.Optional(Type.Boolean()),
      }),
      execute: async (_toolCallId, params) => asToolText(topMerchants(request.transactions, params)),
    }),
    defineTool({
      name: 'budget_metrics',
      label: 'Budget metrics',
      description: 'Calculate spending, savings rate, and investment-to-income ratio.',
      parameters: Type.Object({
        monthlyIncomeCents: Type.Optional(Type.Number()),
        investmentsCents: Type.Optional(Type.Number()),
        month: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => asToolText(budgetMetrics(request.transactions, {
        monthlyIncomeCents: params.monthlyIncomeCents ?? request.financialContext.monthlyIncomeCents,
        investmentsCents: params.investmentsCents ?? request.financialContext.investmentsCents,
        month: params.month,
      })),
    }),
    defineTool({
      name: 'monthly_spending_trend',
      label: 'Monthly spending trend',
      description: 'Return deterministic monthly gross, refund, and net spending totals.',
      parameters: Type.Object({
        startMonth: Type.Optional(Type.String()),
        endMonth: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, params) => asToolText(monthlySpendingTrend(request.transactions, params)),
    }),
    createPythonCalculationTool({
      transactions: request.transactions,
      monthlyIncomeCents: request.financialContext.monthlyIncomeCents,
      investmentsCents: request.financialContext.investmentsCents,
    }),
  ];
}

export function getFinanceSystemPrompt(): string {
  return [
    'You are a personal finance analysis assistant.',
    'All money amounts are Chinese yuan (CNY, 人民币, ¥), never US dollars. Transaction values are stored in cents.',
    'Use the deterministic finance tools for transaction facts before answering.',
    'Use execute_python for arithmetic, ratios, projections, budget scenarios, and any calculation that could be error-prone.',
    'Answer concisely in the user language.',
    'Do not invent transactions or balances.',
  ].join('\n');
}

function buildPrompt(request: AgentRequest): string {
  const history = request.history
    .slice(-5)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n');

  return [
    `User language: ${request.language || 'zh'}`,
    'Conversation history:',
    history || '(none)',
    '',
    'Current user request:',
    request.message,
  ].join('\n');
}

function toEvent(event: AgentSessionEvent): AgentStreamEvent | null {
  if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
    return { type: 'text', delta: event.assistantMessageEvent.delta };
  }
  if (event.type === 'tool_execution_start') {
    return { type: 'status', message: `tool:start:${event.toolName}` };
  }
  if (event.type === 'tool_execution_end') {
    return { type: 'status', message: `tool:end:${event.toolName}` };
  }
  return null;
}

export async function* runFinanceAgent(request: AgentRequest): AsyncGenerator<AgentStreamEvent> {
  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(PROVIDER, request.llm.apiKey);

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = {
    id: request.llm.model,
    name: request.llm.model,
    provider: PROVIDER,
    api: 'openai-completions' as const,
    baseUrl: request.llm.baseUrl,
    reasoning: false,
    input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    compat: { supportsStore: false },
  };

  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    systemPromptOverride: getFinanceSystemPrompt,
  });
  await loader.reload();

  const { session } = await createAgentSession({
    model,
    thinkingLevel: 'off',
    authStorage,
    modelRegistry,
    resourceLoader: loader,
    noTools: 'builtin',
    customTools: createFinanceTools(request),
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });

  const events: AgentStreamEvent[] = [];
  const unsubscribe = session.subscribe((event) => {
    const streamEvent = toEvent(event);
    if (streamEvent) {
      events.push(streamEvent);
    }
  });

  try {
    const prompt = session.prompt(buildPrompt(request));
    while (true) {
      while (events.length > 0) {
        yield events.shift() as AgentStreamEvent;
      }
      const completed = await Promise.race([
        prompt.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 20)),
      ]);
      if (completed) {
        break;
      }
    }
    while (events.length > 0) {
      yield events.shift() as AgentStreamEvent;
    }
    yield { type: 'done' };
  } catch (error) {
    yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
    yield { type: 'done' };
  } finally {
    unsubscribe();
    session.dispose();
  }
}
