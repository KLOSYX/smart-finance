import unittest
from unittest.mock import patch
import os
import sys

# Add backend to path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.pdf_processor import extract_text_from_pdf
from app.services.llm_client import (
    _dataframe_to_transactions,
    analyze_transactions,
    stream_chat_with_data,
)


class TestPipeline(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # Update path to be relative to the backend/tests folder
        self.dummy_pdf_path = os.path.join(
            os.path.dirname(__file__), "dummy_statement.pdf"
        )

    def test_pdf_extraction_preserves_original_text(self):
        with open(self.dummy_pdf_path, "rb") as f:
            text = extract_text_from_pdf(f)

        # Verify text content
        self.assertIn("Bank of AI", text)
        self.assertIn("UBER TRIP", text)
        self.assertIn("999.00", text)
        self.assertIn("john.doe@example.com", text)
        self.assertIn("555-0199-8888", text)
        self.assertIn("4000-1234-5678-9010", text)

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

        text = "日期 商户 金额\n" + ("2026-07-01 示例商户 10.00\n" * 500)
        result = await analyze_transactions(text, "fake-key", "fake-url", "gpt-3.5")

        mock_process_chunk.assert_awaited_once()
        self.assertEqual(mock_process_chunk.await_args.args[0], text)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["Category"], "Transportation")
        self.assertEqual(result[1]["Amount"], 5.40)

    def test_dataframe_to_transactions_for_pi_agent(self):
        import pandas as pd

        df = pd.DataFrame(
            [
                {
                    "Date": pd.Timestamp("2026-05-01 12:30:00"),
                    "Description": "Cafe",
                    "AmountCents": 1250,
                    "CategoryCode": "dining",
                    "ImportId": 1,
                    "CardLastFour": "1234",
                },
                {
                    "Date": pd.NaT,
                    "Description": None,
                    "AmountCents": None,
                    "CategoryCode": None,
                    "ImportId": None,
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
                    "amountCents": 1250,
                    "categoryCode": "dining",
                    "importId": 1,
                    "cardLastFour": "1234",
                },
                {
                    "date": None,
                    "description": "",
                    "amountCents": 0,
                    "categoryCode": "other_expense",
                    "importId": None,
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
                    "AmountCents": 1250,
                    "CategoryCode": "dining",
                    "ImportId": 1,
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
        self.assertEqual(mock_stream.call_args.kwargs["monthly_income_cents"], 1000)


if __name__ == "__main__":
    unittest.main()
