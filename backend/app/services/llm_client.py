import datetime
import asyncio

import pandas as pd

from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from app.services.pi_agent_client import stream_pi_agent_chat
from app.models.category import CATEGORY_CODES, normalize_category

CATEGORIES = [
    "住房",
    "餐饮",
    "交通",
    "公用事业",
    "购物",
    "娱乐",
    "健康与健身",
    "旅行",
    "教育",
    "债务",
    "储蓄/投资",
    "需要复核",
    "其他",
]

CATEGORIES_EN = [
    "Housing",
    "Food & Dining",
    "Transportation",
    "Utilities",
    "Shopping",
    "Entertainment",
    "Health & Fitness",
    "Travel",
    "Education",
    "Debt",
    "Savings/Investments",
    "Needs Review",
    "Other",
]


class OpenRouterChatOpenAI(ChatOpenAI):
    """
    Custom ChatOpenAI that preserves 'reasoning_details' in messages
    to satisfy OpenRouter/Gemini requirements.
    """

    def _convert_message_to_dict(self, message: BaseMessage) -> dict:
        message_dict = super()._convert_message_to_dict(message)

        # Check if we have additional_kwargs with reasoning_details
        if isinstance(message, AIMessage):
            reasoning_details = message.additional_kwargs.get("reasoning_details")
            if reasoning_details:
                message_dict["reasoning_details"] = reasoning_details

        return message_dict


def _get_llm(api_key, base_url, model):
    """
    Helper to create an OpenRouterChatOpenAI instance.
    """
    return OpenRouterChatOpenAI(api_key=api_key, base_url=base_url, model=model)


def _get_agent_base_prompt(df_summary, language="zh"):
    """
    Returns the core instructions for the data analysis agent.
    """
    lang_instruction = (
        "Please answer in English." if language == "en" else "请用中文回答。"
    )

    return f"""
你是一位高级财务数据分析师。{lang_instruction}
所有货币单位均为人民币 (¥)。正数表示支出，负数表示退款。

编写/修改 pandas 代码时请使用 .loc 避免链式赋值警告；如需对切片修改，请先 copy()。
在编写任何 pandas 代码前请确保先执行 `import pandas as pd`。

注意：1. 不要给用户除财务分析以外的任何建议；2. 不要在最终回复中包含任何代码。

数据表概览（供参考，请勿重复打印全表）：{df_summary}
"""


def get_categories(language="zh"):
    return CATEGORIES_EN if language == "en" else CATEGORIES


async def _process_chunk_async(
    chunk, api_key, base_url, model_name, semaphore, language="zh"
):
    """
    Process a single chunk using LangChain asynchronously.
    """
    async with semaphore:
        try:
            llm = _get_llm(api_key, base_url, model_name)

            current_year = datetime.datetime.now().year

            target_categories = ", ".join(CATEGORY_CODES)

            system_prompt = f"""
            你是一位专业的财务助手。你的任务是从提供的文本中提取信用卡交易详情，并将每笔交易分类到以下稳定代码之一：{target_categories}。

            严格以JSON对象列表的形式返回输出。每个对象必须包含以下键：
            - "Date": 交易日期 (格式 YYYY-MM-DD)。如果年份缺失，假设为 {current_year}。
            - "Description": 商户名称或交易描述。
            - "Amount": 交易的数值 (正数表示支出，负数表示退款，忽略信用卡还款)。
            - "Category": 从提供的代码中选择一个。
              - 如果描述模糊不清或你不确定类别，请务必使用 "needs_review"。
              - 只有当你确定它不属于上述任何主要类别时，才使用 "other"。
            - "CardLastFour": 交易卡号后四位。如果未找到，返回 null。例如："8888"。

            只返回JSON数据，不要有任何Markdown格式或解释。
            例如：[
                {{
                    "Date": "2023-01-01",
                    "Description": "超市",
                    "Amount": 50.00,
                    "Category": "shopping",
                    "CardLastFour": "1234"
                }}
            ]
            如果未找到交易，返回 []。
            """

            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", "{system_prompt}"),
                    ("user", "Here is the statement text:\n\n{text}"),
                ]
            )

            # Chain
            chain = prompt | llm | JsonOutputParser()

            # Execute
            result = await chain.ainvoke(
                {"text": chunk, "system_prompt": system_prompt}
            )
            return result

        except Exception as e:
            print(f"Error processing chunk with LangChain: {e}")
            return []


async def analyze_transactions(text, api_key, base_url, model, language="zh"):
    """
    Sends the complete statement text to the LLM in one request so table
    headers and transaction rows always share the same context.
    """
    if not text:
        return []
    result = await _process_chunk_async(
        text, api_key, base_url, model, asyncio.Semaphore(1), language
    )
    return result if isinstance(result, list) else []


