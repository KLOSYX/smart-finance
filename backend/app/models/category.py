from __future__ import annotations

from typing import Final


DEFAULT_CATEGORIES: Final[dict[str, tuple[tuple[str, str], ...]]] = {
    "asset": (
        ("needs_review_asset", "待复核"),
        ("cash", "现金"),
        ("demand_deposit", "活期存款"),
        ("time_deposit", "定期存款"),
        ("e_wallet", "电子钱包"),
        ("money_market", "货币基金"),
        ("bank_wealth", "银行理财"),
        ("fixed_income", "固收理财"),
        ("fund", "基金"),
        ("stock", "股票"),
        ("bond", "债券"),
        ("gold", "黄金"),
        ("insurance_cash_value", "保险现金价值"),
        ("provident_fund", "住房公积金"),
        ("other_asset", "其他资产"),
    ),
    "income": (
        ("needs_review_income", "待复核"),
        ("salary", "工资"),
        ("bonus", "奖金"),
        ("investment_income", "理财收益"),
        ("business_income", "经营收入"),
        ("gift_income", "礼金收入"),
        ("other_income", "其他收入"),
    ),
    "expense": (
        ("housing", "住房"),
        ("dining", "餐饮"),
        ("transportation", "交通"),
        ("utilities", "水电燃气"),
        ("shopping", "购物"),
        ("entertainment", "娱乐"),
        ("health_fitness", "医疗健康"),
        ("travel", "旅行"),
        ("education", "教育"),
        ("family", "家庭与育儿"),
        ("insurance", "保险"),
        ("tax", "税费"),
        ("needs_review", "待复核"),
        ("other_expense", "其他支出"),
    ),
}

DEFAULT_CODE_TO_DOMAIN: Final[dict[str, str]] = {
    code: domain for domain, rows in DEFAULT_CATEGORIES.items() for code, _ in rows
}
CATEGORY_CODES: Final[tuple[str, ...]] = tuple(code for rows in DEFAULT_CATEGORIES.values() for code, _ in rows)


def default_category_name(code: str) -> str:
    for rows in DEFAULT_CATEGORIES.values():
        for candidate, name in rows:
            if candidate == code:
                return name
    return code


def normalize_legacy_expense_category(value: str | None) -> str:
    key = str(value or "").strip().lower()
    aliases = {
        "住房": "housing", "housing": "housing",
        "餐饮": "dining", "food": "dining", "food & dining": "dining", "dining": "dining",
        "交通": "transportation", "transportation": "transportation",
        "公用事业": "utilities", "utilities": "utilities",
        "购物": "shopping", "shopping": "shopping",
        "娱乐": "entertainment", "entertainment": "entertainment",
        "健康与健身": "health_fitness", "health & fitness": "health_fitness", "health": "health_fitness",
        "旅行": "travel", "travel": "travel",
        "教育": "education", "education": "education",
        "需要复核": "needs_review", "needs review": "needs_review", "needs_review": "needs_review",
        "其他": "other_expense", "other": "other_expense",
        "债务": "other_expense", "debt": "other_expense",
        "储蓄/投资": "other_expense", "savings/investments": "other_expense", "savings_investments": "other_expense",
    }
    return aliases.get(key, key if key in DEFAULT_CODE_TO_DOMAIN and DEFAULT_CODE_TO_DOMAIN[key] == "expense" else "other_expense")


def normalize_category(value: str | None) -> str:
    return normalize_legacy_expense_category(value)
