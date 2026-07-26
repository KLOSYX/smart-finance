import axios, { isAxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api' });

export type Role = 'husband' | 'wife' | 'shared';
export type FlowType = 'income' | 'expense' | 'expense_refund' | 'transfer';
export type Domain = 'asset' | 'income' | 'expense';

export interface Category {
  id: number;
  domain: Domain;
  code: string;
  name: string;
  is_default: boolean;
  is_archived: boolean;
}

export interface Asset {
  id: number;
  name: string;
  category_id: number;
  category_name: string;
  channel: string;
  household_role: Role;
  note: string | null;
  current_value_cents: number;
  previous_value_cents: number | null;
  monthly_change_cents: number;
  monthly_change_rate: number | null;
  valuation_date: string;
  status: 'current' | 'stale';
}

export interface Cashflow {
  id: number;
  transaction_date: string;
  description: string;
  amount_cents: number;
  flow_type: FlowType;
  category_id: number | null;
  category_name: string | null;
  channel: string | null;
  household_role: Role;
  card_last_four: string | null;
  import_id: number | null;
}

export interface CashflowPage {
  items: Cashflow[];
  page: number;
  page_size: number;
  total: number;
}

export interface Settings {
  husband_name: string;
  wife_name: string;
  default_role: Role;
  api_key: string;
  base_url: string;
  model_name: string;
  llm_extraction_enabled: boolean;
  language: string;
}

export const money = (cents: number) =>
  new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(cents / 100);

export const shortMoney = (cents: number) => {
  const value = cents / 100;
  if (Math.abs(value) >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};

export async function getCategories(domain?: Domain) {
  return (await api.get<Category[]>('/metadata/categories', { params: { domain } })).data;
}

export async function sendChatMessageStream(message: string, history: Array<{ role: string; content: string }>) {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  });
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback;
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }
  if (error.code === 'ERR_NETWORK') return '无法连接到本地服务，请确认应用已启动';
  return fallback;
}
