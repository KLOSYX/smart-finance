import datetime
import warnings
import asyncio

import pandas as pd

from langchain_openai import ChatOpenAI
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_experimental.agents import create_pandas_dataframe_agent

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


def _get_llm(api_key, base_url, model, temperature=0.1):
    """
    Helper to create an OpenRouterChatOpenAI instance.
    """
    return OpenRouterChatOpenAI(
        api_key=api_key, base_url=base_url, model=model, temperature=temperature
    )


def _format_financial_context(monthly_income=0, investments=0):
    """
    Constructs a consistent context string for financial data.
    """
    context = ""
    if monthly_income > 0:
        context += f"User Monthly Income: ¥{monthly_income:,.2f}. "
    if investments > 0:
        context += f"User Current Investments: ¥{investments:,.2f}. "
    return context


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

数据表概览（供参考，请勿重复打印全表）：{df_summary}
"""


def get_categories(language="zh"):
    return CATEGORIES_EN if language == "en" else CATEGORIES


def _chunk_text(text, max_chars=8000):
    if not text:
        return []
    lines = text.split("\n")
    chunks = []
    current_chunk = []
    current_length = 0
    for line in lines:
        line_len = len(line)
        if current_length + line_len > max_chars and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_length = line_len
        else:
            current_chunk.append(line)
            current_length += line_len + 1
    if current_chunk:
        chunks.append("\n".join(current_chunk))
    return chunks


async def _process_chunk_async(
    chunk, api_key, base_url, model_name, semaphore, language="zh"
):
    """
    Process a single chunk using LangChain asynchronously.
    """
    async with semaphore:
        try:
            llm = _get_llm(api_key, base_url, model_name, temperature=0.1)

            current_year = datetime.datetime.now().year

            target_categories = CATEGORIES_EN if language == "en" else CATEGORIES

            # Example category for the prompt (Shopping / 购物)
            ex_category = target_categories[4]

            system_prompt = f"""
            你是一位专业的财务助手。你的任务是从提供的文本中提取信用卡交易详情，并将每笔交易分类到以下类别之一：{", ".join(target_categories)}。

            严格以JSON对象列表的形式返回输出。每个对象必须包含以下键：
            - "Date": 交易日期 (格式 YYYY-MM-DD)。如果年份缺失，假设为 {current_year}。
            - "Description": 商户名称或交易描述。
            - "Amount": 交易的数值 (正数表示支出，负数表示退款，忽略信用卡还款)。
            - "Category": 从提供的类别中选择一个。
              - 如果描述模糊不清或你不确定类别，请务必使用 "需要复核"。
              - 只有当你确定它不属于上述任何主要类别时，才使用 "其他"。
            - "CardLastFour": 交易卡号后四位。如果未找到，返回 null。例如："8888"。

            只返回JSON数据，不要有任何Markdown格式或解释。
            例如：[
                {{
                    "Date": "2023-01-01",
                    "Description": "超市",
                    "Amount": 50.00,
                    "Category": "{ex_category}",
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
    Sends the anonymized text to the LLM to extract and classify transactions using LangChain asynchronously.
    """
    print(f"DEBUG: Starting LangChain analysis with model='{model}'")
    chunks = _chunk_text(text)
    print(f"DEBUG: Text split into {len(chunks)} chunks. Processing in parallel...")

    all_transactions = []

    # Limit concurrent requests
    semaphore = asyncio.Semaphore(5)

    tasks = [
        _process_chunk_async(chunk, api_key, base_url, model, semaphore, language)
        for chunk in chunks
    ]

    results = await asyncio.gather(*tasks)

    for data in results:
        if data and isinstance(data, list):
            all_transactions.extend(data)

    print(f"DEBUG: Total transactions found: {len(all_transactions)}")
    return all_transactions


def _summarize_dataframe(df, max_cols=15):
    """
    Provide a lightweight description of the DataFrame to give the LLM context.
    """
    if df is None:
        return "无可用数据表。"
    n_rows, n_cols = df.shape
    cols = list(df.columns)
    col_summaries = []
    for col in cols[:max_cols]:
        series = df[col]
        dtype = series.dtype
        nulls = int(series.isna().sum())
        col_summaries.append(f"{col} (dtype={dtype}, nulls={nulls})")
    if len(cols) > max_cols:
        col_summaries.append(f"...另外 {len(cols) - max_cols} 列")
    columns_desc = "; ".join(col_summaries) if col_summaries else "无列信息"
    return f"行数: {n_rows}，列数: {n_cols}。列信息: {columns_desc}"


def _extract_final_answer(text):
    """
    Trim agent chatter and keep only the final answer section.
    """
    if not isinstance(text, str):
        return text
    marker = "FINAL ANSWER:"
    idx = text.rfind(marker)
    if idx == -1:
        return text.strip()
    return text[idx:].strip()


def run_autonomous_agent(df, query, api_key, base_url, model, max_turns=20):
    """
    Pure executor for LangChain's Pandas DataFrame Agent.
    """
    print("DEBUG: Executing LangChain Pandas Agent...")

    try:
        # Work on a deep copy to reduce chained-assignment pitfalls from upstream slices.
        df_for_agent = df.copy(deep=True)
        llm = _get_llm(api_key, base_url, model, temperature=0)

        # Create the agent
        with warnings.catch_warnings():
            # Silence SettingWithCopyWarning that can surface from LLM-generated code.
            warnings.simplefilter("ignore", pd.errors.SettingWithCopyWarning)

            agent = create_pandas_dataframe_agent(
                llm,
                df_for_agent,
                verbose=True,
                agent_type="openai-tools",
                allow_dangerous_code=True,
                max_iterations=max_turns,
                handle_parsing_errors=True,
            )

        print(f"DEBUG: Invoking Agent with query: {query[:50]}...")
        response = agent.invoke(query)

        output = response.get("output", "Agent failed to generate output.")
        return _extract_final_answer(output)

    except Exception as e:
        print(f"Error running LangChain Agent: {e}")
        return f"Agent Error: {e}. Please try a different model."


def agentic_financial_advice(
    df, api_key, base_url, model, monthly_income=0, investments=0
):
    """
    Wrapper for the autonomous agent to generate financial advice.
    """
    df_summary = _summarize_dataframe(df)
    context_info = _format_financial_context(monthly_income, investments)
    base_prompt = _get_agent_base_prompt(df_summary)

    full_prompt = f"""
{base_prompt}

任务目标：基于提供的财务数据提供一份全面的财务健康报告和可操作的建议。
财务背景：{context_info}

分析步骤要求：
1. 识别支出排名前几位的类别和商户。
2. 分析支出趋势（例如：周末与工作日、重复性账单）。
3. 计算储蓄率（如果提供了收入信息）并评估财务健康状况。
4. 检测任何异常支出。

请给出 3-5 条具体建议。
"""

    return run_autonomous_agent(df, full_prompt, api_key, base_url, model)


def generate_financial_advice(
    summary_df, api_key, base_url, model, monthly_income=0, investments=0
):
    """
    Backward compatibility wrapper.
    """
    return agentic_financial_advice(
        summary_df, api_key, base_url, model, monthly_income, investments
    )


async def stream_autonomous_agent(df, query, api_key, base_url, model, max_turns=20):
    """
    Streaming executor for LangChain's Pandas DataFrame Agent.
    Yields chunks of the final answer.
    """
    print("DEBUG: Executing LangChain Pandas Agent (Streaming)...")

    try:
        # Work on a deep copy
        df_for_agent = df.copy(deep=True)
        llm = _get_llm(api_key, base_url, model, temperature=0)

        # Create the agent
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", pd.errors.SettingWithCopyWarning)
            agent = create_pandas_dataframe_agent(
                llm,
                df_for_agent,
                verbose=True,
                agent_type="openai-tools",
                allow_dangerous_code=True,
                max_iterations=max_turns,
                handle_parsing_errors=True,
            )

        print(f"DEBUG: Streaming Agent with query: {query[:50]}...")

        # Use astream_events to get granular updates
        # We perform a simple filter: only yield chunks from the final 'on_chat_model_stream'
        # or similar events that represent the final text output.
        # Alternatively, using agent.astream() with stream_mode="values" is often simpler for final output.
        # But 'openai-tools' agents are complex. Let's try agent.astream() which usually yields Input/Output dicts.
        # For actual token streaming, we need to iterate over the 'messages' from appropriate events.

        async for chunk in agent.astream_events({"input": query}, version="v2"):
            event = chunk["event"]

            # Debug: Log all events to understand structure (可以之后删除)
            if "tool" in event.lower():
                print(
                    f"DEBUG TOOL EVENT: {event} | name={chunk.get('name')} | data keys={list(chunk.get('data', {}).keys())}"
                )

            # Tool Start
            if event == "on_tool_start":
                tool_name = chunk.get("name", "unknown")
                print(f"DEBUG: Yielding tool start for: {tool_name}")
                yield f"\n> 🔧 调用工具: {tool_name}\n"

            # Tool End
            elif event == "on_tool_end":
                tool_name = chunk.get("name", "unknown")
                print(f"DEBUG: Yielding tool end for: {tool_name}")
                yield f"\n> ✅ 工具 {tool_name} 执行完毕\n"

            # 'on_chat_model_stream' gives us tokens from the LLM
            elif event == "on_chat_model_stream":
                data = chunk["data"]
                if "chunk" in data:
                    content = data["chunk"].content
                    if content:
                        yield content

    except Exception as e:
        print(f"Error running LangChain Agent (Stream): {e}")
        yield f"Agent Error: {e}. Please try a different model."


async def stream_chat_with_data(
    history,
    current_query,
    df,
    api_key,
    base_url,
    model,
    monthly_income=0,
    investments=0,
    language="zh",
):
    """
    Handles chat interaction using the LangChain Agent with Streaming.
    """
    df_summary = _summarize_dataframe(df)
    base_prompt = _get_agent_base_prompt(df_summary, language)
    fin_context = _format_financial_context(monthly_income, investments)

    history_str = ""
    if history:
        history_str = "Dialog History:\n" if language == "en" else "对话历史：\n"
        for msg in history[-5:]:
            role = (
                ("User" if msg["role"] == "user" else "AI")
                if language == "en"
                else ("用户" if msg["role"] == "user" else "AI")
            )
            history_str += f"{role}: {msg['content']}\n"

    # Keep prompt prompt structure in Chinese, just adapt the language requirement
    full_prompt = f"""
{base_prompt}

{history_str}
财务背景：{fin_context}

当前用户问题："{current_query}"

任务要求：
1. 如果问题是闲聊，请礼貌地回答。
2. 如果需要数据，请分析 DataFrame `df` 并结合财务背景给出分析结论。
3. 如果需要进行计算，请调用 pandas 工具。
"""
    # Delegate to the streaming executor
    async for token in stream_autonomous_agent(
        df, full_prompt, api_key, base_url, model
    ):
        yield token
