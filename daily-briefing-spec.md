# Daily Briefing — Technical Specification

**Feature**: Huginn Daily Briefing  
**Status**: Ready to build  
**Author**: Engineering  
**Date**: 2026-03-22  
**Depends on**: Calendar integration (complete), Semantic memory (enabled)

---

## 1. Overview

Huginn sends each linked user a personalized morning briefing via Telegram — calendar overview, memory context about upcoming meetings, and a motivational note delivered in the agent's personality voice.

This is a forcing function for Mastra Workflows. The pattern established here — cron trigger → workflow → per-account processing → channel delivery — is the same pattern Phase 3 personality refinement will use. Ship this first, learn the workflow mechanics, apply them to refinement.

### What This Ties Together

| Layer | How It's Used |
|-------|---------------|
| Workflows | First Mastra Workflow — `createWorkflow` + `foreach` + nested workflow |
| Calendar | `CalendarService.getEvents()` for today's schedule |
| Semantic Memory | `memory.query()` with `vectorSearchString` against meeting titles |
| Personality | `agent.generate()` loads SOUL + IDENTITY via `buildInstructions()` |
| Telegram | `bot.api.sendMessage()` to deliver the briefing |
| Account Resolution | Query accounts with linked Telegram + enabled calendar connections |

### Scope Boundaries

**In scope**: Cron-triggered workflow, calendar fetch, semantic memory query, LLM briefing generation, Telegram delivery, multi-account fan-out, error isolation per account.

**Explicitly out of scope**: Per-user timezone configuration (server timezone, configurable via cron expression), per-user briefing time preferences, web chat delivery, dashboard UI for briefing history, briefing opt-out per user.

---

## 2. Architecture

```
┌──────────────┐     ┌─────────────────────────────────────────┐
│  Cron Trigger │────▶│  daily-briefing (parent workflow)       │
│  (node-cron)  │     │                                         │
│  Configurable │     │  Step 1: resolve-accounts               │
└──────────────┘     │    → accounts with Telegram + calendar   │
                     │                                         │
                     │  .foreach(processAccountWorkflow)       │
                     │    ┌───────────────────────────────┐    │
                     │    │  process-account-briefing      │    │
                     │    │  (nested workflow, per account) │    │
                     │    │                                 │    │
                     │    │  Step 2: fetch-calendar         │    │
                     │    │  Step 3: query-memory           │    │
                     │    │  Step 4: generate-briefing      │    │
                     │    │  Step 5: send-telegram          │    │
                     │    └───────────────────────────────┘    │
                     └─────────────────────────────────────────┘
```

### Why a Nested Workflow

Mastra's `.foreach()` processes all items through a single step before moving to the next step. Chaining `.foreach(fetchCalendar).foreach(queryMemory)` would fetch all calendars first, then query all memories — losing the per-account pipeline. A nested workflow keeps all operations for one account together:

- Each account's full pipeline runs as a unit
- One account failing doesn't block others
- Cleaner error isolation and logging
- This is the pattern Mastra's own docs recommend for multi-step per-item processing

---

## 3. Data Flow

### 3.1 Account Resolution

Query: all accounts that have **both** a Telegram channel link **and** at least one enabled calendar connection.

```sql
-- Conceptual query (implemented via Drizzle)
SELECT DISTINCT
  a.id AS account_id,
  cl.provider_user_id AS telegram_chat_id
FROM accounts a
JOIN channel_links cl ON cl.account_id = a.id AND cl.provider = 'telegram'
JOIN calendar_connections cc ON cc.account_id = a.id AND cc.enabled = true
```

Output: `Array<{ accountId: string; telegramChatId: string }>`

### 3.2 Calendar Fetch

```typescript
const events = await calendarService.getEvents(accountId, {
  start: startOfDay(now),   // midnight local
  end: endOfDay(now),       // 23:59:59 local
});
```

Output: `CalendarEvent[]` — unified, provider-agnostic events sorted by start time.

**Edge case**: No calendar events → short-circuit to a "clear day" briefing (skip memory query, generate simple message).

### 3.3 Memory Query

For each meeting title (and attendees if available), run a semantic search against the account's conversation history:

