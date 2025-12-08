import streamlit as st
import pandas as pd
import plotly.express as px
import json
import os
from src.pdf_processor import extract_text_from_pdf, anonymize_text
from src.llm_client import analyze_transactions, generate_financial_advice, get_categories, chat_with_data

CONFIG_FILE = "config.json"

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=4)

st.set_page_config(page_title="AI财务分析器", layout="wide")

def main():
    st.title("💰 AI月度账单分析器")
    st.markdown("上传您的信用卡账单 (PDF)，自动分类支出并获取财务建议。")

    # Load Config
    config = load_config()

    # --- Sidebar Configuration ---
    with st.sidebar:
        st.header("配置")
        
        # API Configuration
        api_key = st.text_input("API 密钥", value=config.get("api_key", ""), type="password", help="输入您的LLM API密钥")
        base_url = st.text_input("基础URL", value=config.get("base_url", "https://api.openai.com/v1"), help="API基础URL")
        model_name = st.text_input("模型名称", value=config.get("model_name", "gpt-3.5-turbo"), help="模型名称")
        
        st.divider()
        st.header("财务背景 (可选)")
        
        # Financial Context
        default_income = config.get("monthly_income", 0.0)
        default_investment = config.get("investments", 0.0)
        
        monthly_income = st.number_input("月收入 ($", value=float(default_income), min_value=0.0, step=100.0, help="您的月度税后收入")
        investments = st.number_input("当前投资资产 ($", value=float(default_investment), min_value=0.0, step=1000.0, help="您目前的投资总额")
        
        # Save Config Button
        if st.button("💾 保存配置"):
            new_config = {
                "api_key": api_key,
                "base_url": base_url,
                "model_name": model_name,
                "monthly_income": monthly_income,
                "investments": investments
            }
            save_config(new_config)
            st.success("配置已保存！下次启动时将自动加载。")
        
        st.divider()
        st.info("您的数据在发送到AI模型之前会在内存中处理并匿名化。")

    # --- Session State Initialization ---
    if "transactions" not in st.session_state:
        st.session_state.transactions = []
    if "processed_files" not in st.session_state:
        st.session_state.processed_files = set()
    if "pending_files" not in st.session_state:
        st.session_state.pending_files = {} # Stores {filename: clean_text}

    # --- File Upload ---
    uploaded_files = st.file_uploader("上传PDF账单", type=["pdf"], accept_multiple_files=True)

    if uploaded_files and api_key:
        # Pre-process files to extract text for review
        # Logic: If file is uploaded but not processed AND not pending, it's new.
        current_filenames = [f.name for f in uploaded_files]
        
        # Identify truly new files (not in processed set, not in pending dict)
        new_files_to_load = []
        for file in uploaded_files:
            if file.name not in st.session_state.processed_files and file.name not in st.session_state.pending_files:
                new_files_to_load.append(file)
        
        # Button to trigger extraction only for new files
        if new_files_to_load:
            if st.button(f"开始提取与隐私审查 ({len(new_files_to_load)} 个新文件)"):
                for file in new_files_to_load:
                     with st.spinner(f"正在读取 {file.name}..."):
                        raw_text = extract_text_from_pdf(file)
                        if "Error" in raw_text:
                            st.error(f"读取 {file.name} 失败: {raw_text}")
                            continue
                        clean_text = anonymize_text(raw_text)
                        st.session_state.pending_files[file.name] = clean_text
                st.rerun()

        # --- Privacy Review Step ---
        if st.session_state.pending_files:
            st.divider()
            st.subheader("🛡️ 隐私审查 (Privacy Review)")
            st.info("请检查以下文本，确保所有敏感信息已被移除。您可以直接编辑文本进行手动遮蔽。确认无误后点击下方按钮开始AI分析。")
            
            # Dictionary to store edited texts
            edited_texts = {}
            
            for filename, text in st.session_state.pending_files.items():
                st.markdown(f"**文件:** `{filename}`")
                edited_texts[filename] = st.text_area(
                    f"编辑 {filename} 的内容", 
                    value=text, 
                    height=200,
                    key=f"edit_{filename}"
                )
            
            if st.button("✅ 确认匿名化并开始AI分析"):
                new_data = []
                progress_bar = st.progress(0)
                file_count = len(edited_texts)
                
                for i, (filename, final_text) in enumerate(edited_texts.items()):
                    st.write(f"正在分析 {filename}...")
                    
                    # Analyze with LLM using the EDITED text
                    extracted_data = analyze_transactions(final_text, api_key, base_url, model_name)
                    
                    if extracted_data:
                        for item in extracted_data:
                            item['Source'] = filename
                        new_data.extend(extracted_data)
                        st.session_state.processed_files.add(filename)
                    else:
                        st.warning(f"未找到交易或 {filename} 的LLM错误")
                        # Still mark as processed to avoid loops, or let user retry? 
                        # Let's mark as processed so it doesn't stuck in pending
                        st.session_state.processed_files.add(filename)
                    
                    progress_bar.progress((i + 1) / file_count)
                
                # Clear pending queue
                st.session_state.pending_files = {}
                
                if new_data:
                    st.session_state.transactions.extend(new_data)
                    st.success(f"成功处理 {len(new_data)} 笔交易！")
                    st.rerun()

    # --- Main Interface ---
    if st.session_state.transactions:
        df = pd.DataFrame(st.session_state.transactions)
        
        # Ensure standard columns
        required_cols = ["Date", "Description", "Amount", "Category", "Source"]
        for col in required_cols:
            if col not in df.columns:
                df[col] = ""

        # Convert Amount to numeric
        df['Amount'] = pd.to_numeric(df['Amount'], errors='coerce').fillna(0)

        st.divider()
        
        # --- Data Editor (Human-in-the-Loop) ---
        st.subheader("📝 交易编辑器")
        st.caption("审查并更正提取的数据。您可以直接在表格中更改类别或金额。")

        # Check for items needing review
        needs_review_count = len(df[df['Category'] == '需要复核'])
        if needs_review_count > 0:
            st.warning(f"⚠️ 注意：有 {needs_review_count} 笔交易标记为 '需要复核'。请在生成分析前手动归类这些项目。")
        
        # Use a callback to update session state when data is edited?
        # Actually, st.data_editor returns the edited dataframe. 
        # We need to explicitly overwrite session state with this edited dataframe
        # BUT only if the user actually edits it. 
        # However, st.data_editor re-runs the script on change. 
        # So we can assign the result back to a temporary variable, and maybe update session state?
        # The standard pattern is: edited_df = st.data_editor(...)
        # We should update st.session_state.transactions if the edited_df differs, 
        # or just use edited_df for downstream analysis.
        # To PERSIST edits across re-runs (like adding new files), we need to update session state.
        
        edited_df = st.data_editor(
            df,
            column_config={
                "Category": st.column_config.SelectboxColumn(
                    "类别",
                    help="选择正确的类别",
                    width="medium",
                    options=get_categories(),
                    required=True,
                )
            },
            num_rows="dynamic",
            use_container_width=True,
            key="data_editor" # This key helps Streamlit track state
        )
        
        # Update session state with the edited data
        # Streamlit's data_editor with a key stores the edited data in session state under that key if configured,
        # but the return value `edited_df` is the most direct way.
        # We need to make sure that if `edited_df` changes, we sync it back to `st.session_state.transactions`
        # so that if the script reruns (e.g. upload new file), the previous edits aren't lost (overwritten by the original list).
        # Actually, if we just use `edited_df` for analysis, that's fine for the current run.
        # BUT if we upload a NEW file, `st.session_state.transactions` (which holds the OLD raw data) will be appended to.
        # So we MUST update `st.session_state.transactions` to reflect the edits.
        
        if not df.equals(edited_df):
            st.session_state.transactions = edited_df.to_dict('records')

        # --- Analysis Section ---
        st.divider()
        st.subheader("📊 财务分析")
        
        col1, col2 = st.columns(2)
        
        # Calculate Stats
        # Treat '需要复核' as '其他' for visualization purposes if user didn't fix them
        viz_df = edited_df.copy()
        viz_df.loc[viz_df['Category'] == '需要复核', 'Category'] = '其他'
        
        total_expense = viz_df[viz_df['Amount'] > 0]['Amount'].sum()
        category_summary = viz_df[viz_df['Amount'] > 0].groupby("Category")['Amount'].sum().reset_index()
        
        with col1:
            st.metric("总支出", f"${total_expense:,.2f}")
            
            # Pie Chart
            if not category_summary.empty:
                fig_pie = px.pie(category_summary, values='Amount', names='Category', title='支出分布')
                st.plotly_chart(fig_pie, use_container_width=True)
            else:
                st.info("没有支出可显示。")

        with col2:
            # Bar Chart (Trend or Category breakdown)
            if not category_summary.empty:
                fig_bar = px.bar(category_summary, x='Category', y='Amount', title='按类别划分的支出', color='Category')
                st.plotly_chart(fig_bar, use_container_width=True)

        # --- AI Advice Section ---
        st.divider()
        st.subheader("🤖 AI财务顾问")
        
        if st.button("生成建议"):
            with st.spinner("正在分析您的消费习惯..."):
                advice = generate_financial_advice(category_summary, api_key, base_url, model_name, monthly_income, investments)
                st.markdown(advice)

    elif not uploaded_files:
        st.info("上传PDF账单以开始。")

    # --- Chat Interface ---
    if st.session_state.transactions and api_key:
        st.divider()
        st.subheader("💬 与AI助手对话")
        
        if "messages" not in st.session_state:
            st.session_state.messages = []

        # Display chat messages from history on app rerun
        for message in st.session_state.messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])

        if prompt := st.chat_input("关于您的财务状况，有什么想问的吗？"):
            # Display user message in chat message container
            with st.chat_message("user"):
                st.markdown(prompt)
            # Add user message to chat history
            st.session_state.messages.append({"role": "user", "content": prompt})

            # Prepare context for the LLM
            # We reconstruct the context similar to the advice generation but lighter if needed
            # Or we can pass the raw transaction list if it's not too huge, 
            # but usually summary is better for token limits.
            # Let's pass the edited_df (if available) or raw transactions.
            # Since edited_df is local to the main block, we might need to access session state or re-derive.
            # Safest is to re-derive summary from session_state.transactions.
            
            chat_df = pd.DataFrame(st.session_state.transactions)
            if "Category" in chat_df.columns and "Amount" in chat_df.columns:
                 # Clean amount
                chat_df['Amount'] = pd.to_numeric(chat_df['Amount'], errors='coerce').fillna(0)
                
                # Context Summary
                total_exp = chat_df[chat_df['Amount'] > 0]['Amount'].sum()
                cat_summary = chat_df[chat_df['Amount'] > 0].groupby("Category")['Amount'].sum().reset_index().to_string(index=False)
                
                context_data = f"Total Expenses: ${total_exp:,.2f}\n\nCategory Breakdown:\n{cat_summary}"
                if monthly_income > 0:
                    context_data += f"\n\nMonthly Income: ${monthly_income:,.2f}"
                if investments > 0:
                    context_data += f"\nCurrent Investments: ${investments:,.2f}"
            else:
                context_data = "No transaction data available yet."

            with st.chat_message("assistant"):
                with st.spinner("AI思考中..."):
                    response = chat_with_data(
                        [{"role": m["role"], "content": m["content"]} for m in st.session_state.messages if m["role"] != "system"], # Pass history without system prompt (it's added in func)
                        prompt,
                        context_data,
                        api_key,
                        base_url,
                        model_name
                    )
                    st.markdown(response)
            
            st.session_state.messages.append({"role": "assistant", "content": response})

if __name__ == "__main__":
    main()
