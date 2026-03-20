# Huginn Identity Layer — Architecture Specification v1.0

**Status**: Approved — ready to build  
**Phase**: 1 (POC)  
**Date**: 2026-03-20

---

## 1. Purpose

This document is the single source of truth for building the Huginn Identity Layer Phase 1 POC. It captures every architectural decision, interface contract, data shape, and wiring detail needed to go from zero to a deployed, working system.

**What this is**: A build specification. Everything here should be directly implementable.  
**What this is not**: A vision document. The PRD (v2) covers the "why." This covers the "what, exactly."

---

## 2. System Overview

Huginn is a self-hosted personal AI system where identity is owned by the application, not by any channel. A stable account ID (UUID) is the single key for personality, memory, and conversation history. Channels (starting with Telegram) are linked interfaces — they resolve to the account, they don't define it.

### 2.1 Core Thesis Being Validated

> One account → one personality → one memory → accessible from any linked channel → fully isolated between users.

The POC exists to prove this architecture works end-to-end. Every decision in this spec serves that validation.

### 2.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE                           │
│                     Docker Compose on Railway                   │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │   apps/web            │  │   apps/agent          │            │
│  │   TanStack Start      │  │   Mastra + grammY     │            │
│  │                        │  │                        │            │
│  │   - Google OAuth       │  │   - Huginn Agent    │            │
│  │     (Better Auth)      │  │   - Telegram Handler   │            │
│  │   - Dashboard          │  │   - PersonalityStore   │            │
│  │   - Linking Flow       │  │   - Account Resolution │            │
│  │                        │  │                        │            │
│  └───────────┬────────────┘  └───────────┬────────────┘            │
│              │                           │                         │
│              │     ┌─────────────────┐   │    ┌──────────────┐    │
│              └────►│  PostgreSQL      │◄──┘    │  libSQL      │    │
│                    │  (Railway)       │        │  (Mastra     │    │
│                    │                  │        │   internals) │    │
│                    │  - accounts      │        │              │    │
│                    │  - channel_links │        │  - threads   │    │
│                    │  - personality   │        │  - messages  │    │
│                    │    _files        │        │  - working   │    │
│                    │  - linking_codes │        │    memory    │    │
│                    │  - better_auth   │        │              │    │
│                    │    tables        │        └──────────────┘    │
│                    └─────────────────┘                             │
│                                                                    │
│  ┌────────────────────────────────────────┐                       │
│  │   packages/shared                       │                       │
│  │   - Drizzle schema + migrations         │                       │
│  │   - Shared TypeScript types             │                       │
│  │   - Database connection factory         │                       │
│  └────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Architectural Principle

**Two databases, strict boundary:**

| Database   | Owns                                                                     | Accessed By                | Purpose          |
| ---------- | ------------------------------------------------------------------------ | -------------------------- | ---------------- |
| PostgreSQL | Accounts, channel links, personality files, auth sessions, linking codes | `apps/web` + `apps/agent`  | App-level data   |
| libSQL     | Threads, messages, working memory                                        | `apps/agent` (Mastra only) | Mastra internals |

The bridge between them is a single value: **`account.id`** (UUID). In the app database, this is the primary key on `accounts`. In Mastra, this same value is passed as `resourceId`. We never query Mastra's libSQL directly — we use Mastra's APIs.

---

## 3. Tech Stack

| Layer               | Choice                 | Version / Notes                                                   |
| ------------------- | ---------------------- | ----------------------------------------------------------------- |
| **Monorepo**        | Turborepo              | pnpm workspaces                                                   |
| **Web framework**   | TanStack Start         | Release Candidate (pre-1.0, API stable)                           |
| **Auth**            | Better Auth            | Google OAuth social provider, `tanstackStartCookies` plugin       |
| **App database**    | PostgreSQL             | Railway-managed instance                                          |
| **ORM**             | Drizzle                | Type-safe queries, migrations, Better Auth adapter                |
| **Agent framework** | Mastra                 | TypeScript, dynamic instructions, working memory                  |
| **Agent memory**    | Mastra Memory + libSQL | Working memory (resource-scoped), message history (thread-scoped) |
| **LLM routing**     | OpenRouter             | `anthropic/claude-sonnet-4` via OpenRouter                        |
| **Telegram**        | grammY                 | Bot API framework                                                 |
| **Runtime**         | Node.js 22+            | Both services                                                     |
| **Infrastructure**  | Docker Compose         | Railway VPS deployment                                            |

