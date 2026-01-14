import sys
import os

# Add backend directory to sys.path
sys.path.append(os.path.abspath("/home/anbinx/project/smart-finance/backend"))

from app.services.llm_client import (
    _get_agent_base_prompt,
    get_categories,
    CATEGORIES,
    CATEGORIES_EN,
)


def test_i18n_logic():
    print("Testing I18n Logic...")

    # Test Categories
    cats_zh = get_categories("zh")
    assert cats_zh == CATEGORIES
    print("✅ Chinese categories correct")

    cats_en = get_categories("en")
    assert cats_en == CATEGORIES_EN
    print("✅ English categories correct")

    # Test Agent Prompt
    prompt_zh = _get_agent_base_prompt("Summary", "zh")
    assert "请用中文回答" in prompt_zh
    print("✅ Chinese prompt contains correct instruction")

    prompt_en = _get_agent_base_prompt("Summary", "en")
    assert "Please answer in English" in prompt_en
    print("✅ English prompt contains correct instruction")

    # Test that structure is Chinese in both (as requested)
    assert "你是一位高级财务数据分析师" in prompt_zh
    assert "你是一位高级财务数据分析师" in prompt_en
    print("✅ Prompt structure remains Chinese for both languages")

    print("\nAll checks passed!")


if __name__ == "__main__":
    test_i18n_logic()
