import datetime
import concurrent.futures

from langchain_openai import ChatOpenAI
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
    "其他"
]

def get_categories():
    return CATEGORIES

def _chunk_text(text, max_chars=2000):
    if not text:
        return []
    lines = text.split('\n')
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

def _process_chunk_langchain(chunk, api_key, base_url, model_name):
    """
    Process a single chunk using LangChain.
    """
    try:
        llm = ChatOpenAI(
            api_key=api_key,
            base_url=base_url,
            model=model_name,
            temperature=0.1
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
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("user", "Here is the statement text:\n\n{text}")
        ])
        
        # Chain
        chain = prompt | llm | JsonOutputParser()
        
        # Execute
        result = chain.invoke({"text": chunk})
        return result
        
    except Exception as e:
        print(f"Error processing chunk with LangChain: {e}")
        return []

def analyze_transactions(text, api_key, base_url, model):
    """
    Sends the anonymized text to the LLM to extract and classify transactions using LangChain.
    """
    print(f"DEBUG: Starting LangChain analysis with model='{model}'")
    chunks = _chunk_text(text)
    print(f"DEBUG: Text split into {len(chunks)} chunks. Processing in parallel...")
    
    all_transactions = []
    
    # Use ThreadPoolExecutor for parallel processing
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        # Create a future for each chunk
        future_to_chunk = {
            executor.submit(_process_chunk_langchain, chunk, api_key, base_url, model): i 
            for i, chunk in enumerate(chunks)
        }
        
        for future in concurrent.futures.as_completed(future_to_chunk):
            chunk_index = future_to_chunk[future]
            try:
                data = future.result()
                if data and isinstance(data, list):
                    all_transactions.extend(data)
                print(f"DEBUG: Chunk {chunk_index+1}/{len(chunks)} completed.")
            except Exception as exc:
                print(f"DEBUG: Chunk {chunk_index+1} generated an exception: {exc}")

    print(f"DEBUG: Total transactions found: {len(all_transactions)}")
    return all_transactions

def run_autonomous_agent(df, query, api_key, base_url, model, max_turns=10):
    """
    Uses LangChain's Pandas DataFrame Agent to analyze data.
    """
    print("DEBUG: Initializing LangChain Pandas Agent...")
    
    try:
        llm = ChatOpenAI(
            api_key=api_key,
            base_url=base_url,
            model=model,
            temperature=0
        )
        
        # Create the agent
        # We use ZERO_SHOT_REACT_DESCRIPTION which corresponds to the standard ReAct agent
        # handle_parsing_errors=True is crucial for robustness
        agent = create_pandas_dataframe_agent(
            llm,
            df,
            verbose=True,
            # Use the newer OpenAI tool-calling interface to avoid deprecated
            # `functions`/`function_call` payloads rejected by some providers.
            agent_type="openai-tools",
            allow_dangerous_code=True, # Required for experimental agent
            handle_parsing_errors=True,
            max_iterations=max_turns
        )
        
        # Construct a rich prompt
        full_prompt = f"""
        你是一位高级财务数据分析师。请用中文回答。
        所有货币单位均为人民币 (¥)。
        
        用户问题: {query}
        
        请分析数据并给出结论。如果需要，你可以运行Python代码来计算。
        最终回答请以"FINAL ANSWER:"开头。
        """
        
        print(f"DEBUG: Invoking Agent with query: {query[:50]}...")
        response = agent.invoke(full_prompt)
        
        # LangChain agent response is usually a dict {'input': ..., 'output': ...}
        output = response.get('output', "Agent failed to generate output.")
        return output
        
    except Exception as e:
        print(f"Error running LangChain Agent: {e}")
        # Fallback to custom simple implementation if LangChain fails (e.g. model doesn't support functions)
        return f"Agent Error: {e}. Please try a different model."

def agentic_financial_advice(df, api_key, base_url, model, monthly_income=0, investments=0):
    """
    Wrapper for the autonomous agent to generate financial advice.
    """
    context_info = ""
    if monthly_income > 0:
        context_info += f"User Monthly Income: ¥{monthly_income:,.2f}. "
    if investments > 0:
        context_info += f"User Current Investments: ¥{investments:,.2f}. "
        
    goal = f"""
    Analyze the financial data to provide a comprehensive financial health report and actionable advice.
    {context_info}
    
    Required Analysis Steps:
    1. Identify top spending categories and merchants.
    2. Analyze spending trends (e.g., weekend vs weekday, recurring bills).
    3. Calculate savings rate (if income provided) and assess financial health.
    4. Detect any alarming outliers.
    
    Output structured advice in Chinese with 3-5 specific tips.
    """
    
    return run_autonomous_agent(df, goal, api_key, base_url, model)

def generate_financial_advice(summary_df, api_key, base_url, model, monthly_income=0, investments=0):
    # Backward compatibility
    return "Please use agentic_financial_advice instead."

def chat_with_data(history, current_query, df, api_key, base_url, model, monthly_income=0, investments=0):
    """
    Handles chat interaction using the LangChain Agent.
    """
    # 1. Format history
    history_str = ""
    if history:
        history_str = "Conversation History:\n"
        for msg in history[-5:]:
            role = "User" if msg['role'] == 'user' else "AI"
            history_str += f"{role}: {msg['content']}\n"
            
    # 2. Financial Context
    fin_context = ""
    if monthly_income > 0:
        fin_context += f"User Monthly Income: ¥{monthly_income:,.2f}. "
    if investments > 0:
        fin_context += f"User Current Investments: ¥{investments:,.2f}. "
    
    # 3. Construct Goal
    goal = f"""
    {history_str}
    
    Financial Context: {fin_context}
    
    Current User Question: "{current_query}"
    
    Task: Answer the user's question based on the provided DataFrame `df` and financial context.
    If the question is conversational, answer politely.
    If it requires data, analyze the data.
    
    Answer in Chinese (中文).
    """
    
    return run_autonomous_agent(df, goal, api_key, base_url, model, max_turns=5)
