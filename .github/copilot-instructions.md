# Huginn — Workspace Instructions

Personal AI system: one account → one personality → one memory → any channel.
Phase 1 POC. The team is **new to this tech stack** — prefer explicit examples over assumptions.

## Architecture

Turborepo monorepo with pnpm workspaces:

| Package           | Purpose                                                  | Port |
| ----------------- | -------------------------------------------------------- | ---- |
| `apps/web`        | TanStack Start (React 19 + Vite 8 + Nitro) web dashboard | 3000 |
| `apps/agent`      | Mastra agent service + Telegram bot (grammY)             | —    |
| `packages/shared` | Drizzle schemas, DB factory, TypeScript interfaces       | —    |

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

### Interface Contracts — packages/shared/src/types/

- `AccountService` — 9 methods for accounts, channel links, linking codes
- `PersonalityStore` — `load()` (latest version), `save()` (insert new), `exists()`, `history()`
- Return `null` for not-found, don't throw

### TanStack Start Patterns (apps/web)

- Uses `@tanstack/react-start` (NOT the old `@tanstack/start` package)
- Vite config: `tanstackStart()` + `viteReact()` + `nitro()` plugins
- Root layout: `shellComponent` renders HTML document, `component` renders route content
- `HeadContent` and `Scripts` from `@tanstack/react-router` (NOT `Meta` from old package)
- Route files export `Route = createFileRoute(...)` — file-based routing
- `routeTree.gen.ts` is auto-generated — never edit it

### Mastra Patterns (apps/agent)

- `LibSQLStore` **requires** `id` parameter: `new LibSQLStore({ id: "huginn-storage", url: ... })`
- Mastra singleton in `src/mastra/index.ts`, imported by entry point
- Thread ID convention for Telegram: `tg-chat-${chatId}`
- Working memory scoped to `resourceId` (= `accounts.id`), persists across threads

## Gotchas

- **Nitro version pinned**: `nitro@3.0.260311-beta` — must match for TanStack Start compatibility. Don't upgrade without testing.
- **drizzle.config.ts loads `.env` from monorepo root**: Uses `resolve(process.cwd(), "../../.env")` because drizzle-kit bundles to CJS where `import.meta.dirname` is undefined.
- **Better Auth `user` ≠ Huginn `accounts`**: Two separate tables linked by `googleSub`. Always query our `accounts` table, not Better Auth's.
- **Telegram user IDs are numbers, stored as text**: Convert with `String(telegramUserId)` before storing.
- **`pnpm dev` blocks the shell** (`persistent: true` in turbo.json). Use separate terminals or filter to individual apps.
- `*.gen.ts` files are gitignored. If routing breaks, restart the dev server.

## Key Files

- [sovereign-architecture-spec.md](sovereign-architecture-spec.md) — authoritative specification (all decisions, data shapes, milestones)
- [README.md](README.md) — project overview, setup instructions, commands
- [packages/shared/drizzle.config.ts](packages/shared/drizzle.config.ts) — Drizzle Kit config with .env workaround
- [apps/web/vite.config.ts](apps/web/vite.config.ts) — TanStack Start + Nitro + Vite setup
- [apps/agent/src/mastra/index.ts](apps/agent/src/mastra/index.ts) — Mastra instance config

## Milestones

Current: **M0 complete** (scaffolding, schemas, both apps boot). Next milestones from spec:

- **M1**: Better Auth + Google OAuth, account creation, session middleware
- **M2**: Personality files CRUD (web UI), seeding flow, dynamic instructions
- **M3**: Telegram bot (grammY), channel linking, message handling
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