```typescript
const memory = await agent.getMemory();

const contextSnippets: string[] = [];
for (const event of events) {
  const { messages } = await memory!.query({
    resourceId: accountId,
    threadId: 'briefing-context',      // see §7 Verification Items
    selectBy: {
      vectorSearchString: event.title,
    },
    threadConfig: {
      semanticRecall: {
        topK: 2,
        messageRange: 1,
        scope: 'resource',             // cross-thread search
      },
    },
  });

  if (messages.length > 0) {
    contextSnippets.push(
      `Re: "${event.title}" — ${formatMemorySnippets(messages)}`
    );
  }
}
```

Output: `string[]` — memory context per meeting, only for meetings where relevant history exists.

**Rate consideration**: If a user has 15 meetings, this runs 15 vector queries. At this scale, sequential is fine. If it becomes a problem, batch or limit to the first N events.

### 3.4 Briefing Generation

Use the Huginn agent to generate the briefing with personality:

```typescript
const response = await agent.generate(
  [
    {
      role: 'user',
      content: buildBriefingPrompt(events, contextSnippets, today),
    },
  ],
  {
    resourceId: accountId,
    threadId: `briefing-${accountId}-${dateStr}`,
  }
);
```

The agent's `buildInstructions()` automatically loads SOUL.md + IDENTITY.md + working memory. The briefing generation inherits the user's personality without extra work.

**Prompt shape** (injected as the user message):

```
Generate a morning briefing for today, {{date}}.

## Today's Calendar
{{formattedCalendar}}

## Relevant Context from Past Conversations
{{contextSnippets or "No relevant context found."}}

## Instructions
- Keep it concise — this is a Telegram message
- Lead with the calendar overview
- Weave in any relevant memory context naturally (e.g., "You mentioned wanting to follow up with X about Y — your meeting with them is at 2pm")
- End with a brief motivational note in your personality voice
- Use Markdown formatting compatible with Telegram (bold, bullet points)
- Do NOT use headers or horizontal rules
```

### 3.5 Telegram Delivery

```typescript
await bot.api.sendMessage(telegramChatId, briefingText, {
  parse_mode: 'Markdown',
});
```

**Note**: `telegramChatId` is the `provider_user_id` from `channel_links`. For private bot chats, the Telegram user ID and chat ID are identical. See §7.2.

---

## 4. Workflow Implementation

### 4.1 Nested Workflow (Per-Account)

