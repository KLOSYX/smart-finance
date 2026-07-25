import type { FinanceTransaction } from './types.js';

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
  const cards = new Map<
    string,
    { cardLastFour: string; netAmount: number; count: number }
  >();

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
    const cardTotal = cards.get(card) ?? {
      cardLastFour: card,
      netAmount: 0,
      count: 0,
    };
    cardTotal.netAmount += transaction.amount;
    cardTotal.count += 1;
    cards.set(card, cardTotal);
  }

  return {
    count: transactions.length,
    netAmount: roundMoney(
      transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    ),
    positiveSpend: roundMoney(
      transactions.reduce(
        (sum, transaction) => sum + positiveSpend(transaction.amount),
        0,
      ),
    ),
    refunds: roundMoney(
      transactions.reduce(
        (sum, transaction) => sum + refundAmount(transaction.amount),
        0,
      ),
    ),
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
    if (filter.category && transaction.category !== filter.category) {
      return false;
    }
    if (filter.startDate && transaction.date && transaction.date < filter.startDate) {
      return false;
    }
    if (filter.endDate && transaction.date && transaction.date > filter.endDate) {
      return false;
    }
    if (filter.amountSign === 'spend' && transaction.amount <= 0) {
      return false;
    }
    if (filter.amountSign === 'refund' && transaction.amount >= 0) {
      return false;
    }
    if (filter.cardLastFour && transaction.cardLastFour !== filter.cardLastFour) {
      return false;
    }
    if (searchText && !transaction.description.toLowerCase().includes(searchText)) {
      return false;
    }
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
    if (!options.includeRefunds && transaction.amount <= 0) {
      continue;
    }
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
  const estimatedSavings = hasIncome
    ? roundMoney(context.monthlyIncome - netSpending)
    : null;

  return {
    monthlyIncome: context.monthlyIncome,
    investments: context.investments,
    netSpending,
    estimatedSavings,
    savingsRate:
      hasIncome && estimatedSavings !== null
        ? roundMoney(estimatedSavings / context.monthlyIncome)
        : null,
    investmentToIncomeRatio: hasIncome
      ? roundMoney(context.investments / context.monthlyIncome)
      : null,
  };
}
