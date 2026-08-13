# 🧙 Wizard.AI Pro

<div align="center">

![Wizard.AI Banner](https://wizardai.dpdns.org/og-image.png)

**Your magical AI assistant with multi-agent orchestration**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://python.org)
[![Groq](https://img.shields.io/badge/Groq-API-orange.svg)](https://groq.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[**Live Demo**](https://wizardai.dpdns.org) • [**Documentation**](https://github.com/ag-ultima/wizard-ai/wiki) • [**Report Bug**](https://github.com/ag-ultima/wizard-ai/issues)

</div>

---

## ✨ Features

### 🤖 Multi-Agent Orchestration
Chain specialized AI agents together for complex tasks:

| Agent | Specialty |
|-------|-----------|
| 🔍 **Researcher** | Finds facts and information from the web |
| ✍️ **Writer** | Creates engaging content, blog posts, articles |
| 💻 **Coder** | Writes and debugs code in any language |
| 🎨 **Designer** | Creates images, layouts, and visual designs |
| 📊 **Data Analyst** | Analyzes numbers, statistics, and trends |
| ✅ **Reviewer** | Checks quality and finds issues |
| 📝 **Summarizer** | Condenses long text into key points |
| 🌐 **Translator** | Converts between 15+ languages (including Hindi) |
| ⚡ **Optimizer** | Improves performance and efficiency |

### 🎭 7 Personalities
- **JARVIS** - Sophisticated AI assistant
- **ORACLE** - Mystical, all-knowing persona
- **Nerd** - Detailed, academic responses
- **Fun** - Playful and energetic
- **Sarcastic** - Witty and sarcastic
- **Fast** - Lightning quick responses
- **Normal** - Balanced conversation

### 🧠 Core Capabilities
- 📚 **RAG Document Q&A** - Upload PDFs, DOCX, Excel, TXT
- 🌐 **Web Search** - Real-time information with auto-detection
- 💻 **Code Execution** - Python sandbox for running code
- 🎨 **AI Image Generation** - Multiple fallback services
- 🧠 **Persistent Memory** - Remembers user preferences
- 🎤 **Voice Input** - Speak naturally
- 📊 **User Statistics** - Track your usage
- 🔑 **API Keys** - Programmatic access

---

## 🚀 Quick Start

### Web App (No Installation)
Simply visit **[https://wizardai.dpdns.org](https://wizardai.dpdns.org)**

### Desktop App (Windows)
Download from: [https://wizardai.dpdns.org/download](https://wizardai.dpdns.org/download)

### Python SDK

```bash
pip install wizard-ai-pro
python
from wizard import Wizard

client = Wizard(api_key="your-api-key")

response = client.chat.create(
    messages=[
        {"role": "user", "content": "Hello! Who are you?"}
    ],
    model="wizard-jarvis"
)

print(response.choices[0].message.content)
API Endpoint
bash
curl -X POST https://api.wizardai.dpdns.org/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "wizard-jarvis",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
🏗️ Architecture
text
┌─────────────────────────────────────────────────────────────┐
│                     Wizard.AI Architecture                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🌐 Frontend (GitHub Pages)                                │
│  ├── index.html (Browser UI)                               │
│  ├── style.css (Theming)                                   │
│  └── script.js (Client logic)                              │
│                                                             │
│  ⬇️ API Calls                                              │
│                                                             │
│  🐍 Backend (PythonAnywhere)                               │
│  ├── Flask API                                             │
│  ├── Multi-Agent Orchestrator                              │
│  ├── Groq Integration (Llama models)                       │
│  ├── SQLite Database                                       │
│  └── File Storage (RAG)                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
📦 Installation
Local Development
bash
# Clone the repository
git clone https://github.com/ag-ultima/wizard-ai.git
cd wizard-ai

# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run the Flask app
python flask_app.py
Environment Variables
env
GROQ_API_KEY=your_groq_api_key
RESEND_API_KEY=your_resend_api_key
TAVILY_API_KEY=your_tavily_api_key
HF_TOKEN=your_huggingface_token
OPENWEATHER_API_KEY=your_openweather_key
SECRET_KEY=your_secret_key
🐳 Docker Deployment
bash
# Build the image
docker build -t wizard-ai .

# Run the container
docker run -p 5000:5000 --env-file .env wizard-ai
📁 Project Structure
text
wizard-ai/
├── flask_app.py          # Main Flask application
├── models.py             # Database models
├── auth.py               # Authentication routes
├── chat.py               # Chat & streaming endpoints
├── prompt_builder.py     # Prompt construction with context
├── memory.py             # Persistent memory system
├── rag.py                # RAG document processing
├── image_routes.py       # AI image generation
├── search_routes.py      # Web search integration
├── code_routes.py        # Python code execution
├── agents/               # Multi-agent system
│   ├── orchestrator.py   # Agent coordination
│   ├── researcher.py     # Web research agent
│   ├── writer.py         # Content creation agent
│   ├── coder.py          # Code generation agent
│   ├── designer.py       # Image/design agent
│   └── ...               # Other agents
├── templates/            # HTML templates
└── requirements.txt      # Python dependencies
🔧 API Reference
Chat Completions
http
POST /v1/chat/completions
Parameter	Type	Description
messages	array	List of message objects
model	string	wizard-jarvis, wizard-oracle, wizard-nerd, etc.
temperature	float	0.0 to 2.0 (default 0.7)
max_tokens	int	Maximum tokens to generate
stream	boolean	Enable streaming responses
Available Models
Model ID	Personality
wizard-jarvis	JARVIS - Sophisticated AI
wizard-oracle	ORACLE - Mystical
wizard-nerd	Nerd - Academic
wizard-fun	Fun - Playful
wizard-sarcastic	Sarcastic - Witty
wizard-fast	Fast - Quick responses
wizard-normal	Normal - Balanced
🧪 Multi-Agent Examples
Research & Write Chain
python
# Automatically researches a topic and writes an essay
response = client.chat.create(
    messages=[{
        "role": "user", 
        "content": "Research the history of artificial intelligence and write a 500-word essay."
    }],
    model="wizard-jarvis"
)
Code Review Chain
python
# Writes code, reviews it, and optimizes
response = client.chat.create(
    messages=[{
        "role": "user",
        "content": "Write a Python function to sort a list of dictionaries by a key, then review and optimize it."
    }],
    model="wizard-jarvis"
)
Translation Chain
python
# Translates text to Hindi and summarizes it
response = client.chat.create(
    messages=[{
        "role": "user",
        "content": "Translate this to Hindi and summarize: [Your text here]"
    }],
    model="wizard-jarvis"
)
🤝 Contributing
We welcome contributions! Please see our Contributing Guidelines.

Fork the repository

Create your feature branch (git checkout -b feature/amazing)

Commit your changes (git commit -m 'Add amazing feature')

Push to the branch (git push origin feature/amazing)

Open a Pull Request

📄 License
Distributed under the MIT License. See LICENSE for more information.

👤 Author
Arnav Gupta

Website: https://wizardai.dpdns.org

GitHub: @ag-ultima

Email: arnav@wizardai.dpdns.org

🙏 Acknowledgments
Groq for fast LLM inference

Llama by Meta for the foundation models

DuckDuckGo for search API

Unsplash for image fallback

Hugging Face for image generation models

⭐ Show Your Support
If you found this project helpful, please give it a ⭐ on GitHub!

https://img.shields.io/github/stars/ag-ultima/wizard-ai

<div align="center"> <sub>Built with 🧙 by Arnav Gupta</sub> </div> ```
