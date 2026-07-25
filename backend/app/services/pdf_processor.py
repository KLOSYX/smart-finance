import pdfplumber

from app.services.privacy_filter import anonymize_text

__all__ = ["anonymize_text", "extract_text_from_pdf"]


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
