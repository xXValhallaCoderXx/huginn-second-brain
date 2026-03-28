# Huginn — Workspace Instructions

Personal AI system: one account → one personality → one memory → any channel.
Phase 1 POC. The team is **new to this tech stack** — prefer explicit examples over assumptions.

## Architecture

Turborepo monorepo with pnpm workspaces:

| Package           | Purpose                                                  | Port |
| ----------------- | -------------------------------------------------------- | ---- |
| `apps/web`          | TanStack Start (React 19 + Vite 8 + Nitro) web dashboard | 3000 |
| `apps/agent`        | Mastra agent service + Telegram bot (grammY)             | 4111 |
| `apps/public-docs`  | Fumadocs (Next.js) public documentation site             | 5000 |
| `apps/private-docs` | Fumadocs (Next.js) internal/private documentation site   | 5001 |
| `packages/shared`   | Drizzle schemas, DB factory, services, TypeScript interfaces | —    |

### Single-Database Design (Schema Isolation)

| Schema   | Stores                                                                   | Managed By                   |
| -------- | ------------------------------------------------------------------------ | ---------------------------- |
| `public` | Accounts, channel links, personality files, linking codes, auth sessions | Drizzle migrations (app)     |
| `mastra` | Threads, messages, working memory, observations, reflections             | Mastra auto-migration (`PostgresStore.init()`) |
| `public` | Vector embeddings for semantic recall (`PgVector` auto-managed tables)  | PgVector auto-migration                        |

**Bridge**: `accounts.id` (UUID) = Mastra `resourceId`. App code never queries `mastra.*` tables directly. Mastra never touches `public.*` tables.

## Build & Dev

```bash
pnpm install                          # Install all workspace deps
docker compose up -d                  # Local PostgreSQL
pnpm db:push                          # Push Drizzle schema to Postgres
pnpm dev                              # All apps (Turborepo, persistent)
pnpm --filter @huginn/web dev         # Web only (vite dev, port 3000)
pnpm --filter @huginn/agent dev       # Agent only (tsx watch)
pnpm dev:public-docs                  # Public docs only (Next.js, port 5000)
pnpm dev:private-docs                 # Private docs only (Next.js, port 5001)
pnpm build                            # Build all
pnpm lint                             # ESLint all
pnpm db:generate                      # Generate Drizzle migrations
pnpm db:studio                        # Drizzle Studio GUI
pnpm --filter @huginn/agent dev:studio # Mastra Studio (port 3001, connects to agent API on 4111)
```

## Code Conventions

### Imports

- Always use workspace package names: `import { createDb } from "@huginn/shared"`
- Never use relative paths across package boundaries
- Barrel exports from `packages/shared/src/index.ts`

### Naming

- DB tables/columns: `snake_case` (`channel_links`, `account_id`)
- TypeScript types/interfaces: `PascalCase` (`Account`, `ChannelLink`)
- Functions: `camelCase` (`createDb`, `buildInstructions`)
- App layer uses `accountId`; Mastra layer uses `resourceId` (same UUID)

### Database Schemas — packages/shared/src/schema/

- `accounts` — UUID PK, `googleSub` links to Better Auth, `email`, `displayName`
- `channel_links` — FK to accounts, `provider` + `providerUserId` with two unique composite indexes
- `personality_files` — append-only versioning (INSERT with incremented `version`, never UPDATE)
- `linking_codes` — one-time codes with 10min expiry, `used` boolean flag
- `calendar_connections` — OAuth tokens (AES-256-GCM encrypted), FK to accounts, unique on (accountId, provider, providerEmail)
- `user`, `session`, `account`, `verification` — Better Auth tables (schema in `auth.ts`)

### Service Implementations — packages/shared/src/services/

- `createAccountService(db)` — implements `AccountService` (all 9 methods fully implemented)
- `ensureAccount(db, { id, ... })` — upsert account with specific ID (for tests/seeding)
- `deleteAccount(db, id)` — cascading delete of an account and related data
- `getGoogleSubForBaUser(db, baUserId)` — looks up Google `sub` from Better Auth's `account` table
- `createPersonalityStore(db)` — implements `PersonalityStore` (load, save, exists, history)
- `seedNewAccount(db, accountId)` — seeds default SOUL + IDENTITY personality files
- `verifyAndConsumeLinkingCode(db, code)` — atomic verify + consume (race-condition safe)
- `createCalendarConnectionService(db)` — CRUD for calendar_connections (encrypts tokens at rest)
- `createCalendarService(db)` — aggregates events across providers, auto-refreshes tokens, deduplicates
- `googleCalendarProvider` — Google Calendar API v3 HTTP client (no googleapis SDK)
- `encryptToken(plaintext)` / `decryptToken(encrypted)` — AES-256-GCM token encryption

