import re

import pdfplumber
from artifex import Artifex


def extract_text_from_pdf(file_stream):
    """
    Extracts text from a PDF file stream.

    Args:
        file_stream: A file-like object containing the PDF data.

    Returns:
        str: The extracted text from the PDF.
    """
    text = ""
    try:
        with pdfplumber.open(file_stream) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        return f"Error reading PDF: {str(e)}"

    return text


_anonymizer = None


def _deterministic_redact(text: str) -> str:
    text = re.sub(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        "[EMAIL_REDACTED]",
        text,
    )
    text = re.sub(r"\b(?:\d[ -]?){13,19}\b", "[CC_REDACTED]", text)
    text = re.sub(r"\b\d{3}[- ]\d{4}[- ]\d{4}\b", "[PHONE_REDACTED]", text)
    text = re.sub(
        r"((?:姓名|户名|客户|持卡人)\s*[:：]\s*)[\u4e00-\u9fff]{2,4}",
        r"\1[NAME_REDACTED]",
        text,
    )
    return text


def get_anonymizer():
    global _anonymizer
    if _anonymizer is None:
        try:
            print("Initializing Artifex text anonymization model...")
            _anonymizer = Artifex().text_anonymization
            print("Artifex model initialized.")
        except Exception as e:
            print(f"Error initializing Artifex: {e}")
            raise e
    return _anonymizer


def anonymize_text(text):
    """
    Anonymizes sensitive information using Artifex library.

    Args:
        text (str): The original text.

    Returns:
        str: The anonymized text.
    """
    try:
        text = _deterministic_redact(text)
        ta = get_anonymizer()
        anonymized = ta(text)
        if isinstance(anonymized, list):
            anonymized = "\n".join(str(item) for item in anonymized)
        return _deterministic_redact(str(anonymized))
    except Exception as e:
        print(f"Anonymization failed: {e}")
        return _deterministic_redact(text)
