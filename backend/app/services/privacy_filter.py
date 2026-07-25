import os
import re
from functools import lru_cache

IGNORED_OPF_LABELS = {"private_date", "private_address"}
MODEL_CHUNK_CHARS = int(os.getenv("PRIVACY_FILTER_CHUNK_CHARS", "1200"))

LOW_RISK_TRANSACTION_LINE_RE = re.compile(
    r"^\s*(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}[日]?|\d{1,2}/\d{1,2})"
    r"(?:\s+\d{1,2}/\d{1,2})?\s+.+?\s+[-+]?¥?\d+(?:[,.]\d{3})*(?:\.\d{1,2})?"
    r"(?:\s+\d{4}\s+[-+]?¥?\d+(?:[,.]\d{3})*(?:\.\d{1,2})?(?:\([A-Z]{2}\))?)?\s*$"
)
HIGH_RISK_HINT_RE = re.compile(
    r"(@|https?://|(?:姓名|户名|客户|持卡人|电话|手机|邮箱|账号|账户|卡号|证件|身份证)\s*[:：]|"
    r"\b(?:name|customer|cardholder|account holder|phone|email)\s*:|"
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|"
    r"\b1[3-9]\d{9}\b|\b\d{3}[- ]\d{4}[- ]\d{4}\b|\b(?:\d[ -]?){13,19}\b)",
    re.IGNORECASE,
)
STANDALONE_CHINESE_NAME_RE = re.compile(r"^[\u4e00-\u9fff]{2,4}$")
STANDALONE_CHINESE_NAME_STOPWORDS = {
    "人民币",
    "账单日",
    "到期日",
    "交易日",
    "记账日",
    "金额",
    "合计",
    "总计",
    "摘要",
}


def _redact_standalone_chinese_names(text: str) -> str:
    lines = []
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        if (
            STANDALONE_CHINESE_NAME_RE.match(stripped)
            and stripped not in STANDALONE_CHINESE_NAME_STOPWORDS
        ):
            leading = line[: len(line) - len(line.lstrip())]
            trailing = "\n" if line.endswith("\n") else ""
            lines.append(f"{leading}[NAME_REDACTED]{trailing}")
        else:
            lines.append(line)
    return "".join(lines)


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
    text = _redact_standalone_chinese_names(text)
    return text


@lru_cache(maxsize=1)
def _get_openai_redactor():
    from opf import OPF

    return OPF(
        device=os.getenv("OPF_DEVICE", "cpu"),
        output_text_only=False,
    )


def _redact_spans(text: str, spans) -> str:
    kept_spans = [
        span for span in spans if getattr(span, "label", None) not in IGNORED_OPF_LABELS
    ]
    if not kept_spans:
        return text

    pieces = []
    cursor = 0
    for span in sorted(kept_spans, key=lambda item: item.start):
        pieces.append(text[cursor : span.start])
        pieces.append(span.placeholder)
        cursor = span.end
    pieces.append(text[cursor:])
    return "".join(pieces)


def chunk_text_for_privacy_filter(text: str, max_chars: int | None = None):
    max_chars = max_chars or MODEL_CHUNK_CHARS
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current = []
    current_len = 0
    for line in text.splitlines(keepends=True):
        if current and current_len + len(line) > max_chars:
            chunks.append("".join(current))
            current = [line]
            current_len = len(line)
        elif len(line) > max_chars:
            if current:
                chunks.append("".join(current))
                current = []
                current_len = 0
            for start in range(0, len(line), max_chars):
                chunks.append(line[start : start + max_chars])
        else:
            current.append(line)
            current_len += len(line)
    if current:
        chunks.append("".join(current))
    return chunks


def should_run_openai_filter(chunk: str) -> bool:
    if HIGH_RISK_HINT_RE.search(chunk):
        return True
    return False


def _redact_with_openai_filter(redactor, chunk: str) -> str:
    model_output = redactor.redact(chunk)
    if isinstance(model_output, str):
        return deterministic_redact(model_output)
    return deterministic_redact(
        _redact_spans(model_output.text, model_output.detected_spans)
    )


def anonymize_text(text: str) -> str:
    """
    Redact PII with OpenAI Privacy Filter, plus deterministic pre/post passes.

    OPF downloads its default checkpoint automatically on first use when it is
    not already present in ~/.opf/privacy_filter.
    """
    redacted = deterministic_redact(text)
    redactor = None
    chunks = []
    for chunk in chunk_text_for_privacy_filter(redacted):
        if not should_run_openai_filter(chunk):
            chunks.append(chunk)
            continue
        try:
            if redactor is None:
                redactor = _get_openai_redactor()
            chunks.append(_redact_with_openai_filter(redactor, chunk))
        except Exception as exc:
            print(
                f"OpenAI Privacy Filter chunk failed; using deterministic fallback: {exc}"
            )
            chunks.append(deterministic_redact(chunk))
    return deterministic_redact("".join(chunks))
