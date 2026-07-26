import io
import unittest
from unittest.mock import Mock, patch
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

    @patch("app.services.pdf_processor._get_converter")
    def test_pdf_extraction_returns_table_aware_markdown(self, get_converter):
        document = Mock()
        document.export_to_markdown.return_value = """# Bank of AI

| Date | Description | Amount |
|---|---|---:|
| 2026-07-01 | UBER TRIP | 999.00 |

john.doe@example.com
555-0199-8888
4000-1234-5678-9010
"""
        get_converter.return_value.convert.return_value.document = document

        with open(self.dummy_pdf_path, "rb") as f:
            text = extract_text_from_pdf(f)

        self.assertIn("Bank of AI", text)
        self.assertIn("| Date | Description | Amount |", text)
        self.assertIn("UBER TRIP", text)
        self.assertIn("999.00", text)
        self.assertIn("john.doe@example.com", text)
        self.assertIn("555-0199-8888", text)
        self.assertIn("4000-1234-5678-9010", text)
        source = get_converter.return_value.convert.call_args.args[0]
        self.assertEqual(source.name, "statement.pdf")
        document.export_to_markdown.assert_called_once_with()

    @patch("app.services.pdf_processor._get_converter")
    def test_pdf_extraction_returns_empty_for_no_document_text(self, get_converter):
        document = Mock()
        document.export_to_markdown.return_value = " \n"
        get_converter.return_value.convert.return_value.document = document

        self.assertEqual(extract_text_from_pdf(self._pdf_stream()), "")

    def _pdf_stream(self):
        with open(self.dummy_pdf_path, "rb") as pdf:
            return io.BytesIO(pdf.read())

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
                    "FlowType": "expense",
                    "CategoryCode": "dining",
                    "CategoryName": "餐饮",
                    "Channel": "支付宝",
                    "HouseholdRole": "wife",
                    "ImportId": 1,
                    "ImportFilename": "支付宝账单.txt",
                    "CardLastFour": "1234",
                },
                {
                    "Date": pd.NaT,
                    "Description": None,
                    "AmountCents": None,
                    "FlowType": "transfer",
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
                    "flowType": "expense",
                    "categoryCode": "dining",
                    "categoryName": "餐饮",
                    "channel": "支付宝",
                    "householdRole": "wife",
                    "importId": 1,
                    "cardLastFour": "1234",
                    "importFilename": "支付宝账单.txt",
                },
                {
                    "date": None,
                    "description": "",
                    "amountCents": 0,
                    "flowType": "transfer",
                    "categoryCode": "other_expense",
                    "categoryName": None,
                    "channel": None,
                    "householdRole": "shared",
                    "importId": None,
                    "cardLastFour": None,
                    "importFilename": None,
                },
            ],
        )

    def test_dataframe_to_transactions_requires_explicit_flow_type(self):
        import pandas as pd

        with self.assertRaisesRegex(ValueError, "missing FlowType"):
            _dataframe_to_transactions(
                pd.DataFrame(
                    [
                        {
                            "Date": "2026-05-01",
                            "Description": "Salary",
                            "AmountCents": 500000,
                        }
                    ]
                )
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
                    "FlowType": "expense",
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
