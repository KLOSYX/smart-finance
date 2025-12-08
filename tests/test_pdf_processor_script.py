from src.pdf_processor import anonymize_text

def test_anonymize():
    sample_text = """
    Contact me at test.user@example.com or call +1-555-0199-8888.
    My local number is 123-456-7890.
    In China call 13800138000.
    My card is 4111 1111 1111 1111.
    Another card: 4000-1234-5678-9010
    Bill date: 2023-10-01. Amount: 1000.
    """
    
    anonymized = anonymize_text(sample_text)
    print("Original:\n", sample_text)
    print("-" * 20)
    print("Anonymized:\n", anonymized)
    
    assert "[EMAIL_REDACTED]" in anonymized
    assert "test.user@example.com" not in anonymized
    assert "[PHONE_REDACTED]" in anonymized
    assert "13800138000" not in anonymized
    assert "[CC_REDACTED]" in anonymized
    assert "4111 1111 1111 1111" not in anonymized
    
    # Ensure dates/amounts are preserved (rudimentary check)
    assert "2023-10-01" in anonymized
    assert "1000" in anonymized

if __name__ == "__main__":
    test_anonymize()
