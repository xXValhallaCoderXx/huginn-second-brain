# Huginn

A self-hosted personal AI system where identity is owned by the application, not by any channel. One account → one personality → one memory → accessible from any linked channel → fully isolated between users.

> **Status**: Phase 2 complete — Calendar integration, Observational Memory, Semantic Recall, Daily Briefing (`/brief`), Mastra Studio observability

---

## Architecture

Huginn is a monorepo with two apps and a shared package:

| Package           | Description                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `apps/web`        | TanStack Start (React) web dashboard — auth, linking, personality, calendar management |
| `apps/agent`      | Mastra AI agent + Telegram bot — LLM interactions, memory, calendar tools, daily briefing, channel handling  |
| `packages/shared` | Drizzle schemas, DB connection factory, services, TypeScript interfaces    |

**Single database, schema isolation:**

| Schema   | Stores                                                                   | Managed By                   |
| -------- | ------------------------------------------------------------------------ | ---------------------------- |
| `public` | Accounts, channel links, personality files, linking codes, auth sessions | Drizzle migrations (app)     |
| `mastra` | Threads, messages, working memory, observations, reflections             | Mastra auto-migration        |
| `public` | Vector embeddings for semantic recall                                    | PgVector auto-migration      |

The bridge between schemas is `accounts.id` (UUID) — used as Mastra `resourceId`.

---

## Project Structure

```
huginn-second-brain/
├── package.json                  # Root workspace config
├── pnpm-workspace.yaml           # apps/* + packages/*
├── turbo.json                    # Turborepo pipeline
├── tsconfig.base.json            # Shared TypeScript config
├── docker-compose.yml            # Local Postgres
├── .env.example                  # All required env vars
├── eslint.config.js              # ESLint flat config
├── .prettierrc                   # Prettier config
│
├── apps/
│   ├── web/                      # TanStack Start web app
│   │   ├── vite.config.ts        # Vite + TanStack Start + Nitro
│   │   ├── server/
│   │   │   └── api/
│   │   │       ├── auth/[...].ts # Nitro catch-all for Better Auth
│   │   │       └── calendar/
│   │   │           └── callback.ts # Google Calendar OAuth callback
│   │   └── src/
│   │       ├── router.tsx        # TanStack Router config
│   │       ├── components/
│   │       │   ├── nav-bar.tsx       # Shared navigation
│   │       │   ├── channels-page.tsx # Connected channels management
│   │       │   ├── calendars-page.tsx # Calendar connections management
│   │       │   └── edit-identity-page.tsx # Personality editor
│   │       ├── routes/
│   │       │   ├── __root.tsx    # Root layout
│   │       │   ├── index.tsx     # Landing / sign-in page
│   │       │   ├── _authenticated.tsx  # Auth guard layout
│   │       │   └── _authenticated/
│   │       │       ├── dashboard.tsx  # Personality editor + channel status
│   │       │       ├── chat.tsx       # Streaming chat with Huginn agent
│   │       │       ├── calendars.tsx  # Calendar connections page
│   │       │       ├── settings.tsx   # Settings page
│   │       │       └── link/
│   │       │           └── telegram.tsx # Telegram linking (deep link + QR code)
│   │       └── lib/
│   │           ├── auth.ts       # Better Auth server config
│   │           ├── auth-client.ts # Better Auth React client
│   │           ├── db.ts         # DB connection (server-only)
│   │           ├── session.ts    # Session server function
│   │           ├── server-fns.ts # Auth + personality + calendar server fns
│   │           └── account-resolution.ts # BA session → Huginn account
│   │
│   └── agent/                    # Mastra agent service (port 4111)
│       └── src/
│           ├── index.ts          # Hono HTTP server (/chat, /chat/stream, /telegram/info)
│           ├── calendar-cache.ts # In-memory 5min TTL cache for calendar events
│           ├── identity/
│           │   └── instructions.ts # buildInstructions() — personality + calendar + date injection
│           ├── telegram/
│           │   ├── bot.ts        # grammY bot factory (auto-discovers username)
│           │   └── handlers.ts   # /start, /link, /brief, message routing handlers
│           └── mastra/
│               ├── index.ts      # Mastra instance (storage, observability, tools)
│               ├── storage.ts    # PostgresStore shared instance (mastra schema)
│               ├── tools/
│               │   └── get-calendar.ts # Calendar lookup tool (period-based + date range)
│               └── agents/
│                   └── huginn.ts # Agent definition (dynamic instructions, memory)
│
│           └── workflows/
│               └── daily-briefing.ts # On-demand briefing workflow (calendar + memory + LLM)
│
└── packages/
    └── shared/                   # Shared library
        ├── drizzle.config.ts     # Drizzle Kit config
        └── src/
            ├── db.ts             # createDb() factory
            ├── schema/           # Drizzle table definitions
            │   ├── accounts.ts
            │   ├── auth.ts       # Better Auth tables (user, session, account, verification)
            │   ├── channel-links.ts
            │   ├── calendar-connections.ts
            │   ├── personality-files.ts
            │   └── linking-codes.ts
            ├── services/         # Service implementations
            │   ├── account-service.ts  # AccountService + linking code helpers
            │   ├── personality-store.ts # PersonalityStore (load, save, exists, history)
            │   ├── calendar-service.ts # CalendarService (event aggregation + context formatting)
            │   ├── calendar-connection-service.ts # Calendar connection CRUD (encrypted tokens)
            │   ├── google-calendar-provider.ts   # Google Calendar API v3 HTTP client
            │   ├── crypto.ts       # AES-256-GCM encryption utilities
            │   └── seed.ts       # Default SOUL + IDENTITY seeding
            └── types/            # TypeScript interfaces
                ├── accounts.ts   # Account, ChannelLink, AccountService
                ├── identity.ts   # PersonalityStore, PersonalityFileType
                └── calendar.ts   # CalendarService, CalendarProvider, CalendarConnection
```