```typescript
// apps/agent/src/workflows/daily-briefing.ts

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod/v4';

// --- Schemas ---

const accountInputSchema = z.object({
  accountId: z.string(),
  telegramChatId: z.string(),
});

const calendarOutputSchema = z.object({
  accountId: z.string(),
  telegramChatId: z.string(),
  events: z.array(z.object({
    title: z.string(),
    start: z.string(),       // ISO datetime
    end: z.string(),
    location: z.string().optional(),
    isAllDay: z.boolean(),
    sourceLabel: z.string(), // "Work", "Personal"
  })),
  hasEvents: z.boolean(),
});

const memoryOutputSchema = calendarOutputSchema.extend({
  memoryContext: z.array(z.string()),
});

const briefingOutputSchema = z.object({
  accountId: z.string(),
  telegramChatId: z.string(),
  briefingText: z.string(),
});

const deliveryOutputSchema = z.object({
  sent: z.boolean(),
  reason: z.string(),
});

// --- Steps ---

const fetchCalendar = createStep({
  id: 'fetch-calendar',
  inputSchema: accountInputSchema,
  outputSchema: calendarOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { accountId, telegramChatId } = inputData;
    // TODO: Get CalendarService from mastra context or import directly
    // const events = await calendarService.getEvents(accountId, todayRange);
    // return { accountId, telegramChatId, events: serializeEvents(events), hasEvents: events.length > 0 };
    throw new Error('Not implemented');
  },
});

const queryMemory = createStep({
  id: 'query-memory',
  inputSchema: calendarOutputSchema,
  outputSchema: memoryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { events, hasEvents, ...rest } = inputData;

    if (!hasEvents) {
      return { ...inputData, memoryContext: [] };
    }

    // TODO: Get agent memory and run semantic search per event title
    // See §3.3 for the query pattern
    // const memory = await mastra.getAgent('huginn').getMemory();
    // const contextSnippets = await queryMemoryForEvents(memory, rest.accountId, events);
    return { ...inputData, memoryContext: [] };
  },
});

const generateBriefing = createStep({
  id: 'generate-briefing',
  inputSchema: memoryOutputSchema,
  outputSchema: briefingOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { accountId, telegramChatId, events, hasEvents, memoryContext } = inputData;

    // TODO: Use huginn agent to generate briefing with personality
    // const agent = mastra.getAgent('huginn');
    // const response = await agent.generate([...], { resourceId: accountId, ... });
    // return { accountId, telegramChatId, briefingText: response.text };
    throw new Error('Not implemented');
  },
});

const sendTelegram = createStep({
  id: 'send-telegram',
  inputSchema: briefingOutputSchema,
  outputSchema: deliveryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { accountId, telegramChatId, briefingText } = inputData;

    try {
      // TODO: Get bot instance and send message
      // await bot.api.sendMessage(telegramChatId, briefingText, { parse_mode: 'Markdown' });
      return { sent: true, reason: 'delivered' };
    } catch (error) {
      console.error(`[daily-briefing] Failed to send to account ${accountId}:`, error);
      return { sent: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});

// --- Nested Workflow (per account) ---

const processAccountWorkflow = createWorkflow({
  id: 'process-account-briefing',
  inputSchema: accountInputSchema,
  outputSchema: deliveryOutputSchema,
})
  .then(fetchCalendar)
  .then(queryMemory)
  .then(generateBriefing)
  .then(sendTelegram)
  .commit();

// --- Parent Workflow ---

const resolveAccounts = createStep({
  id: 'resolve-accounts',
  inputSchema: z.object({}),
  outputSchema: z.array(accountInputSchema),
  execute: async ({ mastra }) => {
    // TODO: Query accounts with Telegram link + enabled calendar connection
    // Uses Drizzle query from packages/shared
    // return accounts.map(a => ({ accountId: a.id, telegramChatId: a.telegramUserId }));
    throw new Error('Not implemented');
  },
});

export const dailyBriefingWorkflow = createWorkflow({
  id: 'daily-briefing',
  inputSchema: z.object({}),
  outputSchema: z.array(deliveryOutputSchema),
})
  .then(resolveAccounts)
  .foreach(processAccountWorkflow, { concurrency: 2 })
  .commit();
```

### 4.2 Scheduler

```typescript
// apps/agent/src/scheduler.ts

import cron from 'node-cron';
import { mastra } from './mastra';

export function startScheduler() {
  const cronExpr = process.env.DAILY_BRIEF_CRON ?? '0 7 * * *';
  const enabled = process.env.DAILY_BRIEF_ENABLED === 'true';

  if (!enabled) {
    console.log('[scheduler] Daily briefing disabled');
    return;
  }

  cron.schedule(cronExpr, async () => {
    const startTime = Date.now();
    console.log('[scheduler] Running daily briefing...');

    try {
      const workflow = mastra.getWorkflow('daily-briefing');
      const run = workflow.createRun();
      const result = await run.start({ inputData: {} });

      if (result.status === 'success') {
        const results = result.result;
        const sent = results.filter((r: any) => r.sent).length;
        const failed = results.filter((r: any) => !r.sent).length;
        console.log(`[scheduler] Daily briefing complete: ${sent} sent, ${failed} failed (${Date.now() - startTime}ms)`);
      } else {
        console.error('[scheduler] Daily briefing failed:', result.status);
      }
    } catch (error) {
      console.error('[scheduler] Daily briefing error:', error);
    }
  });

  console.log(`[scheduler] Daily briefing scheduled: ${cronExpr}`);
}
```

### 4.3 Mastra Registration

```typescript
// apps/agent/src/mastra/index.ts — additions

import { dailyBriefingWorkflow } from '../workflows/daily-briefing';

new Mastra({
  agents: { huginn: huginnAgent },
  tools: { 'get-calendar': getCalendarTool },
  workflows: { 'daily-briefing': dailyBriefingWorkflow },
  // ... existing config
});
```

### 4.4 Boot Sequence