### 3.1 Why These Choices

**TanStack Start over Next.js**: Lighter weight, Vite-based, no Vercel coupling. Our web app is ~3 pages — we don't need Next.js's complexity. Risk is pre-1.0 status, but API is declared stable and our surface area is small. Reversible: the web app is behind interfaces and can be swapped.

**Better Auth over Clerk/Auth0**: Self-hosted (no third-party dependency), fits the "user owns their infra" philosophy. First-class TanStack Start integration. Has a Drizzle adapter so auth tables live in the same Postgres. No monthly fees, no external data flows.

**PostgreSQL over SQLite/Turso**: Railway has one-click Postgres provisioning. Better Auth has a Drizzle-Postgres adapter. Multiple services (web + agent) need concurrent access — Postgres handles this natively. SQLite would require a separate Turso instance or file locking concerns.

**Drizzle over Prisma**: Lighter, faster migrations, closer to SQL. Better Auth has an official Drizzle adapter. No binary engine to bundle in Docker.

---

## 4. Repository Structure

```
Huginn/
├── package.json              # Root: scripts, turbo dep
├── pnpm-workspace.yaml       # Workspace definition
├── turbo.json                # Turborepo pipeline config
├── docker-compose.yml        # Local dev: postgres + services
├── .env.example              # All required env vars documented
│
├── apps/
│   ├── web/                  # TanStack Start application
│   │   ├── package.json
│   │   ├── app.config.ts     # TanStack Start config
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── __root.tsx           # Root layout
│   │   │   │   ├── index.tsx            # Landing / sign-in
│   │   │   │   ├── _authenticated.tsx   # Auth layout (beforeLoad guard)
│   │   │   │   ├── _authenticated/
│   │   │   │   │   ├── dashboard.tsx    # Account info, channels, personality
│   │   │   │   │   └── link/
│   │   │   │   │       └── telegram.tsx # Telegram linking flow
│   │   │   │   └── api/
│   │   │   │       └── auth/
│   │   │   │           └── $.ts         # Better Auth catch-all handler
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts              # Better Auth server config
│   │   │   │   ├── auth-client.ts       # Better Auth client SDK
│   │   │   │   └── db.ts               # Re-export shared DB connection
│   │   │   └── components/
│   │   │       └── (minimal UI components)
│   │   └── Dockerfile
│   │
│   └── agent/                # Mastra agent + Telegram bot
│       ├── package.json
│       ├── src/
│       │   ├── index.ts                 # Entry: start Mastra + grammY bot
│       │   ├── mastra/
│       │   │   ├── index.ts             # Mastra instance config
│       │   │   └── agents/
│       │   │       └── Huginn.ts     # Agent definition
│       │   ├── identity/
│       │   │   ├── instructions.ts      # buildInstructions()
│       │   │   ├── personality-store.ts # PostgreSQL PersonalityStore impl
│       │   │   └── seed.ts             # Default SOUL/IDENTITY + seedNewAccount()
│       │   ├── accounts/
│       │   │   └── service.ts          # AccountService PostgreSQL impl
│       │   └── telegram/
│       │       ├── bot.ts              # grammY bot setup
│       │       └── handler.ts          # Message handler + /link command
│       └── Dockerfile
│
└── packages/
    └── shared/               # Shared between web + agent
        ├── package.json
        ├── drizzle.config.ts # Drizzle Kit config
        ├── src/
        │   ├── index.ts      # Barrel export
        │   ├── db.ts         # Database connection factory
        │   ├── schema/
        │   │   ├── index.ts          # Re-export all tables
        │   │   ├── accounts.ts       # accounts table
        │   │   ├── channel-links.ts  # channel_links table
        │   │   ├── personality-files.ts # personality_files table
        │   │   └── linking-codes.ts  # linking_codes table
        │   └── types/
        │       ├── index.ts
        │       ├── accounts.ts       # Account, ChannelLink interfaces
        │       └── identity.ts       # PersonalityFileType, VersionEntry, PersonalityStore, AccountService
        └── drizzle/
            └── (generated migrations)
```

### 4.1 Package Dependencies

```
@Huginn/shared     ← no internal deps (leaf package)
@Huginn/web        ← depends on @Huginn/shared
@Huginn/agent      ← depends on @Huginn/shared
```

