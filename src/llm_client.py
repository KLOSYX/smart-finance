import json
from openai import OpenAI
import datetime

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
    "其他"
]

def get_categories():
    return CATEGORIES

def _chunk_text(text, max_chars=4000):
    """
    Splits text into chunks of approximately max_chars, respecting newlines.
    """
    if not text:
        return []
        
    lines = text.split('\n')
    chunks = []
    current_chunk = []
    current_length = 0
    
    for line in lines:
        # If adding this line exceeds max_chars and we have something in the current chunk
        if current_length + len(line) > max_chars and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_length = len(line)
        else:
            current_chunk.append(line)
            current_length += len(line) + 1 # +1 for newline character
            
    if current_chunk:
        chunks.append("\n".join(current_chunk))
        
    return chunks

def _process_chunk(client, text, system_prompt, model):
    """
    Helper function to process a single chunk of text with the LLM.
    """
    user_prompt = f"Here is the statement text:\n\n{text}"
    
    print(f"DEBUG: Processing chunk of length {len(text)} chars.")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1
        )
        
        # Handle different response types (Object, Dict, String)
        if isinstance(response, str):
            content = response
        elif isinstance(response, dict):
            content = response['choices'][0]['message']['content']
        else:
            content = response.choices[0].message.content.strip()
        
        # Clean up potential markdown code blocks
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        content = content.strip()
        if not content:
            print("Error: Received empty content from LLM for chunk.")
            return []

        data = json.loads(content)
        print(f"DEBUG: Successfully parsed chunk. Found {len(data)} transactions.")
        return data
        
    except json.JSONDecodeError as je:
        print(f"Error parsing JSON for chunk: {je}")
        print(f"Failed content snippet: {content[:100]!r}...")
        return []
    except Exception as e:
        print(f"Error calling LLM for chunk: {e}")
        return []

def analyze_transactions(text, api_key, base_url, model):
    """
    Sends the anonymized text to the LLM to extract and classify transactions.
    Handles long texts by splitting them into chunks.
    
    Args:
        text (str): The anonymized text from the PDF.
        api_key (str): The API key for the LLM provider.
        base_url (str): The base URL for the LLM API.
        model (str): The model name to use.
        
    Returns:
        list: A list of dictionaries containing transaction details (Date, Description, Amount, Category).
    """
    client = OpenAI(
        api_key=api_key,
        base_url=base_url
    )
    
    current_year = datetime.datetime.now().year
    
    system_prompt = f"""
    你是一位专业的财务助手。你的任务是从提供的文本中提取信用卡交易详情，并将每笔交易分类到以下类别之一：{', '.join(CATEGORIES)}。
    
    严格以JSON对象列表的形式返回输出。每个对象必须包含以下键：
    - "Date": 交易日期 (格式 YYYY-MM-DD)。如果年份缺失，假设为 {current_year}。
    - "Description": 商户名称或交易描述。
    - "Amount": 交易的数值 (正数表示支出，负数表示退款/支付)。
    - "Category": 从提供的类别中选择一个。
      - 如果描述模糊不清或你不确定类别，请务必使用 "需要复核"。
      - 只有当你确定它不属于上述任何主要类别时，才使用 "其他"。
    
    不要包含任何解释或Markdown格式 (如 ```json)。只返回原始的JSON字符串。
    如果未找到交易，请返回一个空列表 []。
    """
    
    print(f"DEBUG: Starting LLM analysis with model='{model}', base_url='{base_url}'")
    print(f"DEBUG: Total input text length: {len(text)} characters")
    
    # Split text into chunks
    chunks = _chunk_text(text)
    print(f"DEBUG: Text split into {len(chunks)} chunks.")
    
    all_transactions = []
    
    for i, chunk in enumerate(chunks):
        print(f"DEBUG: Processing chunk {i+1}/{len(chunks)}...")
        chunk_transactions = _process_chunk(client, chunk, system_prompt, model)
        all_transactions.extend(chunk_transactions)
        
    print(f"DEBUG: Total transactions found: {len(all_transactions)}")
    return all_transactions

def generate_financial_advice(summary_df, api_key, base_url, model, monthly_income=0, investments=0):
    """
    Generates financial advice based on the summarized expense data and optional financial context.
    
    Args:
        summary_df (pd.DataFrame): DataFrame containing 'Category' and 'Amount'.
        api_key, base_url, model: LLM config.
        monthly_income (float): User's monthly income (optional).
        investments (float): User's current investments (optional).
        
    Returns:
        str: The generated advice.
    """
    client = OpenAI(
        api_key=api_key,
        base_url=base_url
    )
    
    # Convert summary to a string format
    summary_text = summary_df.to_string(index=False)
    
    # Construct context string
    context_str = f"Monthly Expenses Summary:\n{summary_text}\n"
    if monthly_income > 0:
        context_str += f"\nMonthly Income: ${monthly_income:,.2f}"
    if investments > 0:
        context_str += f"\nCurrent Investments: ${investments:,.2f}"
    
    system_prompt = """
    你是一位财务顾问。分析所提供的财务数据（支出摘要，以及可选的收入/投资信息）。
    
    任务：
    1. 分析消费模式，指出过度消费的领域。
    2. 如果提供了收入，计算储蓄率（(收入 - 支出) / 收入），并评价其健康程度。
    3. 如果提供了投资信息，结合支出情况给出资产配置建议。
    4. 提供3-5条具体、可操作的建议，以帮助用户节省开支或改善财务健康状况。
    
    请保持鼓励但直接的语气。
    """
    
    try:
        print("DEBUG: Generating financial advice...")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Here is my financial data:\n{context_str}"}
            ]
        )
        
        if isinstance(response, str):
            print(f"DEBUG: Advice response is string. Preview: {response[:50]}...")
            return response
        elif isinstance(response, dict):
            return response['choices'][0]['message']['content']
        else:
            return response.choices[0].message.content
    except Exception as e:
        print(f"Error generating advice: {e}")
        return f"Could not generate advice: {e}"

def chat_with_data(history, current_query, context_data, api_key, base_url, model):
    """
    Handles chat interaction with the financial data context.
    
    Args:
        history (list): List of previous messages [{"role": "user", "content": "..."}, ...].
        current_query (str): The user's new question.
        context_data (str): Summary of financial data (transactions, income, etc.) to inject as system context.
        api_key, base_url, model: LLM config.
        
    Returns:
        str: The LLM's response.
    """
    client = OpenAI(
        api_key=api_key,
        base_url=base_url
    )
    
    system_prompt = f"""
    你是一位智能财务助手。用户正在与你讨论他们的财务状况。
    
    以下是用户的财务数据上下文：
    {context_data}
    
    请基于上述数据回答用户的问题。如果问题与财务无关，请礼貌地将话题引回财务建议。
    回答要简洁、专业且有帮助。
    """
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": current_query})
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7
        )
        
        if isinstance(response, str):
            return response
        elif isinstance(response, dict):
            return response['choices'][0]['message']['content']
        else:
            return response.choices[0].message.content
            
    except Exception as e:
        return f"Sorry, I encountered an error: {e}"