```typescript
// apps/agent/src/index.ts — additions

import { startScheduler } from './scheduler';

// After Mastra initialization and Telegram bot setup
startScheduler();
```

---

## 5. Milestones

### M1: Infrastructure — Cron + Workflow Skeleton + Account Resolution

**Goal**: Workflow triggers on schedule and resolves eligible accounts.

- [ ] `pnpm add node-cron @types/node-cron` in `apps/agent`
- [ ] Create `apps/agent/src/workflows/daily-briefing.ts` with all step shells (throw `Not implemented`)
- [ ] Create `apps/agent/src/scheduler.ts` with cron trigger
- [ ] Wire scheduler into `apps/agent/src/index.ts`
- [ ] Add `DAILY_BRIEF_ENABLED` and `DAILY_BRIEF_CRON` env vars
- [ ] Implement `resolve-accounts` step — Drizzle query joining `accounts`, `channel_links`, `calendar_connections`
- [ ] Add manual trigger script for testing (see §6)

**Done when**: Running the manual trigger logs the list of eligible accounts.

### M2: Calendar Fetch + Memory Query

**Goal**: For each account, fetch today's events and query semantic memory for context.

- [ ] Implement `fetch-calendar` step using `CalendarService.getEvents()`
- [ ] Implement `query-memory` step using `memory.query()` with `vectorSearchString` per event title
- [ ] Handle no-events gracefully (pass empty array, skip memory query)
- [ ] Handle memory query failures gracefully (log, continue with empty context)

**Done when**: Manual trigger logs calendar events + memory snippets for each account.

### M3: LLM Briefing Generation

**Goal**: Agent generates a personalized briefing message.

- [ ] Implement `generate-briefing` step using `agent.generate()` with `resourceId` set to account ID
- [ ] Design the briefing prompt (see §3.4 for shape)
- [ ] Handle no-events day with a short "clear day" message
- [ ] Verify personality injection — the briefing should sound like the agent, not generic

**Done when**: Manual trigger logs a complete briefing message that reflects the user's personality.

### M4: Telegram Delivery + Polish

**Goal**: Briefing arrives in Telegram. Error handling is solid.

- [ ] Implement `send-telegram` step using `bot.api.sendMessage()`
- [ ] Handle Telegram API errors (rate limits, blocked bot, invalid chat ID) — log and continue
- [ ] Handle Markdown formatting issues — if Telegram rejects Markdown, retry with plain text
- [ ] Test with `DAILY_BRIEF_DRY_RUN=true` (log instead of send)
- [ ] Test end-to-end: cron fires → workflow runs → briefing arrives in Telegram
- [ ] Add documentation to AGENTS.md

**Done when**: Briefing arrives in Telegram at the configured time, with correct personality and calendar data.

---

## 6. Testing Strategy

### Manual Trigger (Dev Only)

Add a script that can be run directly, bypassing cron:

