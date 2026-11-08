# 🧙 Wizard Ecosystem

<div align="center">

![Wizard Ecosystem Banner](https://wizardecosystem.dev/og-image.png)

# Wizard Ecosystem

### Your Complete AI-Powered Platform

**16 applications. One ecosystem. Endless possibilities.**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-Flask-blue.svg)](https://python.org)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F.svg)](https://electronjs.org)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[**🌐 Live Platform**](https://wizardecosystem.dev) • [**📚 Documentation**](https://github.com/ag-ultima/wizard-ecosystem/wiki) • [**🐛 Report a Bug**](https://github.com/ag-ultima/wizard-ecosystem/issues)

</div>

---

## 🌟 Overview

**Wizard Ecosystem** is an integrated, AI-powered software platform built from the ground up. It brings together sixteen applications spanning artificial intelligence, productivity, communication, development, automation, navigation, personal finance, environmental awareness, and entertainment.

Rather than relying on disconnected services, Wizard Ecosystem provides a unified platform with shared authentication, AI personalization, backend infrastructure, and a consistent design language.

The platform combines a web-based application ecosystem with native desktop applications, including Electron-based installers for Windows, macOS, and Linux.

### At a glance

| | |
|---|---|
| **Applications** | 16 integrated applications |
| **Backend** | Python, Flask, SQLite |
| **Frontend** | JavaScript, HTML, CSS |
| **Desktop** | Electron, Node.js |
| **AI** | Mistral API, Ministral models |
| **Infrastructure** | PythonAnywhere, GitHub Pages |
| **Desktop Distribution** | Windows, macOS, Linux |

---

# 🧩 The Applications

## 🧠 1. Wizard AI — Multi-Agent AI Assistant

**Current version: v15.1.0**

The central intelligence layer of Wizard Ecosystem. Wizard AI combines personalized conversations, multi-agent orchestration, document understanding, web search, image generation, and integrations with other ecosystem applications.

**Core capabilities**

- **Seven built-in personalities:** JARVIS, ORACLE, Nerd, Fun, Sarcastic, Fast, and Normal.
- **Custom Personalities:** Create personalities with custom names, emojis, system prompts, and community sharing. Personality usage and likes are tracked in SQLite.
- **Multi-Agent Orchestration:** Nine specialized agents — Researcher, Writer, Coder, Designer, Data Analyst, Reviewer, Summarizer, Translator, and Optimizer.
- **Chain Studio:** Pre-built workflows including Research & Write, Code & Review, Data Analysis, and Translate & Summarize, alongside a custom chain builder.
- **Streaming Execution:** Sequential asynchronous agent execution with Server-Sent Events (SSE).

**Document Intelligence & RAG**

- Supports PDF, DOCX, XLSX, XLS, TXT, CSV, JSON, HTML, CSS, JS, PY, and MD.
- Extracts document text using PyPDF2, python-docx, and openpyxl.
- Splits documents into 1,500-character chunks with 100-word overlap.
- Uses keyword extraction and intersection/union similarity scoring.
- Retrieves the five most relevant chunks for AI context injection.

**WizProfile — Structured User Personalization**

- More than 50 profile fields across personal information, professional experience, interests, AI preferences, and goals.
- Profile completeness tracking from 0–100%.
- Personalized response style, formality, greetings, and user-specific instructions.
- AI-assisted profile learning from natural conversations.
- Profile imports through LinkedIn URLs, GitHub usernames, and PDF/DOCX resumes.
- Structured SQLite storage with JSON fields for social links, education, skills, interests, goals, and favorites.
- Profile synchronization across ecosystem applications.

**Additional capabilities**

- Multi-engine web search with DuckDuckGo Lite, DuckDuckGo HTML, and Brave Search fallbacks.
- Image generation with Pollinations.ai, Hugging Face, Lexica, and Unsplash fallbacks.
- Secure Python execution environment with restricted imports, controlled globals, and execution limits.
- Persistent chat histories and SSE-streamed responses.
- HTTP-only, Secure, SameSite=None session cookies.
- Integrations with Wizard Calendar, Wizard Notes, Wizard Mail, and other ecosystem services.

---

## 📝 2. Wizard Notes — AI-Powered Note-Taking

A collaborative note-taking application with integrated AI editing tools and synchronized notes across Wizard Ecosystem.

**Note management**
- Create rich-text notes with titles and content.
- Click-to-edit with automatic saving.
- Rename, delete, and favorite notes.
- Recent Notes automatically surfaces the ten most recently edited entries.

**Organization**
- Custom tags and tag-based filtering.
- All Notes, Favorites, and Recent views.
- Sidebar navigation for notes, folders, and tags.
- Full-text search functionality in development.

**AI Editing Suite**
- AI Edit — transform content using natural-language instructions.
- Grammar Fix — correct spelling and grammar.
- Summarize — generate concise summaries.
- Format — organize content into headings and bullet points.
- Translate — translate notes into other languages.
- Expand — elaborate on brief drafts.

**Sharing & Collaboration**
- Share notes with other Wizard users through email addresses.
- Read-only (Can View) and full-access (Can Edit) permissions.
- Shared Inbox for incoming notes.
- Synchronization of changes across collaborators.

**Technical implementation**
- Frontend: `/notes/index.html`
- REST API for note creation, retrieval, updates, deletion, favorites, and sharing.
- Note data stored as JSON in the SQLite `user.notes_data` column.
- Shared session-based authentication infrastructure.

---

## 🤖 3. Wizard Autopilot — AI Computer Automation

A cross-platform desktop AI agent capable of translating natural-language instructions into structured computer actions.

Built with Electron and powered by Mistral's Ministral-14B, with Wizard AI as a fallback.

**Computer-use capabilities**
- Browser navigation, clicking, typing, and scrolling.
- Keyboard shortcuts and screenshots.
- Web search and browser interaction.
- File and directory operations.
- Shell commands and script execution.
- Project generation and system information.
- Clipboard control, macros, reminders, and scheduling.
- Multi-step automation workflows.

**Persistent Agent Memory**
- Conversation summaries and important facts.
- Goals and user preferences.
- Session state and contextual information.
- Proactive automation and scheduled workflows.

**Security Architecture**
- Credential vault encrypted using Electron's OS-backed `safeStorage`.
- Masked credential metadata and hostname validation.
- Permission-gated credential autofill.
- Sensitive credential values kept separate from AI prompts and action payloads.
- Explicit user approval for sensitive operations.

**Human-in-the-Loop Controls**

High-impact actions such as shell execution, file deletion, overwrites, and script execution require confirmation before proceeding.

---

## 🌐 4. Wizard Browser — Desktop Web Browser

**Current version: v10.0.0**

A full-featured Electron browser with multi-tab navigation, independent workspaces, built-in ad blocking, and local password management.

**Features**
- Multi-tab management with dynamic favicons and page titles.
- Tab persistence across sessions.
- Back, forward, reload, and smart URL/search detection.
- DuckDuckGo-powered search suggestions with debounced autocomplete.
- Independent Default, Work, School, and Media workspaces.
- Custom workspace creation with names and emoji icons.
- Local password manager with automatic login-form detection.
- CSV password import/export compatible with Brave and Chrome.
- Keyboard autofill using `Ctrl+Shift+F`.
- Built-in domain-based ad blocking.
- Bookmarks panel and browser settings.
- Purple and Light themes.
- Search engine selection and private browsing mode.

---

## 🔍 5. Wizard Search — AI-Powered Search Engine

An independent search application combining traditional web results with AI-generated explanations.

**Search pipeline**
- DuckDuckGo Lite retrieval and HTML parsing.
- Regular-expression-based results extraction.
- Automatic removal of DuckDuckGo redirect URLs.
- Fallback chain: DuckDuckGo Lite → DuckDuckGo HTML → Brave Search → raw Google/DuckDuckGo links.

**AI Features**
- Ministral-generated two-to-three-sentence topic summaries.
- Contextual explanations that go beyond displaying search links.
- Real-time DuckDuckGo autocomplete suggestions.
- Debounced suggestions for responsive searching.

---

## 📧 6. Wizard Mail — Full Email Client

A multi-provider email application with IMAP/SMTP support and integrated Wizard Ecosystem email aliases.

**Email Connectivity**
- Gmail, Outlook, Yahoo, and custom email domains.
- IMAP/SMTP connections.
- Automatic mail server detection based on email domain.
- Persistent account connection configuration.

**Email Management**
- Inbox, Sent, Spam, Trash, Drafts, and Starred folders.
- Gmail-specific folder mapping.
- Fetches the latest 50 emails, newest first.
- Parses plain-text and HTML messages, including inline CID images.
- Reply support with proper email threading headers.
- Star/unstar and delete operations.

**Wizard Email Aliases**
- Provisioning of `@wizardecosystem.dev` forwarding addresses.
- Cloudflare Email Routing integration.
- Gmail Send As setup instructions.

---

## 📅 7. Wizard Calendar — Event Management

A personal calendar application integrated with Wizard Ecosystem accounts.

**Features**
- Month and week calendar views.
- Event creation with titles, start/end times, descriptions, and locations.
- Color-coded events using violet, blue, green, red, and gold.
- Mini-calendar for quick navigation.
- Event overlap detection and dynamic calendar grid rendering.
- Per-user event storage through SQLite's `CalendarEvent` model.

---

## 💬 8. Wizard Chat — Real-Time Messaging

An integrated messaging application for Wizard Ecosystem users.

**Features**
- One-to-one conversations.
- Message delivery through tab-aware polling.
- Typing indicators with automatic timeout.
- Read receipts and unread message counts.
- User discovery through email or name.
- Conversation and message persistence in SQLite.
- Localized message timestamps.

---

## 💻 9. Developer Hub & API

A developer platform that exposes Wizard AI through an OpenAI-compatible REST API.

**API Endpoints**

| Endpoint | Function |
|---|---|
| `POST /v1/chat/completions` | Generate AI completions |
| `GET /v1/models` | List available models |
| `POST /api/keys/create` | Create API keys |
| `GET /api/keys` | List API keys |
| `POST /api/keys/<id>/revoke` | Revoke an API key |
| `GET /api/stats` | Retrieve API statistics |

**Infrastructure**
- Bearer-token authentication using `wiz_...` API keys.
- bcrypt-hashed key storage.
- Per-key request counting and last-used tracking.
- Python SDK published to PyPI as `wizard-ai-pro`.

**Admin Dashboard**
- User management.
- System logs and server status.
- Database backups and cache clearing.
- Maintenance mode.
- Broadcast messaging.
- JSON statistics export.

---

## 💰 10. Wizard Finance — Personal Finance Manager

An AI-powered personal finance application for tracking spending, managing budgets, and monitoring savings goals.

**Financial Dashboard**
- Income, expenses, and net savings summary cards.
- Month-over-month comparisons.
- Top spending category.
- Chart.js spending breakdown.

**Transaction Management**
- Record income and expenses.
- Track amount, category, merchant, and date.
- Live filtering by transaction type and category.
- Paginated transaction history with infinite Load More.

**AI Receipt Scanner**
- In-browser camera capture.
- Guided receipt-capture interface.
- AI extraction of merchant, amount, category, and date.
- Automatic population of transaction forms.

**Budgeting & Savings**
- Monthly budgets for individual categories.
- Configurable budget-alert thresholds.
- Automatic warnings as spending approaches limits.
- Savings goals with target amounts and optional deadlines.
- Progress tracking and one-click contributions.

**AI Insights**
- Natural-language financial summaries.
- Monthly income, expense, and net breakdowns generated from transaction history.

---

## 🌡️ 11. Wizard Heat — Extreme Weather & Hydration Assistant

A weather-awareness and hydration application designed around Arizona's extreme heat conditions.

**Live Weather Dashboard**
- Temperature and feels-like temperature.
- Humidity, wind speed, and UV index.
- Color-coded heat-risk indicators.
- Dynamic ambient horizon glow reflecting current risk.

**Hydration Tracking**
- Daily hydration goals measured in ounces.
- Circular progress visualization.
- Quick-add buttons for 8, 16, and 24 oz.
- Persistent per-user hydration data.

**Forecast & Safety**
- Five-day forecast with daily highs and lows.
- Risk-level indicators.
- Fahrenheit/Celsius toggle.
- Cooling-center locator.
- Activity-safety guidance for hiking, running, walking, cycling, gardening, sports, swimming, and picnics.

**Additional Tools**
- Configurable hydration reminder notifications.
- Sunscreen reapplication countdown.
- One-click current-conditions summary copying.

---

## 🔥 12. FireWatch AI — Real-Time Wildfire Monitoring

A wildfire awareness dashboard aggregating public environmental and emergency information.

**Live Data Sources**
- NASA FIRMS.
- InciWeb.
- National Weather Service alerts.

**Monitoring Dashboard**
- Color-coded fire-risk levels: Low, Moderate, High, and Extreme.
- Risk calculations incorporating temperature, humidity, wind speed, and active alert counts.
- Active fire listings with severity, distance, containment status, and acreage.
- Recent emergency alerts with timestamps and severity indicators.
- Automatic critical-alert banners.

**AI-Powered Awareness**
- AI-generated evacuation-route suggestions.
- Smoke forecasts with time-block severity indicators.
- Live wind direction and speed.

**Location Features**
- Location search with geocoding.
- Device geolocation support.
- Reverse geocoding into readable place names.
- Automatic data refresh every two minutes.

---

## 🌵 13. Wizard Nature — Desert & Wildlife Companion

An Arizona-focused nature application combining wildlife identification, desert exploration, and outdoor awareness.

**Cactus Tracker**
- Six Sonoran Desert cactus species:
  - Saguaro
  - Barrel cactus
  - Prickly pear
  - Cholla
  - Organ pipe
  - Senita
- Spot-and-log tracking with persistent state.

**AI Photo Identification**
- Snake ID — distinguishes rattlesnakes from harmless snakes.
- Critter ID — identifies lizards, birds, and other wildlife.
- Plant ID — identifies cacti, wildflowers, and desert plants.
- Drag-and-drop or tap-to-upload image interface.
- Vision AI analysis with rendered explanations.

**Desert Experience Tools**
- Sunset Forecast with a nightly 0–10 quality rating.
- Cloud cover, humidity, and air-quality inputs.
- Wildflower Alert for post-rain bloom conditions.
- Suggested wildflower viewing locations.
- Arizona camping guide with campsite ratings, amenities, seasons, and reservation information.
- Ambient interface colors that adapt to local time of day.

---

## 💻 14. Wizard Code — AI-Powered Desktop Code Editor

A full Electron-based IDE built around the Monaco editor, combining familiar development tools with Wizard AI and autonomous coding assistance.

**Editor & Workspace**
- Multi-tab code editing.
- Side-by-side split views.
- Drag-and-drop file explorer.
- Inline file and folder creation, renaming, and deletion.
- Integrated terminal with live standard input.
- VS Code-style command palette.
- Monaco-based editing experience.

**Wizard AI Integration**
- Dedicated AI chat panel.
- Quick actions: Explain, Fix, Generate, and Comment.
- Streaming AI responses.
- Ghost-text inline code completions.
- Hover-triggered AI error explanations.
- One-click Fix with Wizard AI.

**Agent Mode**
- Autonomous multi-file AI agent.
- Function-calling tools: `list_files`, `read_file`, and `write_file`.
- Proposed changes staged without immediately modifying files on disk.
- Individual or bulk acceptance and rejection.
- Monaco diff viewer for reviewing proposed changes.

**Diagnostics & Language Support**
- Live Monaco language-service validation for JavaScript, TypeScript, JSON, CSS, and HTML.
- Background compiler and linter checks.
- Supported checks include:
  - Python (`py_compile`)
  - Java (`javac`)
  - C (`gcc`)
  - Rust (`rustc`)
  - Go (`go vet`)
  - Bash (`bash -n`)
  - PHP (`php -l`)
  - Ruby (`ruby -c`)
- Parsed diagnostics displayed as editor squiggles and in a Problems panel.

**Integrated Source Control**
- Git staging and unstaging.
- Commit, push, and pull.
- Branch switching and creation.
- Inline diff viewer.
- AI-generated commit messages based on staged changes.

**Developer Productivity**
- Snippet and Emmet-style expansion across seven languages.
- Live HTML, Markdown, and CSS execution/preview.
- Sandboxed preview proxy for relative asset resolution.

---

## 🎮 15. Wizard Arcade — Browser Game Collection

A collection of three original browser games built from scratch and integrated into Wizard Ecosystem.

**Wasteland Adventure**
- Pixel-art wasteland RPG.
- Character class selection.
- Turn-based combat.
- Skill unlocks and exploration.

**Wizard Sandbox**
- Falling-sand physics simulation.
- More than 50 interactive elements.
- Material interactions and emergent physics.
- Fire, explosions, and chain reactions.

**Ultimate Clicker**
- Incremental clicker game.
- Upgrades and automation.
- Prestige progression.
- Achievement system.

**Arcade Hub**
- Animated canvas starfield and shooting stars.
- Ambient nebula lighting.
- CSS rune-ring hero animation.
- Interactive game cards with hover effects and individual visual accents.

---

## 🗺️ 16. Wizard Maps — Privacy-First Navigation

A full-featured navigation application built using OpenStreetMap, MapLibre GL, and TomTom services.

**Mapping & Visual Design**
- OpenStreetMap-powered mapping.
- MapLibre GL rendering.
- Custom Wizard dark map style with a purple-and-gold palette.
- Runtime recoloring of map layers.
- Alternative Day and Light map styles.
- 3D buildings and terrain visualization.

**Turn-by-Turn Navigation**
- OSRM routing for driving, walking, and cycling.
- Maneuver instructions and icons.
- Live distance-to-turn.
- Estimated arrival time.
- Remaining distance and travel time.
- Automatic rerouting when more than 50 meters off-route.

**Voice Guidance**
- Web Speech API navigation announcements.
- Distance-triggered guidance at 500m, 200m, and 50m.
- Destination-side detection using final approach bearing.
- iOS speech-engine keep-alive workarounds for standalone PWAs.

**Advanced Navigation Tools**
- Lane guidance strip.
- Speed-limit signs using route annotations and Overpass API fallback.
- Five-minute speed-limit caching.
- Live speed readout.
- Compass-driven map rotation.
- Wake-lock during navigation.
- Hybrid GPS and device-orientation heading.
- Recenter control when the user moves the map.

**Search & Saved Places**
- Photon geocoding with debounced autocomplete.
- Reverse geocoding for dropped pins.
- Saved Home, Work, School, and custom locations.
- Emoji icons and localStorage persistence.

**Responsive Interface**
- Mobile-first design.
- Safe-area support.
- Glassmorphic cards and bottom sheets.
- Desktop layout with repositioned left-side controls.

---

# 🏗️ Architecture & Infrastructure

Wizard Ecosystem uses a shared backend and interconnected frontend applications, with Electron providing the desktop application layer.

## Backend

- Python and Flask.
- More than 50 backend routes.
- SQLite database.
- Shared session-based authentication.
- Structured user profiles through a dedicated `wiz_profile` table.
- Server-Sent Events for streaming AI responses.
- CORS configuration for `wizardecosystem.dev` and localhost.
- HTTP-only, Secure, SameSite=None cookies.
- Rate limiting and graceful service fallbacks.

## Database

The platform uses SQLite for persistent application data, including:

- Users and structured profiles.
- Chats and conversation history.
- Memory and uploaded files.
- Calendar events.
- API keys.
- Personalities and AI agents.
- Agent chains.
- Email aliases.
- Messaging conversations and messages.
- Notes data.

## AI Infrastructure

- Mistral API integration.
- Ministral models for AI-powered workflows.
- Multi-agent orchestration.
- Retrieval-Augmented Generation (RAG).
- Vision AI integrations.
- External service fallbacks.
- Secure execution boundaries and approval-based automation.

## Frontend

- HTML5.
- CSS3.
- JavaScript.
- Responsive web applications.
- Shared design language across the ecosystem.
- GitHub Pages hosting.

## Desktop Infrastructure

Electron powers the native desktop applications.

Distribution infrastructure includes:

| Platform | Packaging |
|---|---|
| Windows | NSIS installer |
| macOS | DMG |
| Linux | Debian packages |

Additional infrastructure:
- Electron Builder.
- GitHub Releases.
- Auto-update infrastructure.
- PythonAnywhere backend hosting.
- GitHub Pages frontend hosting.
- Custom DNS configuration.

---

# 🚀 Getting Started

## Web Access

The easiest way to explore Wizard Ecosystem is through the live platform:

**[https://wizardecosystem.dev](https://wizardecosystem.dev)**

## Desktop Applications

Desktop installers are distributed through the platform's download page:

**[Download Wizard Ecosystem](https://wizardecosystem.dev/)**

Available desktop targets include Windows, macOS, and Linux.



# 🔗 Ecosystem Links

| Resource | URL |
|---|---|
| Main Platform | [wizardecosystem.dev](https://wizardecosystem.dev) |
| Desktop Downloads | [wizardecosystem.dev/](https://wizardecosystem.dev/) |
| Documentation | [GitHub Wiki](https://github.com/ag-ultima/wizard-ecosystem/wiki) |
| Source Code | [GitHub Repository](https://github.com/ag-ultima/wizard-ecosystem) |
| Issue Tracker | [GitHub Issues](https://github.com/ag-ultima/wizard-ecosystem/issues) |
| Update History | [wizardecosystem.dev/ai](https://wizardecosystem.dev/ai) |

---

# 🔐 Privacy & Security

Security is built into the platform's architecture rather than treated as an afterthought.

Key implementation areas include:

- Session-based authentication with secure HTTP-only cookies.
- bcrypt-hashed API key storage.
- Restricted Python execution environments.
- Encrypted credential storage in Wizard Autopilot using Electron `safeStorage`.
- Human approval for sensitive computer-use operations.
- Separation of credential values from AI prompts and action payloads.
- Permission-based note sharing.
- Per-user application data storage.

---

# 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Backend | Python, Flask |
| Frontend | HTML, CSS, JavaScript |
| Desktop | Electron, Node.js |
| Database | SQLite |
| AI | Mistral API, Ministral |
| Code Editor | Monaco Editor |
| Mapping | MapLibre GL, OpenStreetMap, TomTom |
| Navigation | OSRM, Photon, Overpass API |
| Charts | Chart.js |
| Document Processing | PyPDF2, python-docx, openpyxl |
| Desktop Packaging | Electron Builder |
| Hosting | PythonAnywhere, GitHub Pages |
| Email Infrastructure | IMAP, SMTP, Cloudflare Email Routing |
| Version Control | Git, GitHub |

---

# 🤝 Contributing

Contributions, suggestions, and bug reports are welcome!

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/amazing-feature
   ```

3. Commit your changes:

   ```bash
   git commit -m "Add amazing feature"
   ```

4. Push your branch:

   ```bash
   git push origin feature/amazing-feature
   ```

5. Open a Pull Request.

For bugs and feature requests, visit the [GitHub Issues page](https://github.com/ag-ultima/wizard-ecosystem/issues).

---

# 📄 License

Wizard Ecosystem is distributed under the **MIT License**.

See the [LICENSE](LICENSE) file for details.

---

# 👤 Creator

**Arnav Gupta**

Founder & Developer — Wizard Ecosystem

- **Website:** [wizardecosystem.dev](https://wizardecosystem.dev)
- **GitHub:** [@ag-ultima](https://github.com/ag-ultima)
- **Email:** ag@wizardecosystem.dev

---

# 🙏 Acknowledgments

Wizard Ecosystem builds upon technologies and services made possible by:

- **Electron** — Desktop application framework.
- **Flask** — Python backend framework.
- **Mistral AI** — AI inference and language models.
- **Monaco Editor** — Code editing infrastructure.
- **OpenStreetMap** — Open mapping data.
- **MapLibre GL** — Interactive mapping.
- **OSRM** — Routing infrastructure.
- **Cloudflare** — Email routing and infrastructure.
- **PythonAnywhere** — Backend hosting.
- **GitHub** — Source control and frontend hosting.
- **DuckDuckGo** — Search infrastructure.

---

<div align="center">

## ⭐ Support Wizard Ecosystem

If you find Wizard Ecosystem interesting, consider giving the repository a star!

[![GitHub Stars](https://img.shields.io/github/stars/ag-ultima/wizard-ecosystem?style=social)](https://github.com/ag-ultima/wizard-ecosystem)

**Built from scratch with 🧙 by Arnav Gupta.**

*Sixteen applications. One ecosystem.*

[**Explore Wizard Ecosystem →**](https://wizardecosystem.dev)

</div>
