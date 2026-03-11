# Huginn — Self-Hosted AI Second Brain

A self-hosted AI-powered "second brain" that connects your **Obsidian vault** to a **Telegram bot** via **OpenClaw**, with intelligent multi-model routing through **OpenRouter**.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌───────────────┐
│   Telegram   │────▶│   OpenClaw   │────▶│  OpenRouter   │
│   (you)      │◀────│  (gateway)   │◀────│  (LLM APIs)   │
└──────────────┘     └──────┬───────┘     └───────────────┘
                            │
                     ┌──────▼───────┐
                     │  Obsidian    │
                     │  Vault (md)  │
                     └──────────────┘
```

## Quick Start (Local)

### Prerequisites

- **Node.js 22+** (`node --version`)
- **obsidian-cli** (or `notesmd-cli` symlinked as `obsidian-cli`)
- An Obsidian vault on your machine
- API keys: [OpenRouter](https://openrouter.ai/keys), [Tavily](https://tavily.com)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure API keys

Edit `~/.openclaw/.env` and add your keys:

```bash
OPENROUTER_API_KEY=sk-or-...
TAVILY_API_KEY=tvly-...
```

### 3. Start the gateway

```bash
npx openclaw
```

### 4. Message your bot on Telegram

Send a message to your bot — Huginn will respond using Claude Sonnet 4.5 for complex queries, with cheaper models for background tasks.

## Core Workflows

- **Quick Capture**: Send a thought via Telegram → saved to daily note in your vault
- **Deep Research**: Ask a question → searches vault + web → synthesized answer
- **Agentic Writing**: Ask to organize or draft → reads vault, writes new notes

## Model Routing

| Task | Model | Cost/1M tokens |
|------|-------|----------------|
| Primary/Complex | Claude Sonnet 4.5 | $18.00 |
| Sub-agents | DeepSeek Reasoner | $2.74 |
| Fast queries | Gemini 3 Flash | $3.50 |
| Heartbeats | Gemini 2.5 Flash-Lite | $0.50 |

## Project Structure

```
├── workspace/                # OpenClaw agent workspace (AGENTS.md, SOUL.md, skills/, memory/)
│   ├── AGENTS.md             # Agent operating instructions + vault workflows
│   ├── SOUL.md               # Agent persona and tone
│   ├── USER.md               # Info about you (filled in by the agent)
│   ├── HEARTBEAT.md          # Periodic check instructions
│   ├── MEMORY.md             # Long-term curated memory (gitignored)
│   ├── memory/               # Daily memory logs (gitignored)
│   └── skills/               # Installed skills (obsidian, tavily-search)
├── docker-compose.yml        # VPS deployment (OpenClaw + future CouchDB/Caddy)
├── .env.example              # Environment variable template
├── package.json              # Node dependencies (openclaw)
└── README.md                 # This file
```

## Configuration

- **OpenClaw config**: `~/.openclaw/openclaw.json` (points workspace here)
- **API keys**: `~/.openclaw/.env`
- **Workspace**: `./workspace/` (this repo)

## Roadmap

- [x] OpenClaw + Telegram bot
- [x] Multi-model routing (OpenRouter)
- [x] Obsidian vault integration (obsidian-cli)
- [x] Web research (Tavily + built-in web_search)
- [ ] CouchDB + LiveSync (multi-device sync)
- [ ] Caddy reverse proxy (SSL)
- [ ] VPS deployment automation