```typescript
// apps/agent/src/scripts/trigger-briefing.ts
import { mastra } from '../mastra';

async function main() {
  const workflow = mastra.getWorkflow('daily-briefing');
  const run = workflow.createRun();
  const result = await run.start({ inputData: {} });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

Run with: `pnpm tsx apps/agent/src/scripts/trigger-briefing.ts`

### Dry Run Mode

`DAILY_BRIEF_DRY_RUN=true` — generates the briefing but logs to console instead of sending to Telegram. Implemented as a guard in the `send-telegram` step.

### Mastra Studio

The workflow will appear in Mastra Studio's Workflows tab. Each run is inspectable — step inputs, outputs, timing, failures. Enable with `shouldPersistSnapshot: true` on the workflow if not already default.

---

## 7. Engineer Verification Checklist

**These items must be verified before implementing the corresponding steps. They are assumptions in this spec that depend on the current codebase state and may not hold.**

### 7.1 Semantic Memory Scope Configuration

**What to check**: Is semantic recall configured with `scope: 'resource'` in the Memory initialization?

**Where to look**: The `Memory` constructor in the agent setup — likely `apps/agent/src/mastra/index.ts` or wherever the Huginn agent is defined.

**Why it matters**: The memory query step (§3.3) searches across all threads for an account using `scope: 'resource'`. If semantic recall is configured with `scope: 'thread'` (or defaults to thread), the briefing will only search within a single conversation thread — making it nearly useless for surfacing cross-conversation context about meeting attendees and topics.

**If thread-scoped**: Either change the agent's default semantic recall scope to `resource`, or override it per-query in the workflow step via `threadConfig.semanticRecall.scope`.

**If resource-scoped**: No action needed. Confirm and move on.

### 7.2 Telegram Chat ID vs Provider User ID

**What to check**: What value is stored in `channel_links.provider_user_id` for Telegram links?

**Where to look**: Query the `channel_links` table for a Telegram row. Check: is the value a positive integer?

**Why it matters**: The `send-telegram` step calls `bot.api.sendMessage(chatId, ...)`. For private bot chats, the Telegram user ID and the chat ID are the same positive integer. This is true for all 1:1 bot interactions. But if the system ever stored something else (like a chat object ID or a negative group chat ID), the send will fail silently or deliver to the wrong place.

**Expected**: A positive integer (e.g., `123456789`) that matches the Telegram user ID. Add an explicit comment in the send step confirming this assumption:

```typescript
// In private bot chats, Telegram user ID === chat ID.
// This assumption breaks for group chats (negative IDs).
const chatId = telegramChatId;
```

### 7.3 Memory Query `threadId` Requirement

**What to check**: Does `memory.query()` require a `threadId` even when using `scope: 'resource'` for semantic search?

**Where to look**: Mastra's `memory.query()` signature. The docs show `threadId` as a required parameter, but when `scope: 'resource'`, the vector search fans out across all threads regardless.

**Why it matters**: If `threadId` is required, we need to pass *something* — even if it's not used for scoping. Options:

1. Pass a dummy thread ID (e.g., `briefing-lookup-${accountId}`) — ugly but functional if the resource scope overrides it
2. Use `memory.recall()` instead, which may have different parameter requirements
3. Look up any existing thread ID for the account and pass it

**Test this**: Call `memory.query()` with a known account's resource ID and a fabricated thread ID. If it returns cross-thread results, the thread ID is ignored for resource-scoped searches. If it returns nothing or errors, we need a different approach.

### 7.4 Agent Access Inside Workflow Steps

**What to check**: Can you access the Huginn agent (and its memory) from inside a workflow step via the `mastra` context?

**Where to look**: The `execute` function receives `{ inputData, mastra }`. Test the chain:

```typescript
const agent = mastra.getAgent('huginn');
const memory = await agent.getMemory();
```

**Why it matters**: The `generate-briefing` step needs `agent.generate()` and the `query-memory` step needs `agent.getMemory()`. If the mastra instance passed to workflow steps doesn't have agents registered, or if `getMemory()` returns null, we need an alternative approach (e.g., importing the agent directly rather than resolving from the workflow context).

### 7.5 Bot Instance Access in Workflow Steps

**What to check**: How does the `send-telegram` step get access to the grammY `Bot` instance?

**Where to look**: The current Telegram handler setup. The bot is likely instantiated in the agent app's entry point or a dedicated module.

**Why it matters**: Workflow steps execute in Mastra's workflow engine, not in the Telegram handler's scope. The bot instance needs to be importable or available via the mastra context. Options:

1. Export the bot instance from a shared module (e.g., `apps/agent/src/telegram/bot.ts`) and import it directly in the step
2. Pass it via Mastra's context or dependency injection if supported
3. Create a new `Bot` instance in the step using the same token (wasteful but works)

**Recommended**: Option 1 — a singleton bot module that both the Telegram handler and the workflow step import.

### 7.6 Timezone and Cron Alignment

**What to check**: What timezone does the Railway server run in? What time is "7:00 AM" in the cron expression relative to the user's local time?

**Where to look**: Run `date` on the Railway instance, or check Railway's documentation for default timezone.

**Why it matters**: `0 7 * * *` in server time could be any hour in user time. For a single-user system, the fix is simple: set `DAILY_BRIEF_CRON` to the correct server-time offset. For example, if the server is UTC and the user is UTC+8, set the cron to `0 23 * * *` (23:00 UTC = 07:00 SGT next day — adjust for desired delivery time).

**Document the offset**: Add a comment in the env example:

```env
# Cron expression in SERVER timezone.
# Railway default is UTC. Adjust for your local time.
# Example: 0 23 * * * = 07:00 SGT (UTC+8) next day
DAILY_BRIEF_CRON=0 23 * * *
```

### 7.7 What's Being Embedded

**What to check**: Are message embeddings, OM observation embeddings, or both stored in the vector database?

**Where to look**: Query the pgvector table(s) directly. Check the content of a few rows — are they raw user/assistant messages, or are they the compressed observation summaries the Observer produces?

**Why it matters**: This affects the quality of the memory query results:

- **Messages only**: Semantic search matches against raw conversation text. Good for specific mentions ("I need to follow up with Sharon"). May be noisy with casual messages.
- **Observations only**: Matches against compressed summaries. Denser signal, but may miss specific names or details that the Observer abstracted away.
- **Both**: Best coverage, but may return duplicate context (a message and its observation covering the same topic).

**No action needed regardless** — the workflow works either way. But knowing the signal source helps tune `topK` and the briefing prompt. If observations are included, `topK: 2` is probably sufficient. If messages only, consider `topK: 3-4` for better coverage.

---

## 8. Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DAILY_BRIEF_ENABLED` | `false` | No | Set to `true` to enable the daily briefing cron job |
| `DAILY_BRIEF_CRON` | `0 7 * * *` | No | Cron expression in **server timezone** (see §7.6) |
| `DAILY_BRIEF_DRY_RUN` | `false` | No | Set to `true` to log briefings instead of sending to Telegram |

