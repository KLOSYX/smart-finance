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