### Interface Contracts — packages/shared/src/types/

- `AccountService` — 9 methods for accounts, channel links, linking codes
- `PersonalityStore` — `load()` (latest version), `save()` (insert new), `exists()`, `history()`
- `CalendarService` — `getEvents(accountId, range)`, `formatForContext(events)` — aggregation + context formatting
- `CalendarConnectionService` — CRUD for encrypted calendar OAuth connections
- `CalendarProvider` — plugin interface (getEvents, refreshTokens) for each calendar provider
- Return `null` for not-found, don't throw

### TanStack Start Patterns (apps/web)

- Uses `@tanstack/react-start` (NOT the old `@tanstack/start` package)
- Vite config plugins (order matters): `tailwindcss()` + `tanstackStart()` + `viteReact()` + `nitro({ serverDir: true })`
- Root layout: `shellComponent` renders HTML document, `component` renders route content
- `HeadContent` and `Scripts` from `@tanstack/react-router` (NOT `Meta` from old package)
- Route files export `Route = createFileRoute(...)` — file-based routing
- `routeTree.gen.ts` is auto-generated — never edit it
- Server functions use `.inputValidator()` (NOT `.validator()`)
- `getRequestHeaders()` from `@tanstack/react-start/server` (NOT `getWebRequest`)

### Better Auth Patterns (apps/web)

- Server config: `apps/web/src/lib/auth.ts` — `betterAuth()` with Drizzle adapter + Google OAuth
- Client config: `apps/web/src/lib/auth-client.ts` — `createAuthClient()` with `useSession`, `signIn`, `signOut`
- Drizzle adapter **requires** `schema` option: `{ user, session, account: authAccount, verification }`
- API routes served via **Nitro server route** at `apps/web/server/api/auth/[...].ts` (NOT TanStack Router routes)
- Session retrieval in server functions uses `getRequestHeaders()` passed to `auth.api.getSession()`
- Account resolution: BA session → `getGoogleSubForBaUser()` → find/create Huginn `accounts` row → seed personality files
- `resolveAuthenticatedAccount()` helper in `server-fns.ts` — resolves session → account, throws if unauthenticated

### Web UI Patterns (apps/web)

- **Tailwind CSS v4** with `@theme` directive in `apps/web/src/styles/globals.css` — defines design tokens (colors, shadows, radii)
- Global CSS imported in `__root.tsx` via `import "../styles/globals.css"`
- **Component extraction pattern**: Full page components live in `apps/web/src/components/` (safe from route generator). Route files are minimal stubs that import from components.
- Existing extracted components: `nav-bar.tsx`, `channels-page.tsx`, `edit-identity-page.tsx`, `calendars-page.tsx`
- Dark theme with semantic color tokens: `--color-page`, `--color-surface`, `--color-accent`, `--color-text-heading`, etc.
- NavBar component in `nav-bar.tsx` — shared navigation across authenticated routes, rendered in `_authenticated.tsx` layout

### Mastra Patterns (apps/agent)

- Agent HTTP server uses Hono + `@mastra/hono` on port 4111
- `PostgresStore` from `@mastra/pg` — shared storage in `src/mastra/storage.ts`, used by both Mastra instance and agent Memory
- `PostgresStore` uses `schemaName: "mastra"` to isolate Mastra tables from app tables in the same PostgreSQL database
- Mastra singleton in `src/mastra/index.ts`, imported by entry point
- Agent definition in `src/mastra/agents/huginn.ts` — dynamic instructions via `requestContext`
- `requestContext` (NOT `runtimeContext`) carries `account-id` and `personality-store` per request
- `@mastra/memory` installed separately from `@mastra/core`; Memory uses explicit `storage` from `storage.ts`
- **Semantic Recall** enabled — RAG-based vector search across past conversations using `PgVector` + `ModelRouterEmbeddingModel` (`openrouter/openai/text-embedding-3-small`)
- Semantic recall config: `topK: 3`, `messageRange: 2`, `scope: 'resource'` (cross-thread search)
- `PgVector` reuses the same PostgreSQL database (`DATABASE_URL`); auto-creates vector tables in `public` schema
- **Observational Memory** enabled with `openrouter/google/gemini-2.5-flash`, thread scope, default thresholds (30k observe, 40k reflect)
- Working memory scoped to `resourceId` (= `accounts.id`), persists across threads
- Observational Memory scoped to thread — deep recall within a conversation
- Thread ID convention for Telegram: `tg-chat-${chatId}`, for web: `chat-${accountId}-${timestamp}`
- `MastraServer` from `@mastra/hono` registers Mastra API routes at `/api/*` via `server.init()`
- CORS enabled on `/api/*` (plus `/chat/*`, `/telegram/*`) for Studio (port 3001) and web app (port 3000)
- `instructions` callback guards against missing `requestContext` — returns `BASE_INSTRUCTIONS` as fallback when Studio introspects the agent
- **Observability**: `@mastra/observability` with `DefaultExporter` — storage-backed trace collection. Configured as `new Observability({ configs: { default: { serviceName: "huginn", exporters: [new DefaultExporter()] } } })`. Traces visible in Mastra Studio Observability tab.
- **Tools registered at Mastra level**: `tools: { "get-calendar": getCalendarTool }` in the Mastra constructor — required for Studio's Tools tab to show them
- **Mastra Studio**: Use `mastra studio --server-port 4111 --port 3001` for server-adapter projects. Do NOT use `mastra dev` — it creates a separate isolated server and ignores the Hono adapter setup

