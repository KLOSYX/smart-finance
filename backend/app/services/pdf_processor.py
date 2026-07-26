import pdfplumber

__all__ = ["extract_text_from_pdf"]


def extract_text_from_pdf(file_stream):
    """
    Extracts text from a PDF file stream.

    Args:
        file_stream: A file-like object containing the PDF data.

    Returns:
        str: The extracted text from the PDF.
    """
    text_parts: list[str] = []
    with pdfplumber.open(file_stream) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text and page_text.strip():
                text_parts.append(page_text.strip())
    return "\n".join(text_parts)
