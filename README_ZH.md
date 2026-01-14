# Smart Finance (AI 智能理财助手)

Smart Finance 是一个智能个人理财系统，旨在自动化繁琐的记账过程。通过利用先进的 **大型语言模型 (LLMs)**，它将原始信用卡账单转化为可操作的财务洞察。

[English](./README.md) | [中文](./README_ZH.md)

## 核心功能

### 1. 💳 智能信用卡账单分析
告别手动录入。Smart Finance 允许您：
- **解析 PDF 账单**: 直接上传您的信用卡账单 (PDF)。
- **隐私优先提取**: 在发送数据进行分析之前，自动提取交易详情并匿名化敏感文本。
- **AI 智能分类**: 使用高智商模型 (如 Qwen-Max/Gemini) 将混乱的商户名称准确分类为清晰的类别 (例如 "餐饮"、"交通"、"购物")。

### 2. 🤖 AI Agent 支出分析
不仅仅是简单的图表，我们的 AI Agent 充当您的个人 CFO：
- **交互式分析**: 与您的财务数据对话。问它 "我上个月在咖啡上花了多少钱？" 或 "我在哪里可以省钱？"。
- **消费模式识别**: Agent 识别经常性付款、异常支出峰值和生活方式通胀趋势。
- **可操作的建议**: 根据您的实际消费历史，提供预算优化的定制建议。

### 3. 📊 全面的仪表盘
- **可视化概览**: 按类别和卡片清晰细分支出。
- **交易管理**: 搜索、过滤并手动调整任何交易记录。
- **投资组合追踪**: 在通过支出管理之外，同时追踪您的投资资产。

## 技术栈

- **前端**: React, TypeScript, Vite, Ant Design Pro Components, MUI
- **后端**: Python, FastAPI, Pandas, SQLAlchemy
- **AI 集成**: LangChain, OpenRouter (支持多种 LLM)

## 快速开始

### 前置要求

- Node.js (v18+)
- Python (v3.10+)
- `uv` (Python 包管理器)

### 安装

1.  **克隆仓库**
    ```bash
    git clone <repository-url>
    cd smart-finance
    ```

2.  **设置后端**
    ```bash
    cd backend
    uv sync
    ```

3.  **设置前端**
    ```bash
    cd frontend
    npm install
    ```

### 运行应用

使用提供的启动脚本：

```bash
./start.sh
```

### 配置

运行后，前往 Web 界面中的 **系统设置 (Settings)** 配置您的 LLM 提供商 (API Key, Base URL) 和财务档案。

## 贡献

欢迎提交 Pull Request。对于重大更改，请先提交 Issue 讨论您想要更改的内容。

## 许可证

[MIT](https://choosealicense.com/licenses/mit/)