### Calendar Integration Patterns

- **Separate OAuth from auth**: Calendar OAuth uses same `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` but requests `calendar.readonly` scope separately from Better Auth sign-in
- **Encrypted tokens**: All OAuth tokens stored with AES-256-GCM encryption (`CALENDAR_ENCRYPTION_KEY` env var). Encryption/decryption happens in `CalendarConnectionService`, transparent to callers
- **HMAC-signed state**: OAuth state parameter is HMAC-SHA256 signed with `BETTER_AUTH_SECRET`, 10min expiry, prevents CSRF
- **OAuth callback**: Nitro server route at `/api/calendar/callback` — exchanges code, fetches userinfo email, stores connection
- **Context injection**: `buildInstructions()` injects today's calendar into the agent system prompt (5min in-memory cache). Also injects current date (`Today is ${dateStr}.`) using `Intl.DateTimeFormat` for locale-aware formatting
- **On-demand tool**: `get-calendar` Mastra tool lets the agent query arbitrary date ranges when users ask about their schedule. Supports `period` parameter (`"today"`, `"tomorrow"`, `"this week"`, `"next week"`) with server-side date math via `resolveRelativePeriod()` — avoids LLM date hallucination. Falls back to explicit `startDate`/`endDate` params.
- **Provider plugin**: `CalendarProvider` interface allows future providers (Outlook, etc.) without changing service layer
- **Calendar filtering**: Google Calendar provider only includes calendars where user has `accessRole` of `"owner"` or `"writer"` (excludes subscribed/read-only calendars). Also filters out events where the authenticated user (`self: true`) has `responseStatus: "declined"`.
- **OAuth callback**: Nitro server route at `/api/calendar/callback` — uses `redirect(url, 302)` (h3 v2 API)

### Telegram Bot Patterns (apps/agent)

- grammY bot in `src/telegram/bot.ts` — factory pattern, opt-in via `TELEGRAM_BOT_TOKEN`
- Bot username auto-discovered via `bot.init()` (`getMe` API) — no env var needed
- `GET /telegram/info` endpoint exposes `{ username }` to the web app for deep link URLs
- Handlers in `src/telegram/handlers.ts`: `/start` (deep link payload), `/link CODE` (fallback), `/brief` (on-demand daily briefing), message routing
- Deep link format: `https://t.me/BOT_USERNAME?start=LINK-CODE` — Telegram sends `/start LINK-CODE` to bot
- `verifyAndConsumeLinkingCode` used for atomic race-condition-safe linking
- Long polling mode with graceful shutdown on SIGINT/SIGTERM

### Daily Briefing Workflow (apps/agent)

- **On-demand** via `/brief` Telegram command — user types `/brief` and gets a personalized morning briefing
- **Mastra Workflow** pattern: single `daily-briefing` workflow processes one account: fetch-calendar → query-memory → generate-briefing → send-telegram
- **Triggered from handler**: `/brief` command in `handlers.ts` resolves the account, creates `RequestContext`, and runs the workflow
- **Dependency injection** via `RequestContext` — handler injects `db`, `calendar-service`, `personality-store`, `account-service` before `run.start()`
- **Memory query**: Uses `memory.recall()` with `vectorSearchString` per event title, `scope: 'resource'` for cross-thread search, synthetic `threadId` (required param)
- **Personality injection**: `generate-briefing` step creates per-account `RequestContext` with `account-id` + `personality-store` + `calendar-service` so `buildInstructions()` loads SOUL + IDENTITY
- **Telegram delivery**: `send-telegram` step uses `getBot()` singleton import, retries without Markdown on parse errors
- **Dry run mode**: `DAILY_BRIEF_DRY_RUN=true` logs briefing to console instead of sending to Telegram
- **Workflow visible in Mastra Studio** Workflows tab — runs are inspectable per step

