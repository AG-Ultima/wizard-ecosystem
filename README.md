# 🧙 Wizard Ecosystem

<div align="center">

![Wizard Ecosystem Banner](https://wizardecosystem.dpdns.org/og-image.png)

**Your complete AI-powered productivity suite**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-28-blue.svg)](https://electronjs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[**Live Demo**](https://wizardecosystem.dpdns.org) • [**Documentation**](https://github.com/ag-ultima/wizard-ecosystem/wiki) • [**Report Bug**](https://github.com/ag-ultima/wizard-ecosystem/issues)

</div>

---

## 🌟 Overview

Wizard Ecosystem is a comprehensive, AI-powered productivity suite that replaces multiple Google services with a single, privacy-focused platform.

| Component | Description | Live URL |
|-----------|-------------|----------|
| 🧙 **Wizard Browser** | AI-powered web browser with workspaces | [Browser](https://wizardecosystem.dpdns.org) |
| 🧠 **Wizard AI** | Multi-agent AI assistant | [AI](https://wizardai.dpdns.org) |
| 📧 **Wizard Mail** | Email client (Gmail, Outlook, any IMAP) | [Mail](https://wizardecosystem.dpdns.org/mail) |
| 📅 **Wizard Calendar** | Calendar and event management | [Calendar](https://wizardecosystem.dpdns.org/calendar) |
| 💬 **Wizard Chat** | Instant messaging for Wizard users | [Chat](https://wizardecosystem.dpdns.org/chat) |
| 🔍 **Wizard Search** | AI-powered search engine | [Search](https://wizardecosystem.dpdns.org/search) |

---

## ✨ Features

### 🧙 Wizard Browser

- **Tab Management** - Drag-and-drop reordering, tab groups
- **Workspaces** - Organize tabs by context (Work, School, Media)
- **Built-in Ad Blocking** - uBlock Origin style filters
- **Private Mode** - Separate session storage
- **Cloud Sync** - Bookmarks, workspaces, settings across devices
- **Search Suggestions** - Real-time via DuckDuckGo API
- **Password Manager** - Local encrypted storage
- **Dark/Light Themes** - Wizard Purple or Light mode

### 🧠 Wizard AI

- **7 Personalities** - JARVIS, ORACLE, Nerd, Fun, Sarcastic, Fast, Normal
- **Multi-Agent System** - Chain specialized agents together
- **RAG Document Q&A** - Upload PDFs, Word, Excel files
- **Web Search** - Real-time information
- **Code Execution** - Python sandbox
- **Image Generation** - AI art creation
- **Voice Input** - Speak naturally

### 📧 Wizard Mail

- **Multi-Account Support** - Gmail, Outlook, Yahoo, custom domains
- **Folder Management** - Inbox, Sent, Spam, Trash, Drafts
- **Email Aliases** - `username@wizardecosystem.dpdns.org` via Cloudflare
- **AI Assistant** - Compose, summarize, enhance emails
- **Rich Text Editor** - Formatting, images, attachments
- **Search & Star** - Find and favorite important emails

### 📅 Wizard Calendar

- **Multiple Views** - Month, week, day
- **Event Management** - Create, edit, delete
- **Color Coding** - Categorize events by type
- **Mini Calendar** - Quick month navigation
- **Event Highlighting** - Days with events are marked
- **Cloud Sync** - Access from anywhere

### 💬 Wizard Chat

- **One-on-One Messaging** - Real-time conversations
- **Read Receipts** - See when messages are read
- **Typing Indicators** - Know when someone is typing
- **User Search** - Find other Wizard users by email
- **Local Timestamps** - Converted to your timezone

### 🔍 Wizard Search

- **AI-Powered** - Get intelligent summaries
- **Real-time Suggestions** - As you type
- **Direct Links** - No redirects, go straight to results
- **URL Parameters** - `?q=search+query`

---

## 🚀 Quick Start

### Web Access

Simply visit **[https://wizardecosystem.dpdns.org](https://wizardecosystem.dpdns.org)**

### Desktop App (Windows)

Download from: [https://wizardecosystem.dpdns.org/download](https://wizardecosystem.dpdns.org/download)

### Local Development

```bash
# Clone the repository
git clone https://github.com/ag-ultima/wizard-ecosystem.git
cd wizard-ecosystem

# Install dependencies
npm install

# Run the Electron app
npm start

# Or serve the web version locally
npx serve .
🏗️ Project Structure
text
wizard-ecosystem/
├── index.html              # Ecosystem hub / Browser UI
├── mail/
│   └── index.html          # Wizard Mail
├── calendar/
│   └── index.html          # Wizard Calendar
├── chat/
│   └── index.html          # Wizard Chat
├── search/
│   └── index.html          # Wizard Search
├── updates/
│   └── index.html          # Update history
├── icons/                  # App icons for PWA
├── main.js                 # Electron main process
├── preload.js              # Secure IPC bridge
├── package.json            # Dependencies
└── README.md               # This file
🖥️ Desktop Application
The desktop app is built with Electron and provides:

Native window controls

Keyboard shortcuts

System tray integration

Auto-updates

Offline support

Building from Source
bash
# Install dependencies
npm install

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac

# Build for Linux
npm run build:linux
🔗 Ecosystem Links
Service	URL
Ecosystem Hub	wizardecosystem.dpdns.org
Wizard AI	wizardai.dpdns.org
Wizard Mail	wizardecosystem.dpdns.org/mail
Wizard Calendar	wizardecosystem.dpdns.org/calendar
Wizard Chat	wizardecosystem.dpdns.org/chat
Wizard Search	wizardecosystem.dpdns.org/search
Update History	wizardecosystem.dpdns.org/updates
🔐 Email Aliases
Get a free @wizardecosystem.dpdns.org email alias that forwards to your real email:

Open Wizard Mail

Click "Get Free @wizardecosystem.dpdns.org Email"

Choose your username

Enter your forwarding email

Done! Emails sent to yourname@wizardecosystem.dpdns.org will forward to you

Powered by Cloudflare Email Routing.

🎨 Themes
Theme	Description
💜 Wizard Purple	Default dark theme with purple accents
☀️ Light Mode	Clean light theme for daytime use
Toggle themes in Settings → Appearance.

⌨️ Keyboard Shortcuts
Shortcut	Action
Ctrl/Cmd + T	New Tab
Ctrl/Cmd + W	Close Tab
Ctrl/Cmd + Tab	Next Tab
Ctrl/Cmd + Shift + Tab	Previous Tab
Ctrl/Cmd + L	Focus Address Bar
Ctrl/Cmd + K	Wizard Search
Ctrl/Cmd + Shift + A	Toggle AI Assistant
Ctrl/Cmd + D	Bookmark Page
Ctrl/Cmd + H	History
Ctrl/Cmd + J	Downloads
F11	Full Screen
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

Website: https://wizardecosystem.dpdns.org

GitHub: @ag-ultima

Email: arnav@wizardecosystem.dpdns.org

🙏 Acknowledgments
Electron - Desktop framework

Flask - Backend framework

Groq - AI inference

DuckDuckGo - Search API

Cloudflare - Email routing

PythonAnywhere - Backend hosting

GitHub Pages - Frontend hosting

⭐ Show Your Support
If you found this project helpful, please give it a ⭐ on GitHub!

https://img.shields.io/github/stars/ag-ultima/wizard-ecosystem

📊 Statistics
https://img.shields.io/github/languages/code-size/ag-ultima/wizard-ecosystem
https://img.shields.io/github/repo-size/ag-ultima/wizard-ecosystem
https://img.shields.io/github/last-commit/ag-ultima/wizard-ecosystem

<div align="center"> <sub>Built with 🧙 by Arnav Gupta</sub> </div> ```
