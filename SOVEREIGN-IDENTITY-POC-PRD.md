# Sovereign Identity Layer — POC PRD

A deployable proof-of-concept that wires up personality injection, working memory, and multi-user support via Telegram. No self-learning, no refinement workflow — just the foundation that makes the agent feel personal from message one.

---

## 1. Goal

Ship a working Sovereign agent that:

- Loads per-user personality context (SOUL + IDENTITY) into every LLM call via dynamic instructions
- Creates default personality files for any user on their first message to the bot
- Tracks current conversational state via Mastra Working Memory
- Supports multiple concurrent Telegram users with full isolation
- Deploys to the existing Docker Compose stack on Railway

**Explicitly out of scope**: Observational Memory, refinement workflow, self-learning, git versioning, semantic recall, Obsidian vault integration, user preference management via bot.

---

## 2. Architecture Overview

```
Telegram message arrives
       │
       ▼
┌─────────────────────┐
│   Telegram Handler   │
│                     │
│  1. Resolve resourceId from Telegram user ID
│  2. Build RuntimeContext
│  3. Call sovereignAgent.generate()
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Sovereign Agent    │
│                     │
│  instructions: async ({ runtimeContext }) => {
│    load SOUL + IDENTITY
│    compose system prompt
│  }
│                     │
│  memory: Working Memory (resource-scoped)
│  tools: []
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   PersonalityStore   │  ← libSQL (same DB as Mastra memory)
│                     │
│  personality_files   │  SOUL/IDENTITY per user
└─────────────────────┘
```

---

## 3. Database Schema

Three tables. All in the existing libSQL database alongside Mastra's memory tables.

```sql
-- AI personality files (seeded with defaults on first message, written by refinement workflow later)
CREATE TABLE IF NOT EXISTS personality_files (
  resource_id TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('SOUL', 'IDENTITY')),
  content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (resource_id, file_type)
);

-- Version history for future auditability
CREATE TABLE IF NOT EXISTS personality_file_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User preferences (schema reserved for future use, not populated by bot in this POC)
CREATE TABLE IF NOT EXISTS user_preferences (
  resource_id TEXT PRIMARY KEY,
  nickname TEXT,
  language TEXT DEFAULT 'en',
  response_length TEXT DEFAULT 'normal'
    CHECK(response_length IN ('brief', 'normal', 'detailed')),
  timezone TEXT,
  custom_note TEXT CHECK(length(custom_note) <= 280),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Run on startup via a migration function. Idempotent — safe to run repeatedly.

---

## 4. Personality Store

### 4.1 Interface

```typescript
// src/identity/types.ts

export type PersonalityFileType = 'SOUL' | 'IDENTITY';

export interface UserPreferences {
  nickname?: string;
  language?: string;
  responseLength?: 'brief' | 'normal' | 'detailed';
  timezone?: string;
  customNote?: string;
}

export interface VersionEntry {
  version: number;
  content: string;
  reason: string | null;
  createdAt: string;
}

export interface PersonalityStore {
  load(resourceId: string, file: PersonalityFileType): Promise<string | null>;
  save(resourceId: string, file: PersonalityFileType, content: string, reason: string): Promise<void>;
  exists(resourceId: string): Promise<boolean>;
  history(resourceId: string, file: PersonalityFileType, limit?: number): Promise<VersionEntry[]>;
}
```

### 4.2 Implementation

```typescript
// src/identity/store.ts

import type { Client } from '@libsql/client';
import type { PersonalityStore, PersonalityFileType, UserPreferences, VersionEntry } from './types';

const cache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

export class DatabasePersonalityStore implements PersonalityStore {
  constructor(private db: Client) {}