### Fumadocs Patterns (apps/public-docs, apps/private-docs)

- **Next.js 16** with Fumadocs UI + Fumadocs MDX — standalone docs apps, no dependency on `@huginn/shared`
- **Fumadocs MDX** collection config in `source.config.ts` — defines `docs` collection from `content/docs/`
- **Source loader** in `lib/source.ts` — `loader({ baseUrl: '/docs', source: docs.toFumadocsSource() })`
- **Collections import**: `import { docs } from 'collections'` (maps to `.source/index.ts` via tsconfig paths). Note: fumadocs-mdx v12 generates a single `index.ts`, not separate `server.ts`/`browser.ts`/`dynamic.ts`
- **`.source/` directory**: Auto-generated by fumadocs-mdx at dev/build time — gitignored, never edit
- **Layout hierarchy**: `app/layout.tsx` (RootProvider) → `app/docs/layout.tsx` (DocsLayout with sidebar tree) → `app/docs/[[...slug]]/page.tsx` (page renderer)
- **MDX components**: `components/mdx.tsx` exports `getMDXComponents()` — extend with custom components here
- **Search**: Orama-powered search via `app/api/search/route.ts`, uses `createFromSource()`
- **Navigation config**: `content/docs/meta.json` in each folder controls sidebar ordering + separators
- **Shared layout options**: `lib/layout.shared.tsx` — `baseOptions()` returns nav title and shared config
- **Content lives in**: `content/docs/` — file-system-based routing, MDX files with YAML frontmatter
- **Tailwind CSS v4** via PostCSS (not Vite plugin) — imports `fumadocs-ui/css/neutral.css` + `fumadocs-ui/css/preset.css`
- **Public docs** (port 5000): Customer-facing documentation — nav title "Huginn Docs"
- **Private docs** (port 5001): Internal team documentation — nav title "Huginn Internal Docs"

## Gotchas

- **Nitro version pinned**: `nitro@3.0.260311-beta` — must match for TanStack Start compatibility. Don't upgrade without testing.
- **Server-side `.env` loading**: Nitro/h3 server code does NOT get Vite's env vars. Server modules (`auth.ts`, `db.ts`) use `dotenv` to load `.env` from the monorepo root via `config({ path: resolve(import.meta.dirname, "../../../../.env") })`.
- **drizzle.config.ts loads `.env` from monorepo root**: Uses `resolve(process.cwd(), "../../.env")` because drizzle-kit bundles to CJS where `import.meta.dirname` is undefined.
- **Better Auth `user` ≠ Huginn `accounts`**: Two separate tables linked by `googleSub`. Always query our `accounts` table, not Better Auth's.
- **Drizzle adapter schema required**: The `drizzleAdapter()` call must pass `schema: { user, session, account: authAccount, verification }` or Better Auth can't find its tables.
- **Keep drizzle-orm queries in `@huginn/shared`**: In pnpm monorepos, importing `drizzle-orm` operators (like `eq`) in apps causes duplicate instance type conflicts. All DB queries live in `packages/shared/src/services/`.
- **TanStack route generator clobbers new route files**: While the dev server is running, TanStack's file-based router will overwrite new route files with stubs. **Workaround**: Put full page components in `apps/web/src/components/` and keep route files as minimal stubs that import from those components.
- **Telegram user IDs are numbers, stored as text**: Convert with `String(telegramUserId)` before storing.
- **`pnpm dev` blocks the shell** (`persistent: true` in turbo.json). Use separate terminals or filter to individual apps.
- `*.gen.ts` files are gitignored. If routing breaks, restart the dev server.
- **`.mastra/` is gitignored**: Mastra build/output directory generated by `mastra dev`/`mastra studio`. Don't commit it.
- **Docker PostgreSQL requires pgvector**: Image is `pgvector/pgvector:pg16` (NOT `postgres:16-alpine`). Required for `PgVector` semantic recall. If you see `extension "vector" does not exist`, recreate the container with the correct image.
- **`zod@4` as direct dependency in `@huginn/agent`**: Mastra's internal modules mix `import from 'zod'` and `import from 'zod/v4'`. With `zod@3.25.x` (v4's v3 compat shim) those resolve to different APIs causing `_parse is not a function` crashes. Pin to `^4.3.6` so both imports resolve to the same v4 API.
- **Railway private networking for `db:push`**: `railway run pnpm db:push` injects `DATABASE_URL=postgres://...@postgres.railway.internal/...` which is only reachable inside Railway's network. DNS resolution fails (`ENOTFOUND`) from a local machine. **Fix**: use `DATABASE_PUBLIC_URL` from the Railway Postgres service variables instead: `DATABASE_URL="<public-url>" pnpm db:push`.
- **`APP_URL` is optional on Railway**: `apps/web/src/lib/auth.ts` and `server-fns.ts` derive the public URL from `RAILWAY_PUBLIC_DOMAIN` when `APP_URL` is not set. Only set `APP_URL` explicitly for custom domains or local overrides.
- **`DATABASE_URL` (not `APP_DATABASE_URL`)**: All services read `process.env.DATABASE_URL`. Railway auto-injects this from the linked Postgres plugin. For local dev, set `DATABASE_URL` in `.env`.
- **`.source/` is gitignored**: Generated by `fumadocs-mdx` at dev/build time. If docs pages break, delete `.source/` and `.next/` then restart the dev server.
- **`.next/` is gitignored**: Next.js build output for docs apps. Don't commit it.
- **Fumadocs `collections` import**: In `fumadocs-mdx@12`, the `.source/` directory generates `index.ts` (not `server.ts`). Use `import { docs } from 'collections'` (not `collections/server`). The tsconfig `paths` must include `"collections": ["./.source/index.ts"]`.
- **Docs apps use Next.js, not TanStack Start**: The docs apps (`public-docs`, `private-docs`) use Next.js 16 with Fumadocs, which is separate from the web app's TanStack Start stack. They have independent Tailwind CSS via PostCSS (not Vite plugin).

