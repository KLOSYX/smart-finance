import pdfplumber
import re

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

def anonymize_text(text):
    """
    Anonymizes sensitive information in the text (Email, Phone, Credit Card, Chinese Names).
    
    Args:
        text (str): The original text.
        
    Returns:
        str: The anonymized text.
    """
    redacted_info = []

    # 1. Email Addresses
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    
    def log_email(match):
        redacted_info.append(f"Email: {match.group(0)}")
        return '[EMAIL_REDACTED]'
        
    text = re.sub(email_pattern, log_email, text)
    
    # 2. Chinese ID Cards (18 digits, last can be X)
    # Match before phone numbers to avoid partial matches
    id_card_pattern = r'\b\d{17}[\dXx]\b'
    
    def log_id_card(match):
        redacted_info.append(f"ID Card: {match.group(0)}")
        return '[ID_REDACTED]'
    
    text = re.sub(id_card_pattern, log_id_card, text)

    # 3. Credit Card Numbers
    # Allow for spaces or dashes, 13-16 digits
    cc_pattern = r'\b(?:\d[ -]*?){13,16}\b'
    
    def redact_cc(match):
        s = match.group(0)
        digits = re.sub(r'[ -]', '', s)
        # Filter out things that look like timestamps or long integers if they don't pass luhn (optional, but keep simple for now)
        # But valid CCs are usually 13-19 digits.
        if len(digits) >= 13:
            redacted_info.append(f"Credit Card: {s}")
            return '[CC_REDACTED]'
        return s

    text = re.sub(cc_pattern, redact_cc, text)

    # 4. Chinese Phone Numbers (11 digits starting with 1, optional spaces/dashes)
    # e.g. 138 0013 8000, 138-0013-8000
    cn_phone_pattern = r'\b1[3-9](?:[- ]?\d){9}\b'
    
    def log_cn_phone(match):
        redacted_info.append(f"Phone (CN): {match.group(0)}")
        return '[PHONE_REDACTED]'
        
    text = re.sub(cn_phone_pattern, log_cn_phone, text)

    # 5. Generic Phone Numbers
    phone_pattern = r'(\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}'
    
    def log_generic_phone(match):
        val = match.group(0)
        # Check if it overlaps with already redacted content
        if "REDACTED" in val:
             return val
        
        redacted_info.append(f"Phone (Generic): {val}")
        return '[PHONE_REDACTED]'

    text = re.sub(phone_pattern, log_generic_phone, text)
    
    # 6. Names (Chinese & English Contexts)
    # Expanded keywords and patterns
    
    def redact_name(match):
        label = match.group(1)
        name = match.group(2)
        redacted_info.append(f"Name: {name}")
        return label + "[NAME_REDACTED]"
        
    # Pattern: Label (e.g., "Name:", "姓名:") + whitespace + Name
    # Supports Chinese names (2-4 chars) and English names (Capitalized Words)
    
    # Chinese Names with Labels
    cn_name_pattern = r'((?:姓名|户名|客户|持卡人|用户|业主|Name|Customer)[:：]?\s*)([\u4e00-\u9fa5]{2,4})'
    text = re.sub(cn_name_pattern, redact_name, text)
    
    # English Names with Labels (Simple heuristic: 2-3 capitalized words)
    en_name_pattern = r'((?:Name|Customer|Holder)[:：]?\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})'
    text = re.sub(en_name_pattern, redact_name, text)
    
    if redacted_info:
        print("\n--- ANONYMIZATION LOG ---")
        for info in redacted_info:
            print(f"Redacted: {info}")
        print("-------------------------\n")
    else:
        print("DEBUG: No sensitive information found to redact.")
    
    return text
