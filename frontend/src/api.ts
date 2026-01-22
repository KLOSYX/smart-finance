import axios from 'axios';

// Create an axios instance with a custom config
const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  category: string;
  source: string;
  card_last_four?: string;
}

export type TransactionCreate = Omit<Transaction, 'id'>;

export interface Settings {
  api_key: string;
  base_url: string;
  model_name: string;
  monthly_income: string;
  investments: string;
}

export interface ParseResult {
  filename: string;
  text: string;
  message: string;
}

export const getTransactions = async () => {
  const response = await api.get<Transaction[]>('/transactions');
  return response.data;
};

export const createTransaction = async (data: TransactionCreate) => {
  const response = await api.post<Transaction>('/transactions', data);
  return response.data;
};

export const updateTransaction = async (id: number, data: Partial<Transaction>) => {
  const response = await api.patch<Transaction>(`/transactions/${id}`, data);
  return response.data;
};

export const deleteTransaction = async (id: number) => {
  const response = await api.delete(`/transactions/${id}`);
  return response.data;
};

export const clearAllTransactions = async () => {
  const response = await api.delete('/transactions');
  return response.data;
};

// New: Step 1 - Parse PDF
export const parsePdf = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post<ParseResult>('/parse_pdf', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

// New: Step 2 - Analyze Text
export const analyzeText = async (text: string, source_filename: string, language: string = 'zh') => {
  const response = await api.post<{ message: string, transactions_added: number, transactions: Transaction[] }>('/analyze_text', { text, source_filename, language });
  return response.data;
};

// Deprecated: Old direct upload
export const uploadPdf = async (file: File) => {
  // This endpoint no longer exists in backend as-is, mapping to parsePdf for compatibility or removal
  return parsePdf(file);
};

export const getStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

export const getSettings = async () => {
  const response = await api.get<Settings>('/settings');
  return response.data;
};

export const updateSettings = async (settings: Partial<Settings>) => {
  const response = await api.post('/settings', settings);
  return response.data;
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const sendChatMessage = async (message: string, history: { role: 'user' | 'assistant', content: string }[], language: string = 'zh') => {
  const response = await api.post<{ response: string }>('/chat', { message, history, language });
  return response.data;
};

export const sendChatMessageStream = async (message: string, history: { role: 'user' | 'assistant', content: string }[], language: string = 'zh') => {
  const response = await fetch('http://127.0.0.1:8000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, history, language }),
  });
  return response;
};

export default api;