## Key Files

- [sovereign-architecture-spec.md](sovereign-architecture-spec.md) — authoritative specification (all decisions, data shapes, milestones)
- [README.md](README.md) — project overview, setup instructions, commands
- [packages/shared/drizzle.config.ts](packages/shared/drizzle.config.ts) — Drizzle Kit config with .env workaround
- [apps/web/vite.config.ts](apps/web/vite.config.ts) — TanStack Start + Tailwind + Nitro + Vite setup
- [apps/web/src/styles/globals.css](apps/web/src/styles/globals.css) — Tailwind CSS v4 theme tokens + global styles
- [apps/web/src/lib/auth.ts](apps/web/src/lib/auth.ts) — Better Auth server config (Drizzle adapter, Google OAuth)
- [apps/web/src/lib/server-fns.ts](apps/web/src/lib/server-fns.ts) — All server functions (personality CRUD, linking, channels)
- [apps/web/server/api/auth/\[...\].ts](apps/web/server/api/auth/[...].ts) — Nitro catch-all route for Better Auth API
- [apps/web/src/components/nav-bar.tsx](apps/web/src/components/nav-bar.tsx) — NavBar + MobileMenu shared navigation
- [apps/web/src/components/edit-identity-page.tsx](apps/web/src/components/edit-identity-page.tsx) — Personality editor (SOUL/IDENTITY) full page component
- [apps/web/src/components/channels-page.tsx](apps/web/src/components/channels-page.tsx) — Connected channels management page component
- [apps/agent/src/index.ts](apps/agent/src/index.ts) — Hono HTTP server (/chat, /chat/stream, /telegram/info)
- [apps/agent/src/telegram/bot.ts](apps/agent/src/telegram/bot.ts) — grammY bot factory with auto-discovered username
- [apps/agent/src/telegram/handlers.ts](apps/agent/src/telegram/handlers.ts) — /start, /link, /brief, message routing handlers
- [apps/agent/src/mastra/agents/huginn.ts](apps/agent/src/mastra/agents/huginn.ts) — Agent definition with dynamic personality
- [apps/agent/src/identity/instructions.ts](apps/agent/src/identity/instructions.ts) — buildInstructions() personality injection
- [apps/agent/src/mastra/storage.ts](apps/agent/src/mastra/storage.ts) — PostgresStore shared instance (mastra schema)
- [apps/agent/src/mastra/index.ts](apps/agent/src/mastra/index.ts) — Mastra instance config
- [apps/agent/src/mastra/tools/get-calendar.ts](apps/agent/src/mastra/tools/get-calendar.ts) — Calendar lookup tool for the agent
- [apps/agent/src/calendar-cache.ts](apps/agent/src/calendar-cache.ts) — In-memory 5min TTL cache for calendar events
- [apps/web/src/components/calendars-page.tsx](apps/web/src/components/calendars-page.tsx) — Calendar connections management page
- [apps/web/server/api/calendar/callback.ts](apps/web/server/api/calendar/callback.ts) — Google Calendar OAuth callback (Nitro route)
- [packages/shared/src/services/calendar-service.ts](packages/shared/src/services/calendar-service.ts) — CalendarService (event aggregation + context formatting)
- [packages/shared/src/services/calendar-connection-service.ts](packages/shared/src/services/calendar-connection-service.ts) — Calendar connection CRUD (encrypted tokens)
- [packages/shared/src/services/crypto.ts](packages/shared/src/services/crypto.ts) — AES-256-GCM encryption utilities
- [packages/shared/src/services/account-service.ts](packages/shared/src/services/account-service.ts) — AccountService implementation (all methods)
- [apps/agent/src/workflows/daily-briefing.ts](apps/agent/src/workflows/daily-briefing.ts) — Daily briefing Mastra workflow (4 steps: calendar → memory → generate → send)
- [apps/public-docs/source.config.ts](apps/public-docs/source.config.ts) — Fumadocs MDX collection config (public docs)
- [apps/public-docs/lib/source.ts](apps/public-docs/lib/source.ts) — Fumadocs source loader (public docs)
- [apps/public-docs/app/layout.tsx](apps/public-docs/app/layout.tsx) — Root layout with RootProvider (public docs)
- [apps/private-docs/source.config.ts](apps/private-docs/source.config.ts) — Fumadocs MDX collection config (private docs)
- [apps/private-docs/lib/source.ts](apps/private-docs/lib/source.ts) — Fumadocs source loader (private docs)
- [apps/private-docs/app/layout.tsx](apps/private-docs/app/layout.tsx) — Root layout with RootProvider (private docs)

