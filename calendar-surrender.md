# Calendar Integration — Implementation Summary

## What Was Built

Full Google Calendar integration across all layers of the Huginn system: schema, OAuth flow, web UI, agent context injection, and an on-demand Mastra tool.

---

## Phase 1 — Schema & Providers (`packages/shared`)

| File | Purpose |
|------|---------|
| `src/services/crypto.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens using `CALENDAR_ENCRYPTION_KEY` |
| `src/schema/calendar-connections.ts` | Drizzle table: `calendar_connections` (UUID PK, FK to accounts, encrypted tokens, unique on account+provider+email) |
| `src/types/calendar.ts` | All TypeScript interfaces: `CalendarProvider`, `CalendarService`, `CalendarConnectionService`, `CalendarEvent`, `CalendarConnection`, `CalendarConnectionInfo` |
| `src/services/calendar-connection-service.ts` | CRUD service — encrypts tokens on write, decrypts on read. Methods: get, create, update tokens, toggle, rename, delete |
| `src/services/google-calendar-provider.ts` | Google Calendar API v3 HTTP client (no googleapis SDK). Implements `CalendarProvider` with `getEvents()` + `refreshTokens()` |
| `src/services/calendar-service.ts` | Aggregation layer — fans out to providers, auto-refreshes tokens, deduplicates, sorts. `formatForContext()` produces human-readable schedule block |

Barrel exports updated in `schema/index.ts`, `types/index.ts`, `services/index.ts`.

---

## Phase 2 — OAuth Flow (`apps/web`)

| File | Purpose |
|------|---------|
| `src/lib/server-fns.ts` | 5 new server functions + HMAC helpers |

### Server Functions Added
- **`initiateCalendarOAuth`** — builds Google consent URL with `calendar.readonly` + `userinfo.email` scopes, HMAC-signed state (10min expiry)
- **`getCalendarConnections`** — returns token-stripped connection list for authenticated user
- **`toggleCalendarConnection`** — pause/resume a connection (with ownership check)
- **`updateCalendarDisplayName`** — rename a connection (with ownership check)
- **`deleteCalendarConnection`** — remove a connection (with ownership check)

### HMAC State Helpers
- `signState(payload)` — HMAC-SHA256 with `BETTER_AUTH_SECRET` (dynamic import of `node:crypto` to avoid Vite browser bundling)
- `verifyState(state)` — validates signature + 10min expiry, returns `{ accountId }`

### OAuth Callback
- **`server/api/calendar/callback.ts`** — Nitro server route that:
  1. Validates CSRF state via `verifyState()`
  2. Exchanges authorization code for tokens at Google's token endpoint
  3. Fetches user email from Google userinfo API
  4. Stores encrypted connection via `CalendarConnectionService`
  5. Redirects to `/calendars?connected=true`

### Web UI
- **`src/components/calendars-page.tsx`** — Full page component with:
  - "Connect Google Calendar" button (+ disabled Outlook "Coming soon")
  - Connection cards with toggle (pause/resume), inline rename, and remove
  - Success toast on `?connected=true`
- **`src/routes/_authenticated/calendars.tsx`** — Route stub with loader + search param validation
- **`src/components/nav-bar.tsx`** — Added "Calendars" to navigation links

---

## Phase 3 — Agent Context Injection (`apps/agent`)

| File | Purpose |
|------|---------|
| `src/calendar-cache.ts` | In-memory cache with 5min TTL — avoids hitting Google on every message |
| `src/identity/instructions.ts` | `buildInstructions()` now accepts optional `CalendarService`, fetches today's events (cache-first), injects formatted schedule into system prompt |
| `src/mastra/agents/huginn.ts` | Reads `calendar-service` from `requestContext`, passes to `buildInstructions()` |
| `src/index.ts` | Instantiates `calendarService`, sets it on `requestContext` for `/chat`, `/chat/stream`, and Telegram handlers |
| `src/telegram/handlers.ts` | Accepts + forwards `calendarService` in handler deps |

### BASE_INSTRUCTIONS Updated
Added `## Calendar` section telling the agent about injected calendar context and the `get-calendar` tool.

---

## Phase 4 — Mastra Tool (`apps/agent`)

| File | Purpose |
|------|---------|
| `src/mastra/tools/get-calendar.ts` | `createTool` with zod input schema (`startDate`, `endDate` as ISO strings). Reads `calendar-service` + `account-id` from `requestContext`. Returns structured events + formatted summary. |

Registered on the huginn agent via `tools: { "get-calendar": getCalendarTool }`.

---

## Environment Variables Added

| Variable | Format | Purpose |
|----------|--------|---------|
| `CALENDAR_ENCRYPTION_KEY` | 64-char hex (32 bytes) | AES-256-GCM key for encrypting OAuth tokens at rest |

Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Google Cloud Console Setup Required

1. **OAuth consent screen** → Add `calendar.readonly` to scopes
2. **OAuth consent screen** → Add test users (app is in "testing" mode)
3. **Credentials** → Add `http://localhost:3000/api/calendar/callback` to Authorized redirect URIs

---

## Bugs Fixed During Implementation

1. **`node:crypto` browser externalization** — Top-level `import { createHmac } from "node:crypto"` in `server-fns.ts` was bundled for the browser by Vite. Fixed by moving to a dynamic `await import("node:crypto")` inside the server-only `signState()` helper, and propagating async to `verifyState()` + callers.

---

## Files Created (11)
- `packages/shared/src/services/crypto.ts`
- `packages/shared/src/schema/calendar-connections.ts`
- `packages/shared/src/types/calendar.ts`
- `packages/shared/src/services/calendar-connection-service.ts`
- `packages/shared/src/services/google-calendar-provider.ts`
- `packages/shared/src/services/calendar-service.ts`
- `apps/web/server/api/calendar/callback.ts`
- `apps/web/src/components/calendars-page.tsx`
- `apps/web/src/routes/_authenticated/calendars.tsx`
- `apps/agent/src/calendar-cache.ts`
- `apps/agent/src/mastra/tools/get-calendar.ts`

## Files Modified (9)
- `packages/shared/src/schema/index.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/services/index.ts`
- `apps/web/src/lib/server-fns.ts`
- `apps/web/src/components/nav-bar.tsx`
- `apps/agent/src/identity/instructions.ts`
- `apps/agent/src/mastra/agents/huginn.ts`
- `apps/agent/src/index.ts`
- `apps/agent/src/telegram/handlers.ts`
- `AGENTS.md`
