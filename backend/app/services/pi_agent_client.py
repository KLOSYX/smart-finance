import asyncio
import json
from pathlib import Path
from typing import Any, AsyncIterator


AGENT_DIR = Path(__file__).resolve().parents[3] / "agent"
AGENT_ENTRYPOINT = AGENT_DIR / "src" / "index.ts"
PROCESS_TERMINATION_TIMEOUT = 2


def parse_agent_event(line: str) -> dict[str, Any] | None:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return None
    return event if isinstance(event, dict) else None


def render_agent_event(event: dict[str, Any]) -> str | None:
    event_type = event.get("type")
    if event_type == "text":
        delta = event.get("delta", "")
        return delta if isinstance(delta, str) else ""
    if event_type == "status":
        message = event.get("message", "")
        if isinstance(message, str) and message.startswith("tool:start:"):
            return f"\n> 调用工具: {message.removeprefix('tool:start:')}\n"
        if isinstance(message, str) and message.startswith("tool:end:"):
            return f"\n> 工具完成: {message.removeprefix('tool:end:')}\n"
        return None
    if event_type == "error":
        message = event.get("message", "Unknown pi-agent error")
        return f"Agent Error: {message}"
    return None


async def stream_pi_agent_chat(
    *,
    message: str,
    history: list[dict[str, str]],
    transactions: list[dict[str, Any]],
    api_key: str,
    base_url: str,
    model: str,
    monthly_income: float,
    investments: float,
    language: str,
) -> AsyncIterator[str]:
    request = {
        "message": message,
        "history": history[-5:],
        "language": language,
        "financialContext": {
            "monthlyIncome": monthly_income,
            "investments": investments,
        },
        "llm": {
            "apiKey": api_key,
            "baseUrl": base_url,
            "model": model,
        },
        "transactions": transactions,
    }

    try:
        process = await asyncio.create_subprocess_exec(
            "npx",
            "tsx",
            str(AGENT_ENTRYPOINT),
            cwd=str(AGENT_DIR),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        yield "Agent Error: Node.js/npx is not available. Please install Node.js dependencies in the agent directory."
        return

    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None

    stderr_task = asyncio.create_task(process.stderr.read())
    emitted_error = False

    try:
        payload = json.dumps(request, ensure_ascii=False).encode("utf-8")
        try:
            process.stdin.write(payload)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()
        except (BrokenPipeError, ConnectionResetError):
            returncode = await process.wait()
            stderr = (await stderr_task).decode("utf-8", errors="replace").strip()
            yield f"Agent Error: {stderr or f'pi-agent process exited with code {returncode}'}"
            return

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            event = parse_agent_event(line.decode("utf-8", errors="replace"))
            if event is None:
                continue
            rendered = render_agent_event(event)
            if rendered:
                emitted_error = event.get("type") == "error" or emitted_error
                yield rendered

        returncode = await process.wait()
        stderr = (await stderr_task).decode("utf-8", errors="replace").strip()
        if returncode != 0 and not emitted_error:
            yield f"Agent Error: {stderr or f'pi-agent process exited with code {returncode}'}"
    finally:
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(
                    process.wait(), timeout=PROCESS_TERMINATION_TIMEOUT
                )
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
        if not stderr_task.done():
            stderr_task.cancel()
            try:
                await stderr_task
            except asyncio.CancelledError:
                pass
