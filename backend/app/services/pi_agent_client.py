import json
from typing import Any


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
