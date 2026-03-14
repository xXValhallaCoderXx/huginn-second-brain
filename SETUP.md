# Setup Guide

## Prerequisites

- **Node.js 22+**
- An [OpenRouter API key](https://openrouter.ai/keys)
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable               | Required | Description                                                                                                         |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`   | **Yes**  | Your OpenRouter API key — used for both the main model (Claude Sonnet) and observational memory (Gemini Flash)      |
| `TELEGRAM_BOT_TOKEN`   | **Yes**  | Bot token from @BotFather on Telegram                                                                               |
| `TELEGRAM_WEBHOOK_URL` | No       | Public webhook URL for production (e.g. `https://<app>.up.railway.app/telegram/webhook`). Leave unset for local dev |
| `LIBSQL_URL`           | No       | libSQL connection URL. Defaults to `file:./mastra.db` (local SQLite file)                                           |

## 3. Run locally

```bash
npm run dev
```

This starts the Mastra dev server and opens **Mastra Studio** at [http://localhost:4111](http://localhost:4111).

## 4. Test in Mastra Studio

Open `http://localhost:4111`, find the **Huginn** agent, and try:

- **"Hey, who are you?"** — Confirms personality is loaded (Norse raven theme, knows your name)
- **"What time is it?"** — Tests the `get-current-datetime` tool
- **"What did I just say?"** — Tests conversation memory within a thread

## What gets created

- `mastra.db` — SQLite database for memory, threads, and observations (gitignored)
- `.mastra/` — Mastra build cache (gitignored)

## Project Structure

```
src/
├── mastra/
│   ├── agents/
│   │   └── huginn.ts          # Agent config (model, memory, tools, instructions)
│   ├── tools/
│   │   └── datetime-tool.ts   # Date/time awareness tool
│   ├── storage.ts             # Shared LibSQLStore instance
│   └── index.ts               # Mastra entry point + Telegram webhook route
├── personality/
│   ├── SOUL.md                # Communication style and tone
│   ├── IDENTITY.md            # Who Huginn is, who the user is
│   ├── MEMORY.md              # Standing facts and preferences
│   └── load.ts                # Reads and combines personality files
└── telegram/
    └── bot.ts                 # grammY bot handler (forwards messages to Huginn)
```

## Architecture

- **Model**: `openrouter/anthropic/claude-sonnet-4.6` (main agent)
- **Observational Memory model**: `openrouter/google/gemini-2.5-flash` (background compression — uses the same OpenRouter key)
- **Storage**: libSQL (SQLite-compatible) via `@mastra/libsql`
- **Memory**: `@mastra/memory` with observational memory enabled — automatically compresses conversation history into dense observations for long-term recall
- **Thread isolation**: Each Telegram chat ID maps to its own conversation thread
- **Resource ID**: Hardcoded to `"nate"` for MVP (single user)

## Telegram Setup (Production)

1. Deploy to Railway (or similar) — the `Dockerfile` and `railway.toml` are ready
2. Set `TELEGRAM_WEBHOOK_URL` to `https://<your-app>.up.railway.app/telegram/webhook`
3. The webhook auto-registers on server start

## Cost Notes

Each message involves:

- **1 Claude Sonnet call** via OpenRouter (main response)
- **Occasional Gemini Flash call** for observational memory processing (~$0.15/1M tokens)
