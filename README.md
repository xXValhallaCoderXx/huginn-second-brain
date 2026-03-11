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
├── workspace/                # OpenClaw agent workspace
│   ├── AGENTS.md             # Agent instructions + vault workflows
│   ├── SOUL.md               # Agent persona and tone
│   ├── USER.md               # Info about you
│   ├── HEARTBEAT.md          # Periodic check instructions
│   ├── MEMORY.md             # Long-term memory (gitignored)
│   ├── memory/               # Daily logs (gitignored)
│   └── skills/               # Skills (obsidian, tavily-search)
├── config/                   # Deployment config
│   ├── openclaw.json         # Server config (env vars for secrets)
│   └── Caddyfile             # Reverse proxy config
├── scripts/
│   └── deploy.sh             # One-command VPS deploy
├── docker-compose.yml        # Docker deployment
├── .env.example              # Environment variable template
├── package.json              # Node dependencies
└── README.md
```

## Configuration

- **OpenClaw config**: `~/.openclaw/openclaw.json` (local) or `config/openclaw.json` (deployment)
- **API keys**: `~/.openclaw/.env` (local) or `.env` (deployment)
- **Workspace**: `./workspace/` (this repo)

## VPS Deployment

### Prerequisites

- A Linux VPS with Docker + Docker Compose
- A domain name (optional, for HTTPS)

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USER/huginn-second-brain.git
cd huginn-second-brain
cp .env.example .env
```

Edit `.env` and fill in your keys:
```bash
OPENROUTER_API_KEY=sk-or-...
TAVILY_API_KEY=tvly-...
TELEGRAM_BOT_TOKEN=1234567890:ABC...
GATEWAY_TOKEN=$(openssl rand -hex 24)
```

### 2. Deploy

```bash
# Without HTTPS (bot-only, Telegram handles transport security)
./scripts/deploy.sh

# With HTTPS reverse proxy (set DOMAIN in .env first)
./scripts/deploy.sh --with-proxy
```

### 3. Manage

```bash
docker compose logs -f openclaw    # Tail logs
docker compose ps                  # Status
docker compose restart openclaw    # Restart
docker compose down                # Stop
docker compose pull && docker compose up -d  # Update
```

### Important notes

- **Stop your local gateway** before deploying — only one instance can poll Telegram at a time
- The workspace files (AGENTS.md, skills, etc.) are copied into the container on first start
- Vault notes are stored on a Railway Volume at `/data/vault` — they persist across redeployments
- Add CouchDB (below) to sync your vault to desktop and mobile Obsidian

## Obsidian LiveSync Setup (Multi-Device Vault Sync)

This connects the Railway vault to your desktop and mobile Obsidian via CouchDB.

### 1. Add CouchDB to Railway

In your Railway project:
1. Click **+ New Service** → **Docker Image** → enter `couchdb:3`
2. Set these environment variables on the CouchDB service:
   - `COUCHDB_USER=admin`
   - `COUCHDB_PASSWORD=` (pick a strong password)
3. Note the **internal hostname** Railway assigns (e.g. `couchdb.railway.internal`)
4. In Railway, go to **Settings → Networking** on the CouchDB service → **Generate Domain** to get a public HTTPS URL (needed for mobile)

### 2. Initialise the CouchDB database

Once CouchDB is deployed, run this once from Railway's shell or locally:

```bash
COUCH="https://admin:PASSWORD@YOUR-COUCHDB-DOMAIN"
curl -X PUT "$COUCH/obsidian-livesync"
curl -X PUT "$COUCH/obsidian-livesync/_security" \
  -H "Content-Type: application/json" \
  -d '{"admins":{"names":[],"roles":[]},"members":{"names":[],"roles":[]}}'
```

### 3. Add CouchDB vars to the openclaw Railway service

In Railway → openclaw service → **Variables**, add:

| Variable | Value |
|----------|-------|
| `COUCHDB_HOST` | `couchdb.railway.internal:5984` (internal) |
| `COUCHDB_USER` | `admin` |
| `COUCHDB_PASSWORD` | your CouchDB password |
| `LIVESYNC_DB` | `obsidian-livesync` |

The vault-sync daemon will start automatically on the next deploy.

### 4. Install Self-hosted LiveSync on Obsidian (Desktop + Mobile)

1. Obsidian → **Settings** → **Community Plugins** → Browse → search **"Self-hosted LiveSync"** → Install & Enable
2. Open the plugin settings → **Setup wizard**
3. Enter your CouchDB details:
   - **URI**: `https://YOUR-COUCHDB-DOMAIN` (Railway public URL)
   - **Username**: `admin`
   - **Password**: your CouchDB password
   - **Database name**: `obsidian-livesync`
4. Click **Test** → **Apply**
5. Set **Sync mode** to **LiveSync** for real-time sync

Repeat on mobile. All devices + the Railway bot will now share the same vault. ✅

## Roadmap

- [x] OpenClaw + Telegram bot
- [x] Multi-model routing (OpenRouter)
- [x] Obsidian vault integration (obsidian-cli)
- [x] Web research (Tavily + built-in web_search)
- [x] Docker deployment + deploy script
- [x] Caddy reverse proxy (auto-HTTPS)
- [x] Railway deployment (auto-deploy on merge)
- [x] CouchDB + LiveSync (multi-device vault sync)
- [ ] Backup/restore scripts

## Railway Deployment (Recommended)

Railway auto-deploys on every push/merge to `main`.

### 1. Connect to Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select `huginn-second-brain`
3. Railway will detect the `Dockerfile` and build automatically

### 2. Set environment variables

In Railway dashboard → your service → **Variables**, add:

| Variable | Value |
|----------|-------|
| `OPENROUTER_API_KEY` | `sk-or-...` |
| `TAVILY_API_KEY` | `tvly-...` |
| `TELEGRAM_BOT_TOKEN` | `1234567890:ABC...` |
| `GATEWAY_TOKEN` | (generate with `openssl rand -hex 24`) |

### 3. Deploy

That's it! Railway builds and deploys on every merge to `main`. You can also trigger manual deploys from the dashboard.

```bash
# Your workflow:
git checkout -b feature/my-change
# make changes to workspace/, config/, etc.
git commit && git push
# merge PR → Railway auto-deploys
```

### Important notes

- **Stop your local gateway** first (`npx openclaw gateway stop`) — only one instance can poll Telegram
- Railway provides persistent storage via volumes for the vault data
- No domain/HTTPS needed — Telegram uses long-polling (outbound only)
