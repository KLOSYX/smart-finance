# AI Financial Assistant

A Streamlit-based web application that automates the classification of monthly credit card statements (PDF) using Large Language Models (LLM).

## Features

- **PDF Upload**: Support for uploading multiple credit card statement PDFs.
- **Privacy First**: Automatically masks sensitive information (Phone, Email, Credit Card numbers) before sending data to the LLM.
- **Automated Classification**: Uses LLM to extract transactions and categorize them into fixed categories (e.g., Food, Transport, Housing).
- **Human-in-the-Loop**: Interactive table to manually correct categories or transaction details.
- **Financial Analysis**: Visualizations of expense distribution.
- **AI Advice**: Generates personalized financial advice based on your spending habits.
- **Configurable LLM**: compatible with OpenAI API (and other compatible providers).

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Run the application:
   ```bash
   streamlit run app.py
   ```
