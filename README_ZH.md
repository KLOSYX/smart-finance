# Smart Finance (AI 智能理财助手)

Smart Finance 是一个智能个人理财系统，旨在自动化繁琐的记账过程。通过利用先进的 **大型语言模型 (LLMs)**，它将原始信用卡账单转化为可操作的财务洞察。

[English](./README.md) | [中文](./README_ZH.md)

## 核心功能

### 1. 💳 智能信用卡账单分析
告别手动录入。Smart Finance 允许您：
- **解析 PDF 账单**: 使用 Docling 识别文本型信用卡账单的阅读顺序与表格结构，并转换为适合大模型分析的 Markdown。
- **手动隐私检查**: 在发送数据进行分析之前，可在预览框中手动删除不希望发送给模型的敏感文本。
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

### 4. 📅 长期月度支出账本
- 每笔交易按实际发生日期归属自然月，并保留独立的账单导入批次。
- 仪表盘提供月度净支出、毛支出、退款和分类趋势，并支持标记月份是否已完成上传。
- 账单上传采用“原文预览与手动隐私检查 → 智能识别 → 分类入账”流程；系统不会自动修改原文。允许同一文件使用不同模型或提示词重复识别，疑似重复记录由用户通过批量删除自行处理。

## 技术栈

- **前端**: React, TypeScript, Vite, Ant Design Pro Components, MUI
- **后端**: Python, FastAPI, Docling, Pandas, SQLAlchemy
- **Chat Agent 运行时**: `agent/` 目录下的 Node.js sidecar，基于 `@earendil-works/pi-coding-agent`
- **AI 集成**: LangChain 用于 PDF 交易抽取，OpenRouter 兼容模型用于聊天 Agent
- **数据层**: SQLAlchemy + Alembic，金额以人民币分整数保存，月度指标通过 SQL 实时聚合

## 快速开始

### 前置要求

- Node.js (建议 v22.19+，用于 pi-agent 运行时)
- Python (v3.11+)
- `uv` (Python 包管理器)

Docling 只处理文本型 PDF，不启用 OCR。首次解析账单时会自动下载本地版面与表格模型，后续从本机缓存加载。

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

4.  **设置 Chat Agent**
    ```bash
    cd agent
    npm install
    ```

### 运行应用

使用提供的启动脚本：

```bash
./start.sh
```

`start.sh` 会启动 FastAPI 后端和 Vite 前端。如果 `agent/node_modules` 不存在，会先安装 Node sidecar 依赖。`/api/chat` 现在通过 `agent/` 下的 pi-agent sidecar 流式响应，不再使用旧的 pandas DataFrame agent。

Windows 下请运行：

```powershell
.\start.cmd
```

Windows 启动器需要 PowerShell 7（`pwsh`），可在命令提示符或 PowerShell 中使用，会自动安装缺失的前端和 Agent 依赖；按 `Ctrl+C` 时会同时停止两个开发服务。

### 配置

运行后，前往 Web 界面中的 **系统设置 (Settings)** 配置您的 LLM 提供商 (API Key, Base URL) 和财务档案。

## 贡献

欢迎提交 Pull Request。对于重大更改，请先提交 Issue 讨论您想要更改的内容。

## 许可证

[MIT](https://choosealicense.com/licenses/mit/)
