import { describe, expect, it } from 'vitest';
import {
  budgetMetrics,
  filterTransactions,
  summarizeTransactions,
  topMerchants,
} from '../src/financeTools.js';
import type { FinanceTransaction } from '../src/types.js';

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
    expect(summary.cardTotals[0]).toEqual({ cardLastFour: '9876', netAmount: 90, count: 1 });
    expect(summary.cardTotals[1]).toEqual({ cardLastFour: '1234', netAmount: 28, count: 3 });
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