## Milestones

Current: **Phase 2 complete** (Storage migration + Observational Memory). Next milestones from spec:

- ~~**M0**: Scaffolding, schemas, both apps boot~~ ✅
- ~~**M1**: Better Auth + Google OAuth, account creation, session middleware~~ ✅
- ~~**M2**: Personality files CRUD (web UI), dynamic instructions, streaming chat~~ ✅
- ~~**M3**: Telegram bot (grammY), channel linking, deep link + QR code UX~~ ✅
- ~~**M4**: Working memory, conversation quality, full smoke test~~ ✅
- ~~**Phase 2 — M2.0**: Storage migration (libSQL → PostgreSQL, `mastra` schema)~~ ✅
- ~~**Phase 2 — M2.1**: Observational Memory (thread-scoped, Gemini 2.5 Flash)~~ ✅
- ~~**Calendar Integration**: Google Calendar OAuth, encrypted token storage, context injection, Mastra tool~~ ✅
- ~~**Daily Briefing**: On-demand `/brief` command, calendar + semantic memory + LLM generation + Telegram delivery~~ ✅
- **Phase 3**: Personality refinement workflow (OM → SOUL.md/IDENTITY.md evolution)

## Environment Variables

| Variable                  | Required                          | Used By            |
| ------------------------- | --------------------------------- | ------------------ |
| `DATABASE_URL`            | Yes                               | shared, web, agent |
| `OPENROUTER_API_KEY`      | M2+                               | agent              |
| `TELEGRAM_BOT_TOKEN`      | M3+                               | agent              |
| `GOOGLE_CLIENT_ID`        | M1+                               | web                |
| `GOOGLE_CLIENT_SECRET`    | M1+                               | web                |
| `BETTER_AUTH_SECRET`      | M1+                               | web                |
| `AGENT_URL`               | M2+ (web → agent)                 | web                |
| `APP_URL`                 | No — auto-derived on Railway       | web                |
| `CALENDAR_ENCRYPTION_KEY` | Calendar feature                  | shared (crypto)    |
| `DAILY_BRIEF_DRY_RUN`     | No (default: `false`)             | agent              |

`CALENDAR_ENCRYPTION_KEY` must be a 64-character hex string (32 bytes). Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

`APP_URL` is derived automatically from `RAILWAY_PUBLIC_DOMAIN` on Railway. Only set explicitly for custom domains or local overrides.