  async load(resourceId: string, file: PersonalityFileType): Promise<string | null> {
    const key = `${resourceId}:${file}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.content;
    }

    const result = await this.db.execute({
      sql: 'SELECT content FROM personality_files WHERE resource_id = ? AND file_type = ?',
      args: [resourceId, file],
    });

    const content = (result.rows[0]?.content as string) ?? null;
    if (content) {
      cache.set(key, { content, loadedAt: Date.now() });
    }
    return content;
  }

  async save(
    resourceId: string,
    file: PersonalityFileType,
    content: string,
    reason: string,
  ): Promise<void> {
    // Upsert current file
    await this.db.execute({
      sql: `INSERT INTO personality_files (resource_id, file_type, content, version, updated_at)
            VALUES (?, ?, ?, 1, datetime('now'))
            ON CONFLICT (resource_id, file_type) DO UPDATE SET
              content = excluded.content,
              version = personality_files.version + 1,
              updated_at = datetime('now')`,
      args: [resourceId, file, content],
    });

    // Get new version number
    const vResult = await this.db.execute({
      sql: 'SELECT version FROM personality_files WHERE resource_id = ? AND file_type = ?',
      args: [resourceId, file],
    });
    const version = (vResult.rows[0]?.version as number) ?? 1;

    // Append to history
    await this.db.execute({
      sql: `INSERT INTO personality_file_history
            (resource_id, file_type, content, version, change_reason)
            VALUES (?, ?, ?, ?, ?)`,
      args: [resourceId, file, content, version, reason],
    });

    // Invalidate cache
    cache.delete(`${resourceId}:${file}`);
  }

  async exists(resourceId: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: 'SELECT 1 FROM personality_files WHERE resource_id = ? LIMIT 1',
      args: [resourceId],
    });
    return result.rows.length > 0;
  }

  async history(
    resourceId: string,
    file: PersonalityFileType,
    limit = 10,
  ): Promise<VersionEntry[]> {
    const result = await this.db.execute({
      sql: `SELECT version, content, change_reason, created_at
            FROM personality_file_history
            WHERE resource_id = ? AND file_type = ?
            ORDER BY version DESC LIMIT ?`,
      args: [resourceId, file, limit],
    });
    return result.rows.map((r) => ({
      version: r.version as number,
      content: r.content as string,
      reason: r.change_reason as string | null,
      createdAt: r.created_at as string,
    }));
  }
}
```

---

## 5. Seed Data

### 5.1 Default Personality Files

When any user messages the bot and has no personality files, they get default personality files seeded automatically. No onboarding questionnaire, no env vars — just start talking.

```typescript
// src/identity/seed.ts

export const DEFAULT_SOUL = `# SOUL — Communication Style

## Defaults
- Friendly and helpful. Clear, concise responses.
- Match the user's tone and formality level.
- Default to medium-length responses unless asked otherwise.
- Be direct — answer the question first, then add context if needed.
`;

export const DEFAULT_IDENTITY = `# IDENTITY

- New user. Limited context available.
- Pay attention to what they share and how they communicate.
- Adapt as you learn more about them through conversation.
`;
```

### 5.2 Seed Function

Called on each incoming message. Idempotent — only writes if the user has no existing files.

```typescript
// src/identity/seed.ts

export async function ensureUserSeeded(
  store: PersonalityStore,
  resourceId: string,
): Promise<void> {
  const exists = await store.exists(resourceId);
  if (!exists) {
    await store.save(resourceId, 'SOUL', DEFAULT_SOUL, 'Default seed for new user');
    await store.save(resourceId, 'IDENTITY', DEFAULT_IDENTITY, 'Default seed for new user');
    console.log(`[identity] Seeded default personality files for ${resourceId}`);
  }
}
```

---

## 6. Sovereign Agent

### 6.1 Instructions Composition

```typescript
// src/identity/instructions.ts

import type { PersonalityStore } from './types';

export const BASE_INSTRUCTIONS = `You are Sovereign, a personal AI assistant.

## Core Behavior
- You have personality context loaded above that tells you about this user and how to communicate with them. Follow it.
- You have working memory that persists across conversations. Use it to track what matters.
- Each Telegram chat is a separate conversation thread. Don't continue tasks from other chats unless the user explicitly references them.

## Working Memory Guidelines
- Update working memory when the user mentions priorities, deadlines, or things they're waiting on.
- Clear stale items when they're resolved or no longer relevant.
- Keep it concise — this is a scratchpad, not a journal.`;

export async function buildInstructions(
  resourceId: string,
  store: PersonalityStore,
): Promise<string> {
  const [soul, identity] = await Promise.all([
    store.load(resourceId, 'SOUL'),
    store.load(resourceId, 'IDENTITY'),
  ]);

  return [soul, identity, BASE_INSTRUCTIONS]
    .filter(Boolean)
    .join('\n\n---\n\n');
}
```

### 6.2 Agent Definition

```typescript
// src/mastra/agents/sovereign.ts

import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { RuntimeContext } from '@mastra/core/runtime-context';
import { buildInstructions } from '../../identity/instructions';
import type { PersonalityStore } from '../../identity/types';

const WORKING_MEMORY_TEMPLATE = `# Active Context
- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:
`;

// Type the RuntimeContext for this agent
export type SovereignContext = {
  'resource-id': string;
  'personality-store': PersonalityStore;
};

export const sovereignAgent = new Agent({
  id: 'sovereign',
  name: 'Sovereign',

  model: 'openrouter/anthropic/claude-sonnet-4',
  // OR: model: ({ runtimeContext }) => { ... } for per-user model selection

  instructions: async ({ runtimeContext }) => {
    const resourceId = runtimeContext.get('resource-id') as string;
    const store = runtimeContext.get('personality-store') as PersonalityStore;
    return buildInstructions(resourceId, store);
  },

  tools: {},

  memory: new Memory({
    storage: new LibSQLStore({
      id: 'sovereign-memory',
      url: process.env.DATABASE_URL!,
    }),
    options: {
      lastMessages: 15,
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: WORKING_MEMORY_TEMPLATE,
      },
      // OM intentionally omitted for POC
    },
  }),
});
```

---

## 7. Telegram Handler

```typescript
// src/telegram/handler.ts (relevant changes only)

import { RuntimeContext } from '@mastra/core/runtime-context';
import { sovereignAgent, type SovereignContext } from '../mastra/agents/sovereign';
import { DatabasePersonalityStore } from '../identity/store';
import { ensureUserSeeded } from '../identity/seed';
import type { PersonalityStore } from '../identity/types';

// Initialize store once
const store: PersonalityStore = new DatabasePersonalityStore(db);

// Resolve stable user identity from Telegram user ID
function resolveResourceId(telegramUserId: number): string {
  return `tg-user-${telegramUserId}`;
}

bot.on('message:text', async (ctx) => {
  const telegramUserId = ctx.from.id;
  const chatId = ctx.chat.id;
  const resourceId = resolveResourceId(telegramUserId);

  // Seed default personality files if this is a new user
  await ensureUserSeeded(store, resourceId);

  // Build runtime context
  const runtimeContext = new RuntimeContext<SovereignContext>();
  runtimeContext.set('resource-id', resourceId);
  runtimeContext.set('personality-store', store);

  // Call agent
  const response = await sovereignAgent.generate(ctx.message.text, {
    runtimeContext,
    memory: {
      thread: `tg-chat-${chatId}`,
      resource: resourceId,
    },
  });

  await ctx.reply(response.text);
});
```

---

## 8. Startup / Migration

```typescript
// src/identity/migrate.ts

import type { Client } from '@libsql/client';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS personality_files (
    resource_id TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('SOUL', 'IDENTITY')),
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (resource_id, file_type)
  );

  CREATE TABLE IF NOT EXISTS personality_file_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id TEXT NOT NULL,
    file_type TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    change_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    resource_id TEXT PRIMARY KEY,
    nickname TEXT,
    language TEXT DEFAULT 'en',
    response_length TEXT DEFAULT 'normal'
      CHECK(response_length IN ('brief', 'normal', 'detailed')),
    timezone TEXT,
    custom_note TEXT CHECK(length(custom_note) <= 280),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export async function runMigrations(db: Client): Promise<void> {
  const statements = SCHEMA.split(';').filter((s) => s.trim());
  for (const sql of statements) {
    await db.execute(sql);
  }
  console.log('[identity] Migrations complete');
}
```

```typescript
// In your main startup (e.g., src/index.ts)

import { runMigrations } from './identity/migrate';
import { DatabasePersonalityStore } from './identity/store';

const db = createClient({ url: process.env.DATABASE_URL! });
const store = new DatabasePersonalityStore(db);

await runMigrations(db);
// No startup seeding — users are seeded on first message via ensureUserSeeded()
```

---

## 9. File Structure

```
src/
  identity/
    types.ts            # PersonalityStore interface, VersionEntry
    store.ts            # DatabasePersonalityStore implementation
    instructions.ts     # buildInstructions(), BASE_INSTRUCTIONS
    seed.ts             # Default SOUL/IDENTITY + ensureUserSeeded()
    migrate.ts          # Database schema creation
  mastra/
    agents/
      sovereign.ts      # Agent definition with dynamic instructions + working memory
  telegram/
    handler.ts          # Updated handler with resourceId resolution + runtimeContext wiring
```

---

## 10. Testing Plan

### 10.1 What to Verify

**Multi-user isolation:**
- Message the bot from two different Telegram accounts
- Verify each gets their own personality files (check DB)
- Verify working memory is isolated (set a priority in one account, confirm the other doesn't see it)

**Personality injection:**
- First message from any user: agent should respond with default personality (friendly, adaptive)
- Update a user's SOUL in the DB directly → verify agent picks up the change within 30 seconds (cache TTL)

**Working memory:**
- Tell the agent "I'm focused on Project Falcon this week, deadline is Friday"
- Start a new chat → agent should still know about Project Falcon (resource-scoped)
- Say "Project Falcon shipped" → agent should clear it from working memory

**New user seeding:**
- Message from a never-seen-before Telegram account
- Verify personality_files rows are created automatically with DEFAULT_SOUL and DEFAULT_IDENTITY

**Cache behavior:**
- Update a personality file directly in the DB
- Verify the agent uses old content for up to 30 seconds, then picks up the new version

### 10.2 Manual Smoke Test Script

```
1. Start the bot (clean DB)
2. Send "hi" from TG account A → expect default friendly response, verify DB has personality rows for A
3. Send "hi" from TG account B → expect default friendly response, verify DB has personality rows for B
4. From A: "I'm working on deploying the identity layer, deadline is tomorrow" → expect acknowledgment
5. From A (new chat): "what am I working on?" → expect "deploying the identity layer" (working memory persists)
6. From B: "what am I working on?" → expect no knowledge (isolation)
7. Manually update A's SOUL in DB → wait 30s → verify new style reflected in responses
```

---

## 11. Environment Variables

```env
DATABASE_URL=file:./sovereign.db     # or libSQL cloud URL
OPENROUTER_API_KEY=...               # for Claude Sonnet via OpenRouter
TELEGRAM_BOT_TOKEN=...               # grammY bot token
```

No user-specific env vars required. All user data is created dynamically on first message.

---

## 12. What This POC Does NOT Include

- **Observational Memory** — Deferred to Phase 2. Lives in `sovereignMemory` config in `sovereign.ts`.
- **Refinement workflow** — Deferred to Phase 3. Lives in `src/mastra/workflows/personality-refinement.ts`.
- **Self-learning / auto-updates to SOUL/IDENTITY** — Deferred to Phase 3. Lives in refinement workflow.
- **Semantic recall over vault/email** — Deferred to Phase 4. Lives in vector store config.
- **Git versioning** — Replaced by DB history. `personality_file_history` table already included.
- **Approval flow for personality changes** — Removed (AI owns files).
- **User preference management via bot** — Deferred. Schema exists, but no tool or UI to set preferences in this POC.

---

## 13. Merge Path to Full System

When ready to add self-learning, the changes are additive — nothing in the POC needs to be rewritten:

1. **Add OM**: Add `observationalMemory` config to the existing Memory instance in `sovereign.ts`. Zero changes to the store, instructions, or handler.

2. **Add refinement workflow**: New file `src/mastra/workflows/personality-refinement.ts`. Reads OM observations via Mastra's memory API, reads current personality files via `store.load()`, writes updates via `store.save()`. The store, schema, and history table are already in place.

3. **Evolve defaults**: The refinement workflow replaces `DEFAULT_SOUL` / `DEFAULT_IDENTITY` with learned personality as it observes each user. New users still start with defaults.

4. **Add preference tool**: Re-introduce `setPreferenceTool` to let users set preferences via natural language ("call me X", "keep it brief"). The `user_preferences` table and `PersonalityStore` methods are already in the schema.

5. **Add notification queueing**: The refinement workflow stores a "pending notification" flag. The agent checks it on next message and mentions the SOUL.md change naturally. Small addition to `buildInstructions()`.

The `PersonalityStore` interface, database schema, caching layer, `runtimeContext` wiring, multi-user isolation, and working memory all carry forward unchanged.

---

## 14. Definition of Done

- [ ] Database tables created on startup (idempotent migration)
- [ ] Any user gets default personality files seeded on first message (no env var needed)
- [ ] Agent responses reflect the personality defined in SOUL/IDENTITY (verifiable by tone/style)
- [ ] Working memory persists across threads for the same user
- [ ] Working memory is isolated between users
- [ ] Two concurrent Telegram users get fully independent experiences
- [ ] Cache invalidation works (DB update reflected within 30 seconds)
- [ ] Deployed to Railway and functional via Telegram
