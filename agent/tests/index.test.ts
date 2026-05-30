import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { getFinanceSystemPrompt } from '../src/financeAgent.js';
import { runCli } from '../src/index.js';
import type { AgentRequest, AgentStreamEvent } from '../src/types.js';

const request: AgentRequest = {
  message: 'Summarize my spending',
  history: [],
  language: 'en',
  financialContext: { monthlyIncome: 1000, investments: 100 },
  llm: { apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model' },
  transactions: [
    { date: '2026-05-01T00:00:00', description: 'Cafe', amount: 12, category: 'Dining', source: 'a.pdf', cardLastFour: '1234' },
  ],
};

function captureWritable() {
  let output = '';
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
    output: () => output,
  };
}

describe('agent CLI', () => {
  it('tells the model all money amounts are Chinese yuan', () => {
    expect(getFinanceSystemPrompt()).toContain('Chinese yuan');
    expect(getFinanceSystemPrompt()).toContain('人民币');
  });

  it('reads a JSON request and writes JSONL events', async () => {
    const stdout = captureWritable();

    await runCli({
      stdin: Readable.from([JSON.stringify(request)]),
      stdout: stdout.stream,
      runner: async function* (): AsyncGenerator<AgentStreamEvent> {
        yield { type: 'status', message: 'tool:start:summarize_transactions' };
        yield { type: 'text', delta: 'Total spend is 12.' };
        yield { type: 'done' };
      },
    });

    expect(stdout.output().trim().split('\n').map((line) => JSON.parse(line))).toEqual([
      { type: 'status', message: 'tool:start:summarize_transactions' },
      { type: 'text', delta: 'Total spend is 12.' },
      { type: 'done' },
    ]);
  });

  it('reports invalid stdin as an error event followed by done', async () => {
    const stdout = captureWritable();

    await runCli({
      stdin: Readable.from(['not json']),
      stdout: stdout.stream,
      runner: async function* (): AsyncGenerator<AgentStreamEvent> {
        yield { type: 'text', delta: 'unused' };
      },
    });

    const events = stdout.output().trim().split('\n').map((line) => JSON.parse(line));
    expect(events[0].type).toBe('error');
    expect(events[1]).toEqual({ type: 'done' });
  });
});
