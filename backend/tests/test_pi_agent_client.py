from app.services.pi_agent_client import parse_agent_event, render_agent_event


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
