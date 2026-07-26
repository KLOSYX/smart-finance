import { describe, expect, it } from 'vitest';
import { executePythonCalculation } from '../src/pythonTool.js';
import type { FinanceTransaction } from '../src/types.js';

const transactions: FinanceTransaction[] = [
  { date: '2026-05-01T00:00:00', description: 'Cafe', amountCents: 3000, flowType: 'expense', categoryCode: 'dining', categoryName: '餐饮', channel: null, householdRole: 'shared', importId: 1, importFilename: null, cardLastFour: '1234' },
  { date: '2026-05-02T00:00:00', description: 'Refund', amountCents: 1000, flowType: 'expense_refund', categoryCode: 'dining', categoryName: '餐饮', channel: null, householdRole: 'shared', importId: 1, importFilename: null, cardLastFour: '1234' },
];

describe('python calculation tool', () => {
  it('runs python with injected cents data and returns JSON output', async () => {
    const result = await executePythonCalculation({
      code: 'net = sum(item["amountCents"] if item["flowType"] == "expense" else -item["amountCents"] for item in transactions)\nresult = {"currency": currency, "net": net, "savings": monthly_income_cents - net}',
      transactions, monthlyIncomeCents: 20000, investmentsCents: 5000,
    });
    expect(result).toEqual({ currency: 'CNY', net: 2000, savings: 18000 });
  });

  it('rejects python that does not assign JSON-serializable result', async () => {
    await expect(executePythonCalculation({ code: 'answer = 1 + 1', transactions, monthlyIncomeCents: 20000, investmentsCents: 5000 })).rejects.toThrow('assign a JSON-serializable value to result');
  });
});
