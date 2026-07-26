import type { FinanceTransaction } from './types.js';

export interface TransactionFilter {
  categoryCode?: string;
  flowType?: FinanceTransaction['flowType'];
  startDate?: string;
  endDate?: string;
  amountSign?: 'spend' | 'refund' | 'all';
  cardLastFour?: string;
  searchText?: string;
}

const expenseCents = (transaction: FinanceTransaction) => transaction.flowType === 'expense' ? transaction.amountCents : 0;
const refundCents = (transaction: FinanceTransaction) => transaction.flowType === 'expense_refund' ? transaction.amountCents : 0;
const signedExpenseCents = (transaction: FinanceTransaction) => expenseCents(transaction) - refundCents(transaction);
const monthOf = (value: string | null) => value?.slice(0, 7) ?? null;
const latestMonth = (transactions: FinanceTransaction[]) => transactions.map((item) => monthOf(item.date)).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null;
const earliestMonth = (transactions: FinanceTransaction[]) => transactions.map((item) => monthOf(item.date)).filter((item): item is string => Boolean(item)).sort()[0] ?? null;

export function summarizeTransactions(transactions: FinanceTransaction[]) {
  const dates = transactions.map((item) => item.date).filter((item): item is string => Boolean(item)).sort();
  const categories = new Map<string, { categoryCode: string; netSpendCents: number; grossSpendCents: number; refundCents: number; count: number }>();
  const cards = new Map<string, { cardLastFour: string; netSpendCents: number; count: number }>();
  for (const transaction of transactions) {
    const categoryCode = transaction.categoryCode || 'other';
    const category = categories.get(categoryCode) ?? { categoryCode, netSpendCents: 0, grossSpendCents: 0, refundCents: 0, count: 0 };
    if (transaction.flowType !== 'expense' && transaction.flowType !== 'expense_refund') continue;
    category.netSpendCents += signedExpenseCents(transaction);
    category.grossSpendCents += expenseCents(transaction);
    category.refundCents += refundCents(transaction);
    category.count += 1;
    categories.set(categoryCode, category);
    const cardLastFour = transaction.cardLastFour || 'unknown';
    const card = cards.get(cardLastFour) ?? { cardLastFour, netSpendCents: 0, count: 0 };
    card.netSpendCents += signedExpenseCents(transaction);
    card.count += 1;
    cards.set(cardLastFour, card);
  }
  const grossSpendCents = transactions.reduce((sum, item) => sum + expenseCents(item), 0);
  const refundTotalCents = transactions.reduce((sum, item) => sum + refundCents(item), 0);
  const incomeCents = transactions.reduce((sum, item) => sum + (item.flowType === 'income' ? item.amountCents : 0), 0);
  const transferCents = transactions.reduce((sum, item) => sum + (item.flowType === 'transfer' ? item.amountCents : 0), 0);
  return {
    count: transactions.length,
    netSpendCents: grossSpendCents - refundTotalCents,
    grossSpendCents,
    refundCents: refundTotalCents,
    incomeCents,
    transferCents,
    categoryTotals: [...categories.values()].sort((a, b) => b.grossSpendCents - a.grossSpendCents),
    cardTotals: [...cards.values()].sort((a, b) => b.netSpendCents - a.netSpendCents),
    dateRange: { start: dates[0] ?? null, end: dates.at(-1) ?? null },
  };
}

export function filterTransactions(transactions: FinanceTransaction[], filter: TransactionFilter): FinanceTransaction[] {
  const searchText = filter.searchText?.toLowerCase();
  return transactions.filter((transaction) => {
    if (filter.categoryCode && transaction.categoryCode !== filter.categoryCode) return false;
    if (filter.flowType && transaction.flowType !== filter.flowType) return false;
    if (filter.startDate && (!transaction.date || transaction.date < filter.startDate)) return false;
    if (filter.endDate && (!transaction.date || transaction.date > filter.endDate)) return false;
    if (filter.amountSign === 'spend' && transaction.flowType !== 'expense') return false;
    if (filter.amountSign === 'refund' && transaction.flowType !== 'expense_refund') return false;
    if (filter.cardLastFour && transaction.cardLastFour !== filter.cardLastFour) return false;
    if (searchText && !transaction.description.toLowerCase().includes(searchText)) return false;
    return true;
  });
}

export function monthlySpendingTrend(transactions: FinanceTransaction[], options: { startMonth?: string; endMonth?: string } = {}) {
  const startMonth = options.startMonth ?? earliestMonth(transactions);
  const endMonth = options.endMonth ?? latestMonth(transactions);
  if (!startMonth || !endMonth) return [];
  const totals = new Map<string, { month: string; netSpendCents: number; grossSpendCents: number; refundCents: number; transactionCount: number }>();
  for (const transaction of transactions) {
    const month = monthOf(transaction.date);
    if (!month || month < startMonth || month > endMonth) continue;
    if (transaction.flowType !== 'expense' && transaction.flowType !== 'expense_refund') continue;
    const item = totals.get(month) ?? { month, netSpendCents: 0, grossSpendCents: 0, refundCents: 0, transactionCount: 0 };
    item.netSpendCents += signedExpenseCents(transaction);
    item.grossSpendCents += expenseCents(transaction);
    item.refundCents += refundCents(transaction);
    item.transactionCount += 1;
    totals.set(month, item);
  }
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function topMerchants(transactions: FinanceTransaction[], options: { limit?: number; includeRefunds?: boolean } = {}) {
  const grouped = new Map<string, { merchant: string; amountCents: number; count: number }>();
  for (const transaction of transactions) {
    if (transaction.flowType !== 'expense' && !(options.includeRefunds && transaction.flowType === 'expense_refund')) continue;
    const merchant = transaction.description || 'Unknown';
    const item = grouped.get(merchant) ?? { merchant, amountCents: 0, count: 0 };
    item.amountCents += signedExpenseCents(transaction);
    item.count += 1;
    grouped.set(merchant, item);
  }
  return [...grouped.values()].sort((a, b) => b.amountCents - a.amountCents).slice(0, options.limit ?? 5);
}

export function budgetMetrics(transactions: FinanceTransaction[], context: { monthlyIncomeCents: number; investmentsCents: number; month?: string }) {
  const month = context.month ?? latestMonth(transactions);
  const scoped = month ? transactions.filter((item) => monthOf(item.date) === month) : [];
  const netSpendingCents = summarizeTransactions(scoped).netSpendCents;
  const estimatedSavingsCents = context.monthlyIncomeCents > 0 ? context.monthlyIncomeCents - netSpendingCents : null;
  return {
    month,
    monthlyIncomeCents: context.monthlyIncomeCents,
    investmentsCents: context.investmentsCents,
    netSpendingCents,
    estimatedSavingsCents,
    savingsRate: estimatedSavingsCents === null ? null : estimatedSavingsCents / context.monthlyIncomeCents,
  };
}
