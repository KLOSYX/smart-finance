from app.services import privacy_filter
from types import SimpleNamespace


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


def test_openai_privacy_filter_keeps_dates_and_addresses(monkeypatch):
    text = "Name: Alice paid on 2023-10-01 at Shanghai Road 1."

    class ResultRedactor:
        def redact(self, value):
            assert value == text
            return SimpleNamespace(
                text=value,
                detected_spans=(
                    SimpleNamespace(
                        label="private_person",
                        start=value.index("Alice"),
                        end=value.index("Alice") + len("Alice"),
                        placeholder="[PRIVATE_PERSON]",
                    ),
                    SimpleNamespace(
                        label="private_date",
                        start=value.index("2023-10-01"),
                        end=value.index("2023-10-01") + len("2023-10-01"),
                        placeholder="[PRIVATE_DATE]",
                    ),
                    SimpleNamespace(
                        label="private_address",
                        start=value.index("Shanghai Road 1"),
                        end=value.index("Shanghai Road 1") + len("Shanghai Road 1"),
                        placeholder="[PRIVATE_ADDRESS]",
                    ),
                ),
            )

    monkeypatch.setattr(
        privacy_filter, "_get_openai_redactor", lambda: ResultRedactor()
    )

    redacted = privacy_filter.anonymize_text(text)

    assert redacted == "Name: [PRIVATE_PERSON] paid on 2023-10-01 at Shanghai Road 1."


def test_privacy_filter_chunks_long_text_before_model(monkeypatch):
    fake = FakeRedactor()
    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", lambda: fake)
    monkeypatch.setattr(privacy_filter, "MODEL_CHUNK_CHARS", 20)

    text = "Name: Alice\n" * 8

    privacy_filter.anonymize_text(text)

    assert len(fake.inputs) > 1
    assert "".join(fake.inputs) == text


def test_privacy_filter_skips_low_risk_transaction_chunks(monkeypatch):
    fake = FakeRedactor()
    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", lambda: fake)

    text = "\n".join(
        [
            "2025-11-01 星巴克 38.00",
            "2025-11-02 地铁 6.00",
            "2025-11-03 京东 199.00",
        ]
    )

    redacted = privacy_filter.anonymize_text(text)

    assert fake.inputs == []
    assert redacted == text


def test_privacy_filter_runs_model_for_standalone_chinese_name(monkeypatch):
    fake = FakeRedactor()
    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", lambda: fake)

    redacted = privacy_filter.anonymize_text(
        "招商银行信用卡对账单\n张三\n2025年11月21日"
    )

    assert fake.inputs == []
    assert redacted == "招商银行信用卡对账单\n[NAME_REDACTED]\n2025年11月21日"


def test_privacy_filter_skips_statement_headers_without_pii_hints(monkeypatch):
    fake = FakeRedactor()
    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", lambda: fake)

    text = "招商银行信用卡对账单\nCMB Credit Card Statement\n账单日 信用额度\n2025年11月21日 ¥ 35,000.00"

    redacted = privacy_filter.anonymize_text(text)

    assert fake.inputs == []
    assert redacted == text


def test_privacy_filter_does_not_load_model_when_all_chunks_are_low_risk(monkeypatch):
    calls = []

    def track_load():
        calls.append(True)
        return FakeRedactor()

    monkeypatch.setattr(privacy_filter, "_get_openai_redactor", track_load)

    text = "招商银行信用卡对账单\nCMB Credit Card Statement\n账单日 信用额度\n2025年11月21日 ¥ 35,000.00"

    assert privacy_filter.anonymize_text(text) == text
    assert calls == []
