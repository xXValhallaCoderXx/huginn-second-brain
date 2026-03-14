# Huginn — AI Agent (Mastra)

AI agent powered by [Mastra](https://mastra.ai) framework, using OpenRouter for LLM access. Deployed on Railway.

## Quick Start

### Prerequisites

- **Node.js 22+**
- [OpenRouter API key](https://openrouter.ai/keys)

### 1. Install & configure

```bash
npm install
cp .env.example .env
# Edit .env — add your OPENROUTER_API_KEY
```

### 2. Run locally

```bash
npm run dev
```

Opens Mastra Studio at `http://localhost:4111` where you can test the agent interactively.

## Project Structure

```
├── src/mastra/
│   ├── agents/
│   │   └── huginn.ts        # Agent definition
│   ├── tools/               # Custom tools (add your own)
│   └── index.ts             # Mastra entry point
├── Dockerfile               # Multi-stage build for deployment
├── railway.toml             # Railway deployment config
├── package.json
├── tsconfig.json
└── .env.example
```

## Railway Deployment

Railway auto-deploys on every push to `main`.

### 1. Connect to Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `huginn-second-brain`
3. Railway detects the `Dockerfile` and builds automatically

### 2. Set environment variables

In Railway dashboard → your service → **Variables**, add:

| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | `sk-or-...` |

### 3. Deploy

Push to `main` — Railway builds and deploys automatically.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | [OpenRouter](https://openrouter.ai/keys) API key |
| `PORT` | No | Server port (default: `4111`) |