Both `apps/web` and `apps/agent` import schema definitions, types, and the DB connection factory from `@Huginn/shared`. They never import from each other.

---

## 5. Data Layer

### 5.1 Schema Definitions (Drizzle)

#### `accounts`

```typescript
// packages/shared/src/schema/accounts.ts

import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(), // Stable UUID — used as resourceId everywhere
  googleSub: text("google_sub").notNull().unique(), // Google OAuth "sub" claim
  email: text("email").notNull(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

#### `channel_links`

```typescript
// packages/shared/src/schema/channel-links.ts

import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const channelLinks = pgTable(
  "channel_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'telegram' (extensible)
    providerUserId: text("provider_user_id").notNull(), // Telegram user ID as string
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // One link per provider+user combo (a Telegram user can only link to one account)
    uniqueProviderUser: uniqueIndex("uq_provider_user").on(
      table.provider,
      table.providerUserId,
    ),
    // One link per account+provider combo (an account can only have one Telegram link)
    uniqueAccountProvider: uniqueIndex("uq_account_provider").on(
      table.accountId,
      table.provider,
    ),
  }),
);
```

#### `personality_files`

```typescript
// packages/shared/src/schema/personality-files.ts

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const personalityFiles = pgTable(
  "personality_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fileType: text("file_type").notNull(), // 'SOUL' | 'IDENTITY'
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    reason: text("reason"), // Why this version was created
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Only one current version per account+file_type (latest version wins)
    // Note: history is maintained by inserting new rows with incremented version numbers
  }),
);
```

**Version history strategy**: Every save inserts a new row with `version + 1`. The current version is always the row with the highest version number for a given `(accountId, fileType)` pair. `load()` queries with `ORDER BY version DESC LIMIT 1`. `history()` returns all rows ordered by version descending.

#### `linking_codes`

```typescript
// packages/shared/src/schema/linking-codes.ts

