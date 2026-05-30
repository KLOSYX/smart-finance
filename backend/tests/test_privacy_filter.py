from app.services import privacy_filter


class FakeRedactor:
    def __init__(self):
        self.inputs = []

    def redact(self, text):
        self.inputs.append(text)
        return text.replace("张三", "[MODEL_PERSON]") + "\nextra: model@example.com"


def test_openai_privacy_filter_is_wrapped_with_deterministic_redaction(monkeypatch):
    fake = FakeRedactor()
    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", lambda: fake)

    redacted = privacy_filter.anonymize_text(
        "姓名: 张三\nEmail: john@example.com\n商户: 星巴克\n金额: 88.00"
    )

    assert fake.inputs == [
        "姓名: [NAME_REDACTED]\nEmail: [EMAIL_REDACTED]\n商户: 星巴克\n金额: 88.00"
    ]
    assert "john@example.com" not in redacted
    assert "model@example.com" not in redacted
    assert "[EMAIL_REDACTED]" in redacted
    assert "星巴克" in redacted
    assert "88.00" in redacted


def test_privacy_filter_falls_back_to_deterministic_redaction(monkeypatch):
    def fail():
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", fail)

    redacted = privacy_filter.anonymize_text("户名：李四 138-1234-5678")

    assert redacted == "户名：[NAME_REDACTED] [PHONE_REDACTED]"
