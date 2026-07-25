import { spawn } from 'node:child_process';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { FinanceTransaction } from './types.js';

const PYTHON_TIMEOUT_MS = 2000;
const MAX_OUTPUT_BYTES = 64_000;
const MAX_CODE_CHARS = 8_000;

export interface PythonCalculationInput {
  code: string;
  transactions: FinanceTransaction[];
  monthlyIncome: number;
  investments: number;
  timeoutMs?: number;
}

const PYTHON_WRAPPER = String.raw`
import json
import math
import statistics
import sys

payload = json.loads(sys.stdin.read())
code = payload["code"]

allowed_builtins = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "filter": filter,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "map": map,
    "max": max,
    "min": min,
    "pow": pow,
    "range": range,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}

scope = {
    "__builtins__": allowed_builtins,
    "transactions": payload["transactions"],
    "monthly_income": payload["monthlyIncome"],
    "investments": payload["investments"],
    "currency": "CNY",
    "currency_name": "人民币",
    "math": math,
    "statistics": statistics,
}

exec(code, scope, scope)

if "result" not in scope:
    raise ValueError("Python code must assign a JSON-serializable value to result")

print(json.dumps(scope["result"], ensure_ascii=False))
`;

function trimOutput(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_BYTES) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_BYTES)}\n...[truncated]`;
}

export async function executePythonCalculation({
  code,
  transactions,
  monthlyIncome,
  investments,
  timeoutMs = PYTHON_TIMEOUT_MS,
}: PythonCalculationInput): Promise<unknown> {
  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`Python code is too long; limit is ${MAX_CODE_CHARS} characters`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-c', PYTHON_WRAPPER], {
      cwd: '/tmp',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Python calculation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = trimOutput(stdout + chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk) => {
      stderr = trimOutput(stderr + chunk.toString('utf8'));
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Python result was not valid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.end(JSON.stringify({
      code,
      transactions,
      monthlyIncome,
      investments,
    }));
  });
}

export function createPythonCalculationTool(context: {
  transactions: FinanceTransaction[];
  monthlyIncome: number;
  investments: number;
}) {
  return defineTool({
    name: 'execute_python',
    label: 'Execute Python',
    description: [
      'Run a short, deterministic Python calculation over the provided finance data.',
      'The variables transactions, monthly_income, investments, currency, currency_name, math, and statistics are available.',
      'Assign the final JSON-serializable answer to result. All money amounts are Chinese yuan (CNY/人民币).',
    ].join(' '),
    parameters: Type.Object({
      code: Type.String({
        description: 'Python code. It must assign a JSON-serializable value to result.',
      }),
    }),
    execute: async (_toolCallId, params) => {
      const result = await executePythonCalculation({
        code: params.code,
        transactions: context.transactions,
        monthlyIncome: context.monthlyIncome,
        investments: context.investments,
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}
