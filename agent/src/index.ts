import { pathToFileURL } from 'node:url';
import type { Readable, Writable } from 'node:stream';
import { runFinanceAgent } from './financeAgent.js';
import type { AgentRequest, AgentStreamEvent } from './types.js';

type AgentRunner = (request: AgentRequest) => AsyncIterable<AgentStreamEvent>;

async function readStdin(stdin: Readable): Promise<string> {
  let input = '';
  stdin.setEncoding('utf8');
  for await (const chunk of stdin) {
    input += chunk;
  }
  return input;
}

function writeEvent(stdout: Writable, event: AgentStreamEvent): void {
  stdout.write(`${JSON.stringify(event)}\n`);
}

export async function runCli({
  stdin = process.stdin,
  stdout = process.stdout,
  runner = runFinanceAgent,
}: {
  stdin?: Readable;
  stdout?: Writable;
  runner?: AgentRunner;
} = {}): Promise<void> {
  let request: AgentRequest;
  try {
    request = JSON.parse(await readStdin(stdin)) as AgentRequest;
  } catch (error) {
    writeEvent(stdout, {
      type: 'error',
      message: `Invalid agent request JSON: ${error instanceof Error ? error.message : String(error)}`,
    });
    writeEvent(stdout, { type: 'done' });
    return;
  }

  try {
    for await (const event of runner(request)) {
      writeEvent(stdout, event);
    }
  } catch (error) {
    writeEvent(stdout, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    writeEvent(stdout, { type: 'done' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    writeEvent(process.stdout, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    writeEvent(process.stdout, { type: 'done' });
    process.exitCode = 1;
  });
}
