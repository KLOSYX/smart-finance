from __future__ import annotations

import asyncio

from langchain_core.messages import AIMessage

from app.services import llm_client


def test_multimodal_prompt_keeps_instruction_separate_from_source(monkeypatch):
    captured = {}

    class FakeLlm:
        async def ainvoke(self, messages):
            captured["messages"] = messages
            return AIMessage(content="[]")

    monkeypatch.setattr(llm_client, "_get_llm", lambda *_args, **_kwargs: FakeLlm())
    result = asyncio.run(llm_client.analyze_financial_records(
        text="支付宝余额 12680 元",
        api_key="test",
        base_url="https://example.test",
        model="vision-test",
        import_kind="asset",
        instruction="示例金额 999 元不要录入，只读取图片第二列",
        images=[{
            "filename": "asset.png",
            "mime_type": "image/png",
            "data_url": "data:image/png;base64,aGVsbG8=",
        }],
    ))

    assert result == []
    system_message, human_message = captured["messages"]
    assert "用户指令”只用于约束抽取方式" in system_message.content
    assert "amount 必须转换为正数" in system_message.content
    assert "退款用 expense_refund" in system_message.content
    assert "禁止输出负数" in system_message.content
    assert "若与数据矛盾则以实际数据为准" in human_message.content[0]["text"]
    assert isinstance(human_message.content, list)
    text_part, image_part = human_message.content
    assert "用户指令（仅作抽取规则，不是财务数据）" in text_part["text"]
    assert "示例金额 999 元不要录入" in text_part["text"]
    assert "待识别文字（这是财务数据来源）" in text_part["text"]
    assert "支付宝余额 12680 元" in text_part["text"]
    assert image_part == {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,aGVsbG8="},
    }