import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const linkingCodes = pgTable("linking_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(), // e.g. 'LINK-A3F9'
  provider: text("provider").notNull().default("telegram"),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

Linking codes expire after 10 minutes. One-time use. Generated by the web app, consumed by the Telegram bot's `/link` command.

#### Better Auth Tables

Better Auth with the Drizzle adapter will generate its own tables (`user`, `session`, `account` (OAuth), etc.) via its migration tooling. These live in the same Postgres database. We do **not** use Better Auth's `user` table as our `accounts` table — they serve different purposes:

- Better Auth's `user` = auth identity (sessions, OAuth tokens)
- Our `accounts` = app identity (personality, memory, channel linking)

On first sign-in, we create a row in both: Better Auth handles its `user` row automatically; our app creates an `accounts` row keyed by `googleSub`, and stores the mapping.

### 5.2 Database Connection

```typescript
// packages/shared/src/db.ts

import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

Both services instantiate their own connection using the same `APP_DATABASE_URL` env var pointing to the Railway Postgres instance.

---

## 6. Interface Contracts

These interfaces are the stable contracts between layers. Implementations are pluggable; interfaces are not changed without an explicit decision.

### 6.1 AccountService

```typescript
// packages/shared/src/types/accounts.ts

export interface Account {
  id: string; // UUID — the universal identity key
  googleSub: string;
  email: string;
  displayName?: string;
  createdAt: Date;
}

export interface ChannelLink {
  accountId: string;
  provider: "telegram";
  providerUserId: string;
  linkedAt: Date;
}

export interface AccountService {
  // Account lifecycle
  createAccount(
    googleSub: string,
    email: string,
    displayName?: string,
  ): Promise<Account>;
  getAccountByGoogleSub(googleSub: string): Promise<Account | null>;
  getAccountById(id: string): Promise<Account | null>;

  // Channel linking
  linkChannel(
    accountId: string,
    provider: "telegram",
    providerUserId: string,
  ): Promise<ChannelLink>;
  unlinkChannel(accountId: string, provider: "telegram"): Promise<void>;
  resolveAccountFromChannel(
    provider: "telegram",
    providerUserId: string,
  ): Promise<Account | null>;
  getChannelLinks(accountId: string): Promise<ChannelLink[]>;

  // Linking codes
  createLinkingCode(accountId: string, provider: "telegram"): Promise<string>;
  verifyLinkingCode(
    code: string,
  ): Promise<{ accountId: string; provider: string } | null>;
}
```

### 6.2 PersonalityStore

```typescript
// packages/shared/src/types/identity.ts

export type PersonalityFileType = "SOUL" | "IDENTITY";

export interface VersionEntry {
  version: number;
  content: string;
  reason: string | null;
  createdAt: string;
}

export interface PersonalityStore {
  /** Load the current (latest version) content for a file type. */
  load(accountId: string, file: PersonalityFileType): Promise<string | null>;

  /** Save a new version. Appends to history; does not overwrite. */
  save(
    accountId: string,
    file: PersonalityFileType,
    content: string,
    reason: string,
  ): Promise<void>;

  /** Check if any personality files exist for this account. */
  exists(accountId: string): Promise<boolean>;

  /** Return version history, most recent first. */
  history(
    accountId: string,
    file: PersonalityFileType,
    limit?: number,
  ): Promise<VersionEntry[]>;
}
```

**Naming discipline**: The parameter is `accountId` in the PersonalityStore and AccountService. The same value is passed as `resourceId` to Mastra. Different names make the boundary clear — the app layer talks about accounts; Mastra talks about resources.

### 6.3 Caching

The `PersonalityStore` implementation wraps a simple in-memory LRU cache:

- **Cache key**: `${accountId}:${fileType}`
- **TTL**: 30 seconds
- **Invalidation**: On every `save()`, the corresponding cache entry is evicted immediately
- **Scope**: Per-process (each service instance has its own cache)

This means a direct database update (e.g. during development) is reflected within 30 seconds. An update via `save()` is reflected immediately in the same process.

---

## 7. Identity Layer

### 7.1 Personality Files

Every account has two personality files:

| File            | Purpose                             | Example Content                            |
| --------------- | ----------------------------------- | ------------------------------------------ |
| **SOUL.md**     | How the agent communicates          | Tone, verbosity, formality, response style |
| **IDENTITY.md** | What the agent knows about the user | Name, role, preferences, context           |

These are loaded on every LLM call via dynamic instructions. They're versioned — every change creates a new version row, preserving history for the future refinement workflow (Phase 3).

### 7.2 Default Seeds

```markdown
# SOUL — Communication Style

## Defaults

- Friendly and helpful. Clear, concise responses.
- Match the user's tone and formality level.
- Default to medium-length responses unless asked otherwise.
- Be direct — answer the question first, then add context if needed.
```

```markdown
# IDENTITY

- New user. Limited context available.
- Pay attention to what they share and how they communicate.
- Adapt as you learn more about them through conversation.
```

Seeded on account creation. Idempotent — `seedNewAccount()` checks `exists()` before writing.

### 7.3 Instructions Composition

```typescript
// apps/agent/src/identity/instructions.ts

export const BASE_INSTRUCTIONS = `You are Huginn, a personal AI assistant.

## Core Behavior
- You have personality context loaded above that tells you about this user
  and how to communicate with them. Follow it.
- You have working memory that persists across conversations. Use it to
  track what matters.
- Each chat is a separate conversation thread. Don't continue tasks from
  other chats unless the user explicitly references them.

## Working Memory Guidelines
- Update working memory when the user mentions priorities, deadlines, or
  things they're waiting on.
- Clear stale items when they're resolved or no longer relevant.
- Keep it concise — this is a scratchpad, not a journal.`;

export async function buildInstructions(
  accountId: string,
  store: PersonalityStore,
): Promise<string> {
  const [soul, identity] = await Promise.all([
    store.load(accountId, "SOUL"),
    store.load(accountId, "IDENTITY"),
  ]);

  return [soul, identity, BASE_INSTRUCTIONS]
    .filter(Boolean)
    .join("\n\n---\n\n");
}
```

**Injection order in the final prompt** (top to bottom):

1. SOUL.md content (communication style)
2. IDENTITY.md content (user context)
3. BASE_INSTRUCTIONS (agent behavior rules)
4. Working Memory (system message injected by Mastra)
5. Recent message history (thread-scoped, injected by Mastra)
6. User's current message

### 7.4 Working Memory Template

```markdown
# Active Context

- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:
```

Working memory is scoped to `resourceId = account.id`. It persists across threads and channels. If a user mentions a deadline in Telegram chat A, it's visible in Telegram chat B (same account, same working memory). Different accounts never see each other's working memory.

---

## 8. Agent Configuration

### 8.1 Huginn Agent Definition

```typescript
// apps/agent/src/mastra/agents/Huginn.ts

export type HuginnContext = {
  "account-id": string;
  "personality-store": PersonalityStore;
};

export const HuginnAgent = new Agent({
  id: "Huginn",
  name: "Huginn",
  model: "openrouter/anthropic/claude-sonnet-4",

  instructions: async ({ runtimeContext }) => {
    const accountId = runtimeContext.get("account-id") as string;
    const store = runtimeContext.get("personality-store") as PersonalityStore;
    return buildInstructions(accountId, store);
  },

  memory: new Memory({
    storage: new LibSQLStore({
      id: "Huginn-memory",
      url: process.env.MASTRA_DATABASE_URL!,
    }),
    options: {
      lastMessages: 15,
      workingMemory: {
        enabled: true,
        scope: "resource", // Scoped to account.id
        template: WORKING_MEMORY_TEMPLATE,
      },
    },
  }),
});
```

### 8.2 Runtime Context Wiring

Every message handler (Telegram, future channels) follows the same pattern:

1. Resolve the channel user to an `Account` via `AccountService.resolveAccountFromChannel()`
2. Create a `RuntimeContext` with `account-id` and `personality-store`
3. Call `HuginnAgent.generate()` with `runtimeContext` and `memory: { thread, resource: account.id }`

The agent never knows which channel the message came from. It sees an account ID, personality files, and a thread ID. This is what makes it channel-agnostic.

---

## 9. Web Application

### 9.1 Pages

#### `/ ` — Landing

- "Sign in with Google" button (Better Auth social sign-in)
- Minimal explanation of what Huginn is
- Redirects to `/dashboard` if already authenticated

#### `/dashboard` — Authenticated Home

- **Account section**: email, display name, account ID
- **Connected channels**: Telegram status (linked/unlinked), "Connect" button
- **Personality section** (read-only): Current SOUL.md and IDENTITY.md content displayed in a code block or formatted markdown
- Protected by `beforeLoad` auth guard

#### `/link/telegram` — Telegram Linking Flow

- Generates a one-time linking code via `AccountService.createLinkingCode()`
- Displays instructions: "Open Telegram → message @HuginnBot → send `/link YOUR-CODE`"
- Polls for confirmation (simple interval checking if the code has been used)
- On success: redirects back to dashboard with Telegram shown as connected

### 9.2 Auth Flow (Better Auth + Google)

```
User clicks "Sign in with Google"
  → Better Auth redirects to Google OAuth consent screen
  → Google redirects back to /api/auth/callback/google
  → Better Auth creates/updates its internal user + session
  → After sign-in hook fires:
      → Extract googleSub, email, displayName from the OAuth profile
      → Call AccountService.getAccountByGoogleSub(googleSub)
      → If null: AccountService.createAccount(googleSub, email, displayName)
                 + seedNewAccount(personalityStore, account.id)
      → Store account.id in session or a linked lookup
  → Redirect to /dashboard
```

**Important**: Better Auth manages its own `user` and `session` tables. Our `accounts` table is separate. The link between them is `googleSub` — Better Auth's user has it from Google, our account has it too. On every authenticated request, we resolve the Better Auth session → get googleSub → look up our account.

### 9.3 Session → Account Resolution

Every authenticated page/API route needs to go from "who is this browser session" to "which Huginn account is this." The flow:

1. Better Auth middleware verifies the session cookie → returns Better Auth `user` (has `email`, `name`, and linked OAuth accounts)
2. From the OAuth account data, extract the Google `sub` claim
3. Query `accounts` table by `googleSub` → get `Account.id`

This could be cached in the session to avoid the DB lookup on every request. Optimization for later — correctness first.

---

## 10. Telegram Integration

### 10.1 Bot Setup

The grammY bot runs inside `apps/agent` as part of the same process as the Mastra agent. It uses long polling in development and webhooks in production (Railway).

### 10.2 Message Flow

```
Telegram user sends message
  → grammY receives update
  → Extract telegramUserId from ctx.from.id
  → AccountService.resolveAccountFromChannel('telegram', String(telegramUserId))
  → If null:
      → Reply: "I don't recognise this Telegram account yet.
                Sign up at Huginn.yourdomain.com and link
                your Telegram to get started."
      → Return (stop processing)
  → If found (account):
      → Build RuntimeContext with account.id + personalityStore
      → HuginnAgent.generate(messageText, {
          runtimeContext,
          memory: {
            thread: `tg-chat-${chatId}`,
            resource: account.id,
          },
        })
      → Reply with agent response text
```

### 10.3 Linking Flow

```
Telegram user sends: /link LINK-A3F9
  → Bot extracts code from message
  → AccountService.verifyLinkingCode('LINK-A3F9')
  → If null or expired:
      → Reply: "That code didn't work or has expired.
                Generate a new one from the dashboard."
      → Return
  → If valid (returns { accountId, provider }):
      → AccountService.linkChannel(accountId, 'telegram', String(ctx.from.id))
      → Mark code as used
      → Reply: "Linked! I'm ready to chat. Send me anything."
```

### 10.4 Thread ID Convention

- **Thread ID format**: `tg-chat-${chatId}`
- **Resource ID**: `account.id` (always the account UUID, never the Telegram user ID)

This means:

- Same Telegram chat = same thread (message history continues)
- Different Telegram chats with the same user = different threads (but same working memory, since resource is the same)
- Different users = different resources = completely isolated

---

## 11. Environment Variables

```env
# ─── Shared ───
APP_DATABASE_URL=postgresql://user:pass@host:5432/Huginn   # PostgreSQL connection string

# ─── Agent (apps/agent) ───
MASTRA_DATABASE_URL=file:./mastra.db       # libSQL for Mastra internals (local file or Turso URL)
OPENROUTER_API_KEY=sk-or-...               # LLM provider
TELEGRAM_BOT_TOKEN=123456:ABC-...          # grammY bot token

# ─── Web (apps/web) ───
GOOGLE_CLIENT_ID=...                       # Google OAuth client ID
GOOGLE_CLIENT_SECRET=...                   # Google OAuth client secret
BETTER_AUTH_SECRET=...                     # Better Auth session signing secret
APP_URL=https://Huginn.yourdomain.com   # Public URL (for OAuth redirects)

# ─── Development only ───
# POSTGRES_USER=Huginn
# POSTGRES_PASSWORD=Huginn
# POSTGRES_DB=Huginn
```

---

## 12. Docker Compose Topology

```yaml
# docker-compose.yml (production on Railway)

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - APP_DATABASE_URL
      - GOOGLE_CLIENT_ID
      - GOOGLE_CLIENT_SECRET
      - BETTER_AUTH_SECRET
      - APP_URL
    depends_on:
      - postgres

  agent:
    build:
      context: .
      dockerfile: apps/agent/Dockerfile
    environment:
      - APP_DATABASE_URL
      - MASTRA_DATABASE_URL
      - OPENROUTER_API_KEY
      - TELEGRAM_BOT_TOKEN
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_USER=Huginn
      - POSTGRES_PASSWORD=Huginn
      - POSTGRES_DB=Huginn
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

**Railway deployment note**: Railway can either run Docker Compose directly or deploy each service separately. If separate, PostgreSQL is a Railway-managed addon (not a Docker container), and `APP_DATABASE_URL` points to Railway's provided connection string.

---

## 13. Build Milestones

### Milestone 0 — Scaffold & Plumbing

- Turborepo monorepo: `apps/web`, `apps/agent`, `packages/shared`
- Drizzle schema in `packages/shared`
- Local Docker Compose with Postgres
- Migrations running, empty tables created
- **Acceptance**: `pnpm dev` runs, `pnpm db:migrate` applies schema

### Milestone 1 — Auth & Account Creation

- TanStack Start app with Better Auth + Google OAuth
- Sign in → `accounts` row created → personality files seeded
- Protected `/dashboard` showing account info + personality (read-only)
- **Acceptance**: Sign in with Google, see your account and default SOUL/IDENTITY on dashboard

### Milestone 2 — Agent with Personality Injection

- Mastra agent with dynamic instructions via `buildInstructions()`
- `PersonalityStore` PostgreSQL implementation with caching
- Working memory configured, resource-scoped to account ID
- **Acceptance**: Call agent with two different account IDs → different personality in responses, working memory persists per account

### Milestone 3 — Telegram Channel Linking

- grammY bot with `/link CODE` command
- Web dashboard generates linking codes
- `resolveAccountFromChannel()` routes Telegram messages to correct account
- Unlinked users get rejection message
- **Acceptance**: Link Telegram, send message, get personality-aware response

### Milestone 4 — Multi-User & Deploy

- Two Google accounts with independent personality + memory
- Docker Compose deployed to Railway
- Full smoke test passing (see Section 14)
- **Acceptance**: Two users, fully isolated, running on Railway

---

## 14. Smoke Test Script

This is the acceptance test for Phase 1. Every step must pass.

```
 1. Visit web app → sign in with Google account A → account created
 2. Go to dashboard → see default SOUL.md and IDENTITY.md
 3. Click "Connect Telegram" → get linking code
 4. Open Telegram → /link CODE → bot confirms linking
 5. Send "hi" in Telegram → agent responds with default personality
 6. Update SOUL.md in DB to "Be extremely terse. One sentence max." →
    send another message → tone shifts noticeably
 7. Sign in with Google account B → separate account created
 8. Link account B's Telegram → send message → gets default personality
    (not A's terse style)
 9. From A's Telegram: "I'm working on the identity layer, deadline tomorrow"
10. From A (new Telegram chat): "what am I working on?" →
    response mentions "identity layer" (working memory)
11. From B's Telegram: "what am I working on?" →
    no knowledge of identity layer (isolation confirmed)
```

---

## 15. What This POC Does NOT Include

Explicitly deferred to keep scope tight:

| Feature                             | Phase  | Notes                                               |
| ----------------------------------- | ------ | --------------------------------------------------- |
| Observational Memory                | 2      | Add `observationalMemory` config to Memory instance |
| Refinement workflow / self-learning | 3      | New workflow reading OM, writing personality files  |
| User-facing preference editing      | 3+     | `set-preference` tool + dashboard UI                |
| Semantic recall / vector search     | 4      | Vector store config in Mastra                       |
| Web chat channel                    | Future | Same agent, different handler                       |
| WhatsApp / Discord                  | Future | Same linking pattern as Telegram                    |
| Dashboard personality editing       | Future | Form + `store.save()` — interfaces are ready        |

### 15.1 Merge Path

Everything in this POC is designed to be extended, not rewritten:

- **New channels**: Implement a handler that calls `resolveAccountFromChannel()`, add a linking flow. Agent and personality store are channel-agnostic.
- **Observational Memory**: Add config to the `Memory` instance. Zero changes to account layer or handlers.
- **Refinement workflow**: New file that reads OM via Mastra APIs, reads personality via `store.load()`, writes via `store.save()`. All interfaces already exist.
- **Dashboard editing**: The dashboard already shows personality read-only. Editing is a form + `store.save()`.

---

## 16. Open Questions (Tracked)

| #   | Question                                                                                                                    | Status | Decision                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| 1   | Better Auth `user` ↔ `accounts` mapping: store account.id in Better Auth session, or look up by googleSub on every request? | Open   | Decide during Milestone 1 implementation                  |
| 2   | Railway deployment: Docker Compose or separate services?                                                                    | Open   | Decide during Milestone 4                                 |
| 3   | Telegram bot: long polling vs webhook in production?                                                                        | Open   | Webhook preferred for Railway, confirm during Milestone 3 |
| 4   | TanStack Start deployment: Node adapter output or static build?                                                             | Open   | Decide during Milestone 1                                 |

---

## 17. Glossary

| Term                     | Meaning                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account**              | A Huginn user record. Created on first Google sign-in. Has a stable UUID used everywhere.                                                            |
| **Account ID**           | The UUID primary key on the `accounts` table. Same value passed as `resourceId` to Mastra.                                                           |
| **Channel**              | An external messaging platform (Telegram, WhatsApp, Discord, etc.) linked to an account.                                                             |
| **Channel Link**         | A row in `channel_links` mapping a provider + provider user ID to an account ID.                                                                     |
| **SOUL.md**              | Personality file governing the agent's communication style for a specific account.                                                                   |
| **IDENTITY.md**          | Personality file capturing what the agent knows about the user.                                                                                      |
| **Working Memory**       | Mastra's resource-scoped scratchpad. Persists across threads. Stores priorities, deadlines, active context.                                          |
| **Thread**               | A Mastra conversation thread. Maps to a specific chat (e.g., one Telegram chat = one thread).                                                        |
| **Resource**             | Mastra's term for the entity that owns memory. In our system, resource = account. `resourceId = account.id`.                                         |
| **Linking Code**         | A one-time, time-limited code generated by the web app, consumed by the Telegram bot's `/link` command to associate a Telegram user with an account. |
| **Dynamic Instructions** | The system prompt composed per-request from SOUL.md + IDENTITY.md + BASE_INSTRUCTIONS. Different for every account.                                  |
