# Chaubey Ji — AI Coding Assistant for VS Code

**Version 1.0.0** — An AI-powered VS Code extension for code analysis, chat, debugging, code conversion, documentation, testing, and more.

---

## ✨ Features

### 🤖 AI Provider Support

Chaubey Ji supports multiple AI providers, allowing you to choose the provider that best fits your requirements.

- **Groq** — Fast cloud AI inference
- **Google Gemini** — Advanced AI models and reasoning
- **OpenAI** — GPT models and reasoning models
- **DeepSeek** — Reasoning and coding models
- **OpenRouter** — Access to multiple AI models
- **Perplexity** — AI-powered search and reasoning
- **Cerebras** — Fast AI inference
- **Localhost** — Run AI locally using Ollama or LM Studio

> Provider availability depends on the current extension configuration.

---

## 🧠 Local AI with Ollama

Chaubey Ji supports running AI models locally through Ollama.

This allows you to use a local AI model without sending your code to a cloud AI provider.

### Advantages

- 🔒 Local processing
- 🌐 Can work without internet after the model is installed
- 🔑 No API key required for Ollama
- 🔄 Automatically discovers installed Ollama models
- 🖥️ Uses your local CPU/GPU
- 📦 Supports multiple installed models

### Ollama Endpoint

```text
http://localhost:11434