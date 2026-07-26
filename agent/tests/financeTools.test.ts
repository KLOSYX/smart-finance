import { describe, expect, it } from 'vitest';
import { budgetMetrics, filterTransactions, monthlySpendingTrend, summarizeTransactions, topMerchants } from '../src/financeTools.js';
import type { FinanceTransaction } from '../src/types.js';

const transactions: FinanceTransaction[] = [
  { date: '2026-05-01T00:00:00', description: 'Cafe A', amountCents: 3000, flowType: 'expense', categoryCode: 'dining', categoryName: '餐饮', channel: '支付宝', householdRole: 'shared', importId: 1, importFilename: '账单.txt', cardLastFour: '1234' },
  { date: '2026-05-02T00:00:00', description: 'Metro', amountCents: 800, flowType: 'expense', categoryCode: 'transportation', categoryName: '交通', channel: '微信', householdRole: 'shared', importId: 1, importFilename: '账单.txt', cardLastFour: '1234' },
  { date: '2026-05-03T00:00:00', description: 'Cafe A Refund', amountCents: 1000, flowType: 'expense_refund', categoryCode: 'dining', categoryName: '餐饮', channel: '支付宝', householdRole: 'shared', importId: 1, importFilename: '账单.txt', cardLastFour: '1234' },
  { date: '2026-06-04T00:00:00', description: 'Book Shop', amountCents: 9000, flowType: 'expense', categoryCode: 'education', categoryName: '教育', channel: null, householdRole: 'shared', importId: 2, importFilename: '账单2.txt', cardLastFour: '9876' },
  { date: '2026-06-05T00:00:00', description: 'Salary', amountCents: 500000, flowType: 'income', categoryCode: 'salary', categoryName: '工资', channel: '银行', householdRole: 'shared', importId: 2, importFilename: '账单2.txt', cardLastFour: null },
  { date: '2026-06-06T00:00:00', description: 'Card repayment', amountCents: 200000, flowType: 'transfer', categoryCode: 'transfer', categoryName: '转账', channel: '银行', householdRole: 'shared', importId: 2, importFilename: '账单2.txt', cardLastFour: null },
];

describe('finance tools', () => {
  it('summarizes cents, refunds, categories, cards, and date range', () => {
    const summary = summarizeTransactions(transactions);
    expect(summary.netSpendCents).toBe(11800);
    expect(summary.grossSpendCents).toBe(12800);
    expect(summary.refundCents).toBe(1000);
    expect(summary.incomeCents).toBe(500000);
    expect(summary.transferCents).toBe(200000);
    expect(summary.categoryTotals[0]).toMatchObject({ categoryCode: 'education', grossSpendCents: 9000 });
    expect(summary.cardTotals[0]).toMatchObject({ cardLastFour: '9876', netSpendCents: 9000 });
    expect(summary.dateRange).toEqual({ start: '2026-05-01T00:00:00', end: '2026-06-06T00:00:00' });
  });

  it('filters by category, amount sign, card suffix, and search text', () => {
    expect(filterTransactions(transactions, { categoryCode: 'dining', amountSign: 'refund' })).toHaveLength(1);
    expect(filterTransactions(transactions, { cardLastFour: '9876' })).toHaveLength(1);
    expect(filterTransactions(transactions, { searchText: 'cafe' })).toHaveLength(2);
    expect(filterTransactions(transactions, { flowType: 'income' })).toHaveLength(1);
  });

  it('returns monthly trend and top merchants in cents', () => {
    expect(monthlySpendingTrend(transactions).map((item) => item.month)).toEqual(['2026-05', '2026-06']);
    expect(monthlySpendingTrend(transactions, { startMonth: '2026-05', endMonth: '2026-06' })).toEqual([
      { month: '2026-05', netSpendCents: 2800, grossSpendCents: 3800, refundCents: 1000, transactionCount: 3 },
      { month: '2026-06', netSpendCents: 9000, grossSpendCents: 9000, refundCents: 0, transactionCount: 1 },
    ]);
    expect(topMerchants(transactions, { limit: 2 })).toEqual([
      { merchant: 'Book Shop', amountCents: 9000, count: 1 },
      { merchant: 'Cafe A', amountCents: 3000, count: 1 },
    ]);
  });

  it('scopes budget metrics to the selected/latest month', () => {
    expect(budgetMetrics(transactions, { monthlyIncomeCents: 20000, investmentsCents: 5000, month: '2026-05' })).toMatchObject({ month: '2026-05', netSpendingCents: 2800, estimatedSavingsCents: 17200, savingsRate: 0.86 });
    expect(budgetMetrics(transactions, { monthlyIncomeCents: 0, investmentsCents: 5000 }).savingsRate).toBeNull();
  });
});
