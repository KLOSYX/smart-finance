from __future__ import annotations

import io
import threading
from functools import lru_cache
from typing import BinaryIO

from docling.datamodel.base_models import DocumentStream, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption

__all__ = ["extract_text_from_pdf"]

_CONVERSION_LOCK = threading.Lock()


@lru_cache(maxsize=1)
def _get_converter() -> DocumentConverter:
    """Build one reusable, text-only PDF converter for the API process."""
    pipeline_options = PdfPipelineOptions(
        do_ocr=False,
        do_table_structure=True,
    )
    pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF],
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        },
    )


def extract_text_from_pdf(file_stream: BinaryIO) -> str:
    """Convert a text-based PDF into table-aware Markdown for LLM extraction."""
    if hasattr(file_stream, "seek"):
        file_stream.seek(0)
    content = file_stream.read()
    if not content:
        return ""

    source = DocumentStream(
        name="statement.pdf",
        stream=io.BytesIO(content),
    )
    # The converter owns reusable model state. Serialize conversions so concurrent
    # uploads cannot mutate that state at the same time.
    with _CONVERSION_LOCK:
        result = _get_converter().convert(source)
    return result.document.export_to_markdown().strip()
