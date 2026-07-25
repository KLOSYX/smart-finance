import unittest
from unittest.mock import patch
import os
import sys

# Add backend to path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.pdf_processor import extract_text_from_pdf, anonymize_text
from app.services.llm_client import (
    _dataframe_to_transactions,
    analyze_transactions,
    generate_financial_advice,
    stream_chat_with_data,
)


class TestPipeline(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Update path to be relative to the backend/tests folder
        self.dummy_pdf_path = os.path.join(
            os.path.dirname(__file__), "dummy_statement.pdf"
        )

    @patch("app.services.privacy_filter._get_openai_redactor")
    def test_pdf_extraction_and_anonymization(self, mock_redactor):
        mock_redactor.side_effect = RuntimeError("skip model in unit test")
        with open(self.dummy_pdf_path, "rb") as f:
            text = extract_text_from_pdf(f)

        # Verify text content
        self.assertIn("Bank of AI", text)
        self.assertIn("UBER TRIP", text)
        self.assertIn("999.00", text)

        # Anonymize
        clean_text = anonymize_text(text)

        # Verify PII removal
        self.assertNotIn("john.doe@example.com", clean_text)
        self.assertIn("[EMAIL_REDACTED]", clean_text)

        self.assertNotIn("555-0199-8888", clean_text)
        self.assertIn("[PHONE_REDACTED]", clean_text)

        self.assertNotIn("4000-1234-5678-9010", clean_text)
        self.assertIn("[CC_REDACTED]", clean_text)

    @patch("app.services.privacy_filter._get_openai_redactor")
    def test_chinese_name_redaction(self, mock_redactor):
        mock_redactor.side_effect = RuntimeError("skip model in unit test")
        text = """
        姓名: 张三
        户名：李四
        客户: 王五
        持卡人: 赵六
        Description: 购买了苹果
        """
        clean = anonymize_text(text)

        self.assertNotIn("张三", clean)
        self.assertNotIn("李四", clean)
        self.assertNotIn("王五", clean)
        self.assertNotIn("赵六", clean)
        self.assertIn("姓名: [NAME_REDACTED]", clean)
        self.assertIn("户名：[NAME_REDACTED]", clean)
        # Ensure common words aren't redacted
        self.assertIn("购买了苹果", clean)

    @patch("app.services.llm_client._process_chunk_async")
    async def test_llm_analysis(self, mock_process_chunk):
        # Mocking the helper function response directly
        mock_process_chunk.return_value = [
            {
                "Date": "2023-10-01",
                "Description": "UBER TRIP",
                "Amount": 25.50,
                "Category": "Transportation",
            },
            {
                "Date": "2023-10-02",
                "Description": "STARBUCKS",
                "Amount": 5.40,
                "Category": "Food & Dining",
            },
        ]

        text = "Simulated extracted text"
        result = await analyze_transactions(text, "fake-key", "fake-url", "gpt-3.5")

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["Category"], "Transportation")
        self.assertEqual(result[1]["Amount"], 5.40)

    def test_financial_advice(self):
        import pandas as pd

        df = pd.DataFrame([{"Category": "Food", "Amount": 100}])

        advice = generate_financial_advice(df, "fake-key", "fake-url", "gpt-3.5")
        self.assertEqual(advice, "Please use agentic_financial_advice instead.")

    def test_dataframe_to_transactions_for_pi_agent(self):
        import pandas as pd

        df = pd.DataFrame(
            [
                {
                    "Date": pd.Timestamp("2026-05-01 12:30:00"),
                    "Description": "Cafe",
                    "Amount": 12.5,
                    "Category": "Food",
                    "Source": "statement.pdf",
                    "CardLastFour": "1234",
                },
                {
                    "Date": pd.NaT,
                    "Description": None,
                    "Amount": None,
                    "Category": None,
                    "Source": None,
                    "CardLastFour": None,
                },
            ]
        )

        self.assertEqual(
            _dataframe_to_transactions(df),
            [
                {
                    "date": "2026-05-01T12:30:00",
                    "description": "Cafe",
                    "amount": 12.5,
                    "category": "Food",
                    "source": "statement.pdf",
                    "cardLastFour": "1234",
                },
                {
                    "date": None,
                    "description": "",
                    "amount": 0.0,
                    "category": "Other",
                    "source": None,
                    "cardLastFour": None,
                },
            ],
        )

    @patch("app.services.llm_client.stream_pi_agent_chat")
    async def test_stream_chat_with_data_uses_pi_agent(self, mock_stream):
        import pandas as pd

        async def fake_stream(**kwargs):
            yield f"rows={len(kwargs['transactions'])}"

        mock_stream.side_effect = fake_stream
        df = pd.DataFrame(
            [
                {
                    "Date": "2026-05-01",
                    "Description": "Cafe",
                    "Amount": 12.5,
                    "Category": "Food",
                    "Source": "statement.pdf",
                    "CardLastFour": "1234",
                }
            ]
        )

        chunks = [
            chunk
            async for chunk in stream_chat_with_data(
                [{"role": "user", "content": "hi"}],
                "summary",
                df,
                "key",
                "https://example.test/v1",
                "model",
                1000,
                100,
                "en",
            )
        ]

        self.assertEqual(chunks, ["rows=1"])
        mock_stream.assert_called_once()
        self.assertEqual(mock_stream.call_args.kwargs["message"], "summary")
        self.assertEqual(mock_stream.call_args.kwargs["monthly_income"], 1000)


if __name__ == "__main__":
    unittest.main()
