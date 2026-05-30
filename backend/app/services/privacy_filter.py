import os
import re
from functools import lru_cache


def deterministic_redact(text: str) -> str:
    """Redact stable PII patterns that are common in bank statements."""
    text = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "[EMAIL_REDACTED]",
        text,
    )
    text = re.sub(r"\b\d{3}[- ]\d{4}[- ]\d{4}\b", "[PHONE_REDACTED]", text)
    text = re.sub(r"\b1[3-9]\d{9}\b", "[PHONE_REDACTED]", text)
    text = re.sub(r"\b(?:\d[ -]?){13,19}\b", "[CC_REDACTED]", text)
    text = re.sub(
        r"((?:姓名|户名|客户|持卡人)\s*[:：]\s*)[\u4e00-\u9fff]{2,4}",
        r"\1[NAME_REDACTED]",
        text,
    )
    return text


@lru_cache(maxsize=1)
def _get_openai_redactor():
    from opf import OPF

    return OPF(
        device=os.getenv("OPF_DEVICE", "cpu"),
        output_text_only=True,
    )


def anonymize_text(text: str) -> str:
    """
    Redact PII with OpenAI Privacy Filter, plus deterministic pre/post passes.

    OPF downloads its default checkpoint automatically on first use when it is
    not already present in ~/.opf/privacy_filter.
    """
    redacted = deterministic_redact(text)
    try:
        model_output = _get_openai_redactor().redact(redacted)
    except Exception as exc:
        print(f"OpenAI Privacy Filter failed; using deterministic fallback: {exc}")
        return deterministic_redact(redacted)
    return deterministic_redact(str(model_output))
