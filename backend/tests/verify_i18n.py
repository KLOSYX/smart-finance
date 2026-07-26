from app.models.category import CATEGORY_CODES, CATEGORY_LABELS
from app.services.llm_client import get_categories


def test_category_i18n_uses_stable_codes():
    assert get_categories("zh") == [
        CATEGORY_LABELS[code]["zh"] for code in CATEGORY_CODES
    ]
    assert get_categories("en") == [
        CATEGORY_LABELS[code]["en"] for code in CATEGORY_CODES
    ]
