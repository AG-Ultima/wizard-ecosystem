# 🧙 Wizard.AI Pro

**Your magical AI assistant with RAG, persistent memory, web search, code execution, image generation, and 7 personalities.**

[![Website](https://img.shields.io/badge/Website-wizardai.dpdns.org-8b5cf6)](https://www.wizardai.dpdns.org)
[![GitHub release](https://img.shields.io/github/v/release/ag-ultima/wizard-ai)](https://github.com/ag-ultima/wizard-ai/releases)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎭 **7 Personalities** | JARVIS, ORACLE, Nerd, Fun, Sarcastic, Fast, Normal |
| 💻 **Code Execution** | Run Python code directly in chat (safe sandbox) |
| 📚 **RAG Document Q&A** | Upload PDFs, DOCX, Excel files and ask questions |
| 🔍 **Web Search** | Real-time information with Tavily API |
| 🎨 **Image Generation** | AI art from text prompts |
| 🧠 **Persistent Memory** | Remembers your name, preferences, and facts |
| 🔑 **Free API Keys** | OpenAI-compatible API for developers |
| 📊 **User Statistics** | Track messages, images, searches, and more |
| 👑 **Admin Dashboard** | Full system control (for self-hosting) |

## 🚀 Quick Start

### Web Version (No Installation)
Simply visit: **[https://www.wizardai.dpdns.org](https://www.wizardai.dpdns.org)**

### Desktop App (Windows)
1. Go to [Releases](https://github.com/ag-ultima/wizard-ai/releases)
2. Download `Wizard.AI.Setup.exe`
3. Run the installer
4. Launch from desktop or start menu

### PWA (Mobile)
- **iPhone/iPad**: Safari → Share → Add to Home Screen
- **Android**: Chrome → Menu → Install App

### API Access
```python
from wizard import Wizard

client = Wizard(api_key="your-api-key")
response = client.chat.create(
    messages=[{"role": "user", "content": "Hello!"}],
    model="wizard-jarvis"
)
print(response.choices[0].message.content)
🎭 Personalities
Personality	Description	Best For
🎩 JARVIS	Sophisticated AI assistant	Professional tasks
🔮 ORACLE	Mystical and all-knowing	Deep questions
🧠 Nerd	Detailed, academic	Research, learning
🎉 Fun	Playful and energetic	Casual chat, jokes
😏 Sarcastic	Witty and sarcastic	Entertainment
⚡ Fast	Lightning quick	Quick answers
✨ Normal	Balanced conversation	Everyday use
🛠️ Tech Stack
Component	Technology
Frontend	HTML5, CSS3, JavaScript (PWA)
Backend	Flask (Python)
Database	SQLite
AI Models	Groq (Llama 3.1, Llama 3.3)
Image Gen	Pollinations.ai, Hugging Face
Web Search	Tavily API
Desktop App	Electron
📦 Installation for Development
bash
# Clone the repository
git clone https://github.com/ag-ultima/wizard-ai.git
cd wizard-ai

# Backend setup
cd wizard_backend
pip install -r requirements.txt
python flask_app.py

# Frontend (just open index.html or serve with any static server)
🔑 Environment Variables
Create a .env file in wizard_backend/:

env
GROQ_API_KEY=your_groq_key
TAVILY_API_KEY=your_tavily_key
RESEND_API_KEY=your_resend_key
HF_TOKEN=your_huggingface_token
📊 Database Schema
User - Account management and statistics

Chat - Conversation history

Memory - Persistent user memories

Personality - Custom personalities

ApiKey - API access keys

UploadedFile - Document storage for RAG

🤝 Contributing
Contributions are welcome! Please:

Fork the repository

Create a feature branch

Submit a pull request

📝 License
MIT License - see LICENSE file for details.

👨‍💻 Author
Arnav Gupta

Website: wizardai.dpdns.org

GitHub: @ag-ultima

⭐ Star History
If you find Wizard.AI useful, please consider starring the repository!

Built in 15 hours by a 12-year-old 🧙✨
