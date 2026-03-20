# Huginn — Workspace Instructions

Personal AI system: one account → one personality → one memory → any channel.
Phase 1 POC. The team is **new to this tech stack** — prefer explicit examples over assumptions.

## Architecture

Turborepo monorepo with pnpm workspaces:

| Package           | Purpose                                                  | Port |
| ----------------- | -------------------------------------------------------- | ---- |
| `apps/web`        | TanStack Start (React 19 + Vite 8 + Nitro) web dashboard | 3000 |
| `apps/agent`      | Mastra agent service + Telegram bot (grammY)             | 4111 |
| `packages/shared` | Drizzle schemas, DB factory, services, TypeScript interfaces | —    |

### Two-Database Design

| Database   | Stores                                                                   | Accessed By                  |
| ---------- | ------------------------------------------------------------------------ | ---------------------------- |
| PostgreSQL | Accounts, channel links, personality files, linking codes, auth sessions | `web` + `agent`              |
| libSQL     | Threads, messages, working memory (Mastra-managed)                       | `agent` only via Mastra APIs |

**Bridge**: `accounts.id` (UUID) = Mastra `resourceId`. Never query Mastra's libSQL directly.

## Build & Dev

```bash
pnpm install                          # Install all workspace deps
docker compose up -d                  # Local PostgreSQL
pnpm db:push                          # Push Drizzle schema to Postgres
pnpm dev                              # All apps (Turborepo, persistent)
pnpm --filter @huginn/web dev         # Web only (vite dev, port 3000)
pnpm --filter @huginn/agent dev       # Agent only (tsx watch)
pnpm build                            # Build all
pnpm lint                             # ESLint all
pnpm db:generate                      # Generate Drizzle migrations
pnpm db:studio                        # Drizzle Studio GUI
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
- `user`, `session`, `account`, `verification` — Better Auth tables (schema in `auth.ts`)

### Service Implementations — packages/shared/src/services/

- `createAccountService(db)` — implements `AccountService` (all 9 methods fully implemented)
- `ensureAccount(db, { id, ... })` — upsert account with specific ID (for tests/seeding)
- `deleteAccount(db, id)` — cascading delete of an account and related data
- `getGoogleSubForBaUser(db, baUserId)` — looks up Google `sub` from Better Auth's `account` table
- `createPersonalityStore(db)` — implements `PersonalityStore` (load, save, exists, history)
- `seedNewAccount(db, accountId)` — seeds default SOUL + IDENTITY personality files
- `verifyAndConsumeLinkingCode(db, code)` — atomic verify + consume (race-condition safe)

### Interface Contracts — packages/shared/src/types/

- `AccountService` — 9 methods for accounts, channel links, linking codes
- `PersonalityStore` — `load()` (latest version), `save()` (insert new), `exists()`, `history()`
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
- Existing extracted components: `nav-bar.tsx`, `channels-page.tsx`, `edit-identity-page.tsx`
- Dark theme with semantic color tokens: `--color-page`, `--color-surface`, `--color-accent`, `--color-text-heading`, etc.
- NavBar component in `nav-bar.tsx` — shared navigation across authenticated routes, rendered in `_authenticated.tsx` layout

### Mastra Patterns (apps/agent)

- Agent HTTP server uses Hono + `@mastra/hono` on port 4111
- `LibSQLStore` **requires** `id` parameter: `new LibSQLStore({ id: "huginn-storage", url: ... })`
- Mastra singleton in `src/mastra/index.ts`, imported by entry point
- Agent definition in `src/mastra/agents/huginn.ts` — dynamic instructions via `requestContext`
- `requestContext` (NOT `runtimeContext`) carries `account-id` and `personality-store` per request
- `@mastra/memory` installed separately from `@mastra/core`; memory inherits storage from Mastra instance
- Thread ID convention for Telegram: `tg-chat-${chatId}`, for web: `chat-${accountId}-${timestamp}`
- Working memory scoped to `resourceId` (= `accounts.id`), persists across threads

### Telegram Bot Patterns (apps/agent)

- grammY bot in `src/telegram/bot.ts` — factory pattern, opt-in via `TELEGRAM_BOT_TOKEN`
- Bot username auto-discovered via `bot.init()` (`getMe` API) — no env var needed
- `GET /telegram/info` endpoint exposes `{ username }` to the web app for deep link URLs
- Handlers in `src/telegram/handlers.ts`: `/start` (deep link payload), `/link CODE` (fallback), message routing
- Deep link format: `https://t.me/BOT_USERNAME?start=LINK-CODE` — Telegram sends `/start LINK-CODE` to bot
- `verifyAndConsumeLinkingCode` used for atomic race-condition-safe linking
- Long polling mode with graceful shutdown on SIGINT/SIGTERM

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
- [apps/agent/src/telegram/handlers.ts](apps/agent/src/telegram/handlers.ts) — /start, /link, message routing handlers
- [apps/agent/src/mastra/agents/huginn.ts](apps/agent/src/mastra/agents/huginn.ts) — Agent definition with dynamic personality
- [apps/agent/src/identity/instructions.ts](apps/agent/src/identity/instructions.ts) — buildInstructions() personality injection
- [apps/agent/src/mastra/index.ts](apps/agent/src/mastra/index.ts) — Mastra instance config
- [packages/shared/src/services/account-service.ts](packages/shared/src/services/account-service.ts) — AccountService implementation (all methods)

## Milestones

Current: **M3 complete** (Telegram bot, channel linking, deep link UX). Next milestones from spec:

- ~~**M0**: Scaffolding, schemas, both apps boot~~ ✅
- ~~**M1**: Better Auth + Google OAuth, account creation, session middleware~~ ✅
- ~~**M2**: Personality files CRUD (web UI), dynamic instructions, streaming chat~~ ✅
- ~~**M3**: Telegram bot (grammY), channel linking, deep link + QR code UX~~ ✅
- **M4**: Working memory, conversation quality, full smoke test

See `sovereign-architecture-spec.md` § Build Milestones for acceptance criteria.

## Environment Variables

| Variable               | Required                         | Used By            |
| ---------------------- | -------------------------------- | ------------------ |
| `APP_DATABASE_URL`     | Yes                              | shared, web, agent |
| `MASTRA_DATABASE_URL`  | No (defaults `file:./mastra.db`) | agent              |
| `OPENROUTER_API_KEY`   | M2+                              | agent              |
| `TELEGRAM_BOT_TOKEN`   | M3+                              | agent              |
| `GOOGLE_CLIENT_ID`     | M1+                              | web                |
| `GOOGLE_CLIENT_SECRET` | M1+                              | web                |
| `BETTER_AUTH_SECRET`   | M1+                              | web                |
| `APP_URL`              | M1+                              | web                |
