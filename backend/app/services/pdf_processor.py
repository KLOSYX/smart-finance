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
        ta = get_anonymizer()
        return ta(text)
    except Exception as e:
        print(f"Anonymization failed: {e}")
        return text  # Return original text on failure to avoid complete breakage