---

## Prerequisites

- **Node.js** ≥ 22
- **pnpm** (v10.6.5+ recommended)
- **Docker** (for local PostgreSQL)

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values. For local development, the defaults work with Docker Compose:

```env
APP_DATABASE_URL=postgresql://huginn:huginn@localhost:5432/huginn
```

### 3. Start PostgreSQL

```bash
docker compose up -d
```

Verify it's healthy:

```bash
docker compose ps
```

### 4. Push database schema

```bash
pnpm db:push
```

This creates 9 tables in Postgres: `accounts`, `channel_links`, `personality_files`, `linking_codes`, `calendar_connections`, plus 4 Better Auth tables (`user`, `session`, `account`, `verification`).

### 5. Run development servers

```bash
# Both apps (via Turborepo)
pnpm dev

# Or individually:
pnpm --filter @huginn/web dev      # Web on http://localhost:3000
pnpm --filter @huginn/agent dev    # Agent with tsx watch
```

---

## Commands

### Root (Turborepo)

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `pnpm dev`         | Start all apps in dev mode      |
| `pnpm build`       | Build all packages              |
| `pnpm lint`        | Lint all packages               |
| `pnpm db:push`     | Push Drizzle schema to Postgres |
| `pnpm db:generate` | Generate Drizzle migrations     |
| `pnpm db:studio`   | Open Drizzle Studio GUI         |

### apps/web

| Command                             | Description                   |
| ----------------------------------- | ----------------------------- |
| `pnpm --filter @huginn/web dev`     | Vite dev server (port 3000)   |
| `pnpm --filter @huginn/web build`   | Production build (Vite + tsc) |
| `pnpm --filter @huginn/web preview` | Preview production build      |
| `pnpm --filter @huginn/web start`   | Start production server       |

### apps/agent

| Command                             | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `pnpm --filter @huginn/agent dev`   | Dev mode with tsx watch (port 4111)      |
| `pnpm --filter @huginn/agent start` | Run agent                                |
| `pnpm --filter @huginn/agent build` | Type-check (tsc --noEmit)                |

---

## Tech Stack

| Layer           | Choice                                       |
| --------------- | -------------------------------------------- |
| Monorepo        | Turborepo + pnpm workspaces                  |
| Web framework   | TanStack Start (React 19, Vite 8, Nitro)     |
| Auth            | Better Auth — Google OAuth                   |
| App database    | PostgreSQL (Docker locally, Railway in prod) |
| ORM             | Drizzle                                      |
| Agent framework | Mastra                                       |
| Agent memory    | Mastra Memory + PostgreSQL (`mastra` schema) |
| Semantic recall | PgVector + text-embedding-3-small (OpenRouter) |
| Observational memory | Mastra OM + Gemini 2.5 Flash (OpenRouter) |
| Observability   | @mastra/observability + DefaultExporter |
| LLM routing     | OpenRouter (Claude Sonnet 4)                 |
| Calendar        | Google Calendar API v3 (direct HTTP)         |
| Telegram        | grammY                                       |
| Runtime         | Node.js 22+                                  |
| Infrastructure  | Docker Compose / Railway                     |

---

## Environment Variables

| Variable               | Used By            | Description                                  |
| ---------------------- | ------------------ | -------------------------------------------- |
| `APP_DATABASE_URL`     | shared, web, agent | PostgreSQL connection string                 |
| `OPENROUTER_API_KEY`   | agent              | LLM provider key                             |
| `TELEGRAM_BOT_TOKEN`   | agent              | grammY bot token                             |
| `GOOGLE_CLIENT_ID`     | web, shared        | Google OAuth client ID                       |
| `GOOGLE_CLIENT_SECRET` | web, shared        | Google OAuth client secret                   |
| `BETTER_AUTH_SECRET`   | web                | Session signing secret + HMAC state signing  |
| `APP_URL`              | web                | Public URL for OAuth redirects               |
| `CALENDAR_ENCRYPTION_KEY` | shared          | 64-char hex string for AES-256-GCM token encryption |

---

## Package Dependencies

```
@huginn/shared     ← no internal deps (leaf package)
@huginn/web        ← depends on @huginn/shared
@huginn/agent      ← depends on @huginn/shared
```

Both apps import schemas, types, and the DB factory from `@huginn/shared`. They never import from each other.
