import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import pi_agent_client
from app.services.pi_agent_client import parse_agent_event, render_agent_event


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_parse_agent_event_returns_json_object():
    assert parse_agent_event('{"type":"text","delta":"hello"}\n') == {
        "type": "text",
        "delta": "hello",
    }


def test_parse_agent_event_ignores_invalid_json():
    assert parse_agent_event("debug line\n") is None


def test_render_text_event_returns_delta():
    assert render_agent_event({"type": "text", "delta": "hello"}) == "hello"


def test_render_status_event_returns_progress_line():
    assert (
        render_agent_event(
            {"type": "status", "message": "tool:start:summarize_transactions"}
        )
        == "\n> 调用工具: summarize_transactions\n"
    )


def test_render_status_end_event_returns_progress_line():
    assert (
        render_agent_event(
            {"type": "status", "message": "tool:end:summarize_transactions"}
        )
        == "\n> 工具完成: summarize_transactions\n"
    )


def test_render_error_event_returns_agent_error():
    assert (
        render_agent_event({"type": "error", "message": "boom"}) == "Agent Error: boom"
    )


def test_agent_command_uses_node_and_local_tsx(monkeypatch):
    monkeypatch.setattr(pi_agent_client.os, "name", "nt")
    monkeypatch.setattr(
        pi_agent_client.shutil,
        "which",
        lambda name: r"C:\Program Files\nodejs\node.exe"
        if name == "node.exe"
        else None,
    )
    command = pi_agent_client._agent_command()
    assert command[0].endswith("node.exe")
    assert command[1].endswith("tsx\\dist\\cli.mjs")
    assert command[2].endswith("src\\index.ts")


class FakeStdout:
    def __init__(self, lines):
        self._lines = [line.encode("utf-8") for line in lines]

    async def readline(self):
        if not self._lines:
            return b""
        return self._lines.pop(0)


class FakeStdin:
    def __init__(self, fail_on_write=False):
        self.payload = b""
        self.closed = False
        self.fail_on_write = fail_on_write

    def write(self, payload):
        if self.fail_on_write:
            raise BrokenPipeError("closed")
        self.payload += payload

    async def drain(self):
        return None

    def close(self):
        self.closed = True

    async def wait_closed(self):
        return None


class FakeProcess:
    def __init__(
        self,
        stdout_lines,
        stderr=b"",
        returncode=0,
        fail_on_write=False,
        wait_blocks=False,
    ):
        self.stdin = FakeStdin(fail_on_write=fail_on_write)
        self.stdout = FakeStdout(stdout_lines)
        self.stderr = SimpleNamespace(read=AsyncMock(return_value=stderr))
        self.returncode = returncode
        self.terminated = False
        self.killed = False
        self.wait_blocks = wait_blocks

    async def wait(self):
        if self.wait_blocks and self.returncode is None:
            await asyncio.Future()
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.killed = True
        self.returncode = -9


@pytest.mark.anyio
async def test_stream_pi_agent_chat_sends_request_and_yields_text(monkeypatch):
    process = FakeProcess(['{"type":"text","delta":"hello"}\n', '{"type":"done"}\n'])

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income_cents=0,
            investments_cents=0,
            language="en",
        )
    ]

    assert chunks == ["hello"]
    assert b'"message": "hi"' in process.stdin.payload
    assert process.stdin.closed is True


@pytest.mark.anyio
async def test_stream_pi_agent_chat_reports_nonzero_exit(monkeypatch):
    process = FakeProcess([], stderr=b"missing package", returncode=1)

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income_cents=0,
            investments_cents=0,
            language="en",
        )
    ]

    assert chunks == ["Agent Error: missing package"]


@pytest.mark.anyio
async def test_stream_pi_agent_chat_reports_empty_success(monkeypatch):
    process = FakeProcess(['{"type":"done"}\n'], returncode=0)

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    chunks = [
        chunk
        async for chunk in pi_agent_client.stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income_cents=0,
            investments_cents=0,
            language="en",
        )
    ]

    assert chunks == [
        "Agent Error: Agent returned no response. Check the model configuration and try again."
    ]


@pytest.mark.anyio
async def test_stream_pi_agent_chat_drains_stderr_while_streaming(monkeypatch):
    process = FakeProcess(['{"type":"text","delta":"hello"}\n'], stderr=b"debug")

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income_cents=0,
            investments_cents=0,
            language="en",
        )
    ]

    assert chunks == ["hello"]
    process.stderr.read.assert_awaited_once()


@pytest.mark.anyio
async def test_stream_pi_agent_chat_terminates_process_when_generator_closes(
    monkeypatch,
):
    process = FakeProcess(
        ['{"type":"text","delta":"hello"}\n', '{"type":"text","delta":"again"}\n'],
        returncode=None,
        wait_blocks=True,
    )

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    agen = stream_pi_agent_chat(
        message="hi",
        history=[],
        transactions=[],
        api_key="key",
        base_url="https://example.test/v1",
        model="test-model",
        monthly_income_cents=0,
        investments_cents=0,
        language="en",
    )

    assert await agen.__anext__() == "hello"
    await agen.aclose()

    assert process.terminated is True


@pytest.mark.anyio
async def test_stream_pi_agent_chat_handles_broken_stdin(monkeypatch):
    process = FakeProcess([], stderr=b"early exit", returncode=1, fail_on_write=True)

    async def fake_create_subprocess_exec(*args, **kwargs):
        return process

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    from app.services.pi_agent_client import stream_pi_agent_chat

    chunks = [
        chunk
        async for chunk in stream_pi_agent_chat(
            message="hi",
            history=[],
            transactions=[],
            api_key="key",
            base_url="https://example.test/v1",
            model="test-model",
            monthly_income_cents=0,
            investments_cents=0,
            language="en",
        )
    ]

    assert chunks == ["Agent Error: early exit"]
