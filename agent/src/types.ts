export interface FinanceTransaction {
  date: string | null;
  description: string;
  amountCents: number;
  categoryCode: string;
  cardLastFour: string | null;
  importId: number | null;
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
    monthlyIncomeCents: number;
    investmentsCents: number;
  };
  llm: { apiKey: string; baseUrl: string; model: string };
  transactions: FinanceTransaction[];
}

export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