---

## 9. New Files

```
apps/agent/src/
├── workflows/
│   └── daily-briefing.ts       # Parent + nested workflow, all 5 steps
├── scheduler.ts                # node-cron setup, boot integration
└── scripts/
    └── trigger-briefing.ts     # Manual trigger for dev/testing
```

---

## 10. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `node-cron` | `^3.x` | Cron scheduler for Node.js |
| `@types/node-cron` | `^3.x` | TypeScript types (devDep) |

No other new dependencies. Calendar, memory, agent, and Telegram are all existing.

---

## 11. Error Handling

| Failure | Impact | Handling |
|---------|--------|----------|
| Calendar API down | No events for account | Log warning, generate "couldn't fetch calendar" briefing or skip account |
| Memory query fails | No context enrichment | Log warning, continue with empty context — briefing still has calendar |
| LLM generation fails | No briefing text | Log error, skip account, report in workflow result |
| Telegram send fails | Briefing not delivered | Log error with chat ID, continue to next account |
| One account fails entirely | That account gets no briefing | Nested workflow isolates failure — other accounts unaffected |
| No eligible accounts | Nothing to do | Log info, workflow completes with empty array |

**Principle**: One account's failure never blocks another. The nested workflow per-account design guarantees this. The parent workflow always completes — the output array reports what was sent and what failed.

---

## 12. Example Output

### Full Day

```
☀️ Good morning! Here's your day:

📅 **Monday, March 23rd**

• **09:00–09:30** Daily standup
• **11:00–12:00** Design review — Project Atlas
• **14:00–14:30** 1:1 with Sarah
• **16:00–17:00** Technical Interview — Edwin

💡 You mentioned wanting to follow up with Sarah about the partnership
proposal — your 1:1 is at 14:00.

Have a productive day! 🚀
```

### Clear Day

```
☀️ Good morning!

📅 **Monday, March 23rd**

No meetings on the calendar today — looks like a clear day for deep work.

Make it count! 🚀
```

---

## 13. Future Considerations (Out of Scope)

These are noted for context but are **not** part of this build:

- **Per-user briefing time**: Requires a `briefing_preferences` table and per-user cron scheduling or a single cron that checks each user's preferred time. Adds significant complexity.
- **Per-user timezone**: Requires storing timezone per account and computing "today" relative to each user's zone. Related to per-user briefing time.
- **Briefing opt-out**: An `enabled` flag on a per-account briefing preference. Simple to add later.
- **Multi-channel delivery**: Send via web chat or WhatsApp in addition to Telegram. The workflow already produces the briefing text — adding a delivery step per channel is straightforward once those channels exist.
- **Briefing history**: Store past briefings for review in the dashboard. Could be as simple as a `briefing_logs` table written by the send step.