async def analyze_financial_records(
    text,
    api_key,
    base_url,
    model,
    import_kind="cashflow",
    instruction=None,
    images=None,
):
    """Extract candidates without committing them to the household ledger."""
    llm = _get_llm(api_key, base_url, model)
    system_prompt = """你是家庭财务信息抽取器。只返回 JSON 数组，不要解释。
每项必须有 candidate_type，取 cashflow 或 asset_snapshot。
cashflow 字段：transaction_date(YYYY-MM-DD), description, amount(始终为正数), flow_type
(income/expense/expense_refund/transfer), category_code, channel, household_role
(husband/wife/shared), card_last_four。
asset_snapshot 字段：name, valuation_date(YYYY-MM-DD), value(正数), category_code,
channel, household_role(husband/wife/shared)。
分类或关键字段明确时使用对应的正常分类。只有确实无法判断、需要人工决定时才使用固定待复核分类：
资产使用 needs_review_asset，收入使用 needs_review_income，支出使用 needs_review。
不要因为信息来自图片或非结构化文本就自动标记待复核；信用卡还款和账户间划转用 transfer；
账单原文中的正数通常表示支出，负数通常表示退款。输出时 amount 必须转换为正数，
并仅使用 flow_type 表达方向：普通支出用 expense，退款用 expense_refund。
如果账单用“退款、退货、冲正、撤销”等文字明确表示退款，即使原始金额没有负号也使用 expense_refund。
同一商户的原支出与退款是两条不同方向的记录，不得把退款识别成第二笔 expense。
例如：“餐厅消费 200.00”应输出 amount=200.00、flow_type=expense；
“餐厅退款 -200.00”应输出 amount=200.00、flow_type=expense_refund。
禁止输出负数；禁止把退款输出为 expense。
未实现的资产涨跌不得生成收入。
住房公积金的 category_code 必须使用 provident_fund，不要使用 social_security。
正常分类的记录会自动入账；只有待复核分类的记录进入人工复核。不要输出置信度。
用户会声明本次主要内容是 asset、cashflow 或 mixed，这是识别提示而不是强制类型。
必须以实际数据内容决定 candidate_type：即使用户选错，也要把资产余额识别为 asset_snapshot，
把真实收入、支出、退款或转账识别为 cashflow；内容确实混合时可以同时返回两种类型。
“用户指令”只用于约束抽取方式，绝不能把指令中的示例、日期、金额或分类当作待录入数据。
只有“待识别文字”和图片中的内容才是财务数据来源。"""
    user_instruction = str(instruction or "").strip()
    source_text = str(text or "").strip()
    text_content = (
        f"用户声明的主要内容（仅作提示，若与数据矛盾则以实际数据为准）：{import_kind}\n"
        f"用户指令（仅作抽取规则，不是财务数据）：\n{user_instruction or '无'}\n\n"
        f"待识别文字（这是财务数据来源）：\n{source_text or '无文字，请读取所附图片'}"
    )
    human_content: list[dict] = [{"type": "text", "text": text_content}]
    for image in images or []:
        human_content.append(
            {
                "type": "image_url",
                "image_url": {"url": image["data_url"]},
            }
        )
    parser = JsonOutputParser()
    response = await llm.ainvoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_content),
        ]
    )
    result = parser.invoke(response)
    if isinstance(result, dict):
        result = result.get("items", result.get("records", []))
    if not isinstance(result, list):
        raise ValueError("模型未返回记录数组")
    return result


def _nullable_string(value):
    if value is None or pd.isna(value):
        return None
    return str(value)


def _date_to_iso(value):
    if value is None or pd.isna(value):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    try:
        parsed = pd.to_datetime(value)
    except Exception:
        return str(value)
    if pd.isna(parsed):
        return None
    return parsed.isoformat()


def _dataframe_to_transactions(df):
    """
    Convert the chat DataFrame into the JSON shape expected by the Node pi-agent.
    """
    transactions = []
    for row in df.to_dict(orient="records"):
        amount = row.get("AmountCents", 0)
        if amount is None or pd.isna(amount):
            amount = 0
        description = row.get("Description")
        category = row.get("CategoryCode")
        flow_type = row.get("FlowType")
        if flow_type not in {"income", "expense", "expense_refund", "transfer"}:
            raise ValueError(f"Invalid or missing FlowType: {flow_type!r}")
        transactions.append(
            {
                "date": _date_to_iso(row.get("Date")),
                "description": ""
                if description is None or pd.isna(description)
                else str(description),
                "amountCents": int(amount),
                "flowType": flow_type,
                "categoryCode": normalize_category(category),
                "categoryName": _nullable_string(row.get("CategoryName")),
                "channel": _nullable_string(row.get("Channel")),
                "householdRole": _nullable_string(row.get("HouseholdRole"))
                or "shared",
                "importId": int(row["ImportId"])
                if row.get("ImportId") is not None and not pd.isna(row.get("ImportId"))
                else None,
                "cardLastFour": _nullable_string(row.get("CardLastFour")),
                "importFilename": _nullable_string(row.get("ImportFilename")),
            }
        )
    return transactions


async def stream_chat_with_data(
    history,
    current_query,
    df,
    api_key,
    base_url,
    model,
    monthly_income_cents=0,
    investments_cents=0,
    language="zh",
):
    """
    Handles chat interaction using the Node pi-agent sidecar.
    """
    async for token in stream_pi_agent_chat(
        message=current_query,
        history=history or [],
        transactions=_dataframe_to_transactions(df),
        api_key=api_key,
        base_url=base_url,
        model=model,
        monthly_income_cents=monthly_income_cents,
        investments_cents=investments_cents,
        language=language,
    ):
        yield token
