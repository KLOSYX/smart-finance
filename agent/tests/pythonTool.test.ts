import { describe, expect, it } from 'vitest';
import { executePythonCalculation } from '../src/pythonTool.js';
import type { FinanceTransaction } from '../src/types.js';

const transactions: FinanceTransaction[] = [
  { date: '2026-05-01T00:00:00', description: 'Cafe', amount: 30, category: '餐饮', source: 'a.pdf', cardLastFour: '1234' },
  { date: '2026-05-02T00:00:00', description: 'Refund', amount: -10, category: '餐饮', source: 'a.pdf', cardLastFour: '1234' },
];

describe('python calculation tool', () => {
  it('runs python with injected finance data and returns JSON output', async () => {
    const result = await executePythonCalculation({
      code: [
        'net = sum(item["amount"] for item in transactions)',
        'result = {"currency": currency, "net": net, "savings": monthly_income - net}',
      ].join('\n'),
      transactions,
      monthlyIncome: 200,
      investments: 50,
    });

    expect(result).toEqual({
      currency: 'CNY',
      net: 20,
      savings: 180,
    });
  });

  it('rejects python that does not assign JSON-serializable result', async () => {
    await expect(executePythonCalculation({
      code: 'answer = 1 + 1',
      transactions,
      monthlyIncome: 200,
      investments: 50,
    })).rejects.toThrow('assign a JSON-serializable value to result');
  });
});
