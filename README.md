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
│   ├── deploy.sh             # One-command VPS deploy
│   ├── syncthing-setup.sh    # Syncthing bootstrap (first run)
│   └── vault-healthcheck.sh  # Vault + sync health checks
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
- Add Syncthing (below) to sync your vault to desktop and mobile Obsidian

## Syncthing Setup (Multi-Device Vault Sync)

Syncthing syncs the vault folder directly between the Railway server and your devices. No database translation layer — Obsidian just reads plain files.

### 1. Set Syncthing env vars on Railway

In Railway → your service → **Variables**, add:

| Variable | Value |
|----------|-------|
| `SYNCTHING_GUI_USER` | `admin` |
| `SYNCTHING_GUI_PASSWORD` | (pick a strong password) |

Syncthing bootstraps automatically on first deploy.

### 2. Expose Syncthing ports on Railway

In Railway → your service → **Settings → Networking**:
1. **Generate Domain** for port `8384` (Syncthing web GUI — needed for initial setup)
2. **Add TCP Proxy** for port `22000` (BEP sync protocol — needed for actual file sync)

### 3. Get the server's Device ID

Open the Syncthing GUI at `https://YOUR-RAILWAY-DOMAIN:8384`, log in, and note the **Device ID** shown under **Actions → Show ID**.

### 4. Install Syncthing on your devices

- **Desktop**: Install from [syncthing.net](https://syncthing.net/downloads/) or your package manager
- **Android**: Install [Syncthing-Fork](https://f-droid.org/packages/com.github.catfriend1.syncthingandroid/) from F-Droid
- **iOS**: Install [Möbius Sync](https://apps.apple.com/app/m%C3%B6bius-sync/id1539203216)

### 5. Pair devices

On each client device:
1. Open Syncthing → **Add Remote Device** → paste the server's Device ID
2. On the server GUI, **accept** the incoming device request
3. **Share** the `huginn-vault` folder with the new device
4. On the client, set the folder path to your Obsidian vault location

### 6. Open in Obsidian

Point Obsidian at the synced folder. No plugins needed — Syncthing handles sync at the OS level.

### Notes

- **Conflict handling**: If two devices edit the same file simultaneously, Syncthing creates `.sync-conflict-*` files. Review and resolve manually.
- **Ignore patterns**: Consider adding a `.stignore` file in your vault to skip noisy files:
  ```
  .obsidian/workspace.json
  .obsidian/workspace-mobile.json
  .obsidian/cache
  .trash/
  ```

## Roadmap

- [x] OpenClaw + Telegram bot
- [x] Multi-model routing (OpenRouter)
- [x] Obsidian vault integration (obsidian-cli)
- [x] Web research (Tavily + built-in web_search)
- [x] Docker deployment + deploy script
- [x] Caddy reverse proxy (auto-HTTPS)
- [x] Railway deployment (auto-deploy on merge)
- [x] Syncthing (multi-device vault sync, replaces CouchDB/LiveSync)
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
