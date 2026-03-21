# Daily Briefing — Technical Specification (Final)

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

| Layer              | How It's Used                                                          |
| ------------------ | ---------------------------------------------------------------------- |
| Workflows          | First Mastra Workflow — `createWorkflow` + `foreach` + nested workflow |
| Calendar           | `CalendarService.getEvents()` for today's schedule                     |
| Semantic Memory    | `memory.recall()` with `vectorSearchString` against meeting titles     |
| Personality        | `agent.generate()` loads SOUL + IDENTITY via `buildInstructions()`     |
| Telegram           | `bot.api.sendMessage()` to deliver the briefing                        |
| Account Resolution | Query accounts with linked Telegram + enabled calendar connections     |

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

### Dependency Injection Strategy

Workflow steps receive `{ mastra }` in their execute context. Agent access works via `mastra.getAgent('huginn')`. However, `CalendarService` is an app-level service not registered with Mastra.

**Solution**: Use `RequestContext` to inject app-level dependencies. The scheduler creates a `RequestContext` with `calendar-service`, `personality-store`, and `db` before calling `run.start()`. Steps access these via `requestContext.get()`. This mirrors how the existing `/chat` endpoint already injects these services.

```typescript
// In scheduler.ts
const requestContext = new RequestContext();
requestContext.set("calendar-service", calendarService);
requestContext.set("personality-store", personalityStore);
requestContext.set("db", db);

const result = await run.start({ inputData: {}, requestContext });
```

```typescript
// In any step
execute: async ({ inputData, requestContext }) => {
  const calendarService = requestContext.get("calendar-service");
  // ...
};
```

**Bot access**: Import `getBot()` from `../../telegram/bot.js` directly in the workflow file. The bot is initialized before the scheduler starts, so `getBot()` returns the singleton instance.

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
const calendarService = requestContext.get("calendar-service") as CalendarService;
const now = new Date();
const events = await calendarService.getEvents(accountId, {
  start: startOfDay(now), // midnight local
  end: endOfDay(now), // 23:59:59 local
});
```

Output: `CalendarEvent[]` — unified, provider-agnostic events sorted by start time.

**Edge case**: No calendar events → short-circuit to a "clear day" briefing (skip memory query, generate simple message).

### 3.3 Memory Query

For each meeting title, run a semantic search against the account's conversation history using `memory.recall()`:

```typescript
const agent = mastra.getAgent("huginn");
const memory = agent.getMemory();

const contextSnippets: string[] = [];
for (const event of events) {
  try {
    const { messages } = await memory!.recall({
      threadId: `briefing-lookup-${accountId}`, // required param — see note below
      resourceId: accountId,
      vectorSearchString: event.title,
      threadConfig: {
        semanticRecall: {
          topK: 2,
          messageRange: 1,
          scope: "resource", // cross-thread search — overrides per-query
        },
      },
    });

    if (messages.length > 0) {
      contextSnippets.push(`Re: "${event.title}" — ${formatMemorySnippets(messages)}`);
    }
  } catch (error) {
    // Log and continue — memory failures should not block the briefing
    console.warn(`[daily-briefing] Memory query failed for "${event.title}":`, error);
  }
}
```

**API notes** (verified against `@mastra/memory@1.9.0`):

- The correct method is `memory.recall()` — there is no `memory.query()` method
- `threadId` is **required** even with `scope: 'resource'`. We pass a synthetic thread ID since the vector search fans out across all threads when scope is `'resource'`
- `vectorSearchString` is a **top-level parameter** on `recall()`, not nested under `selectBy`
- `threadConfig.semanticRecall.scope` can override the agent's default scope per-call

Output: `string[]` — memory context per meeting, only for meetings where relevant history exists.

**Rate consideration**: If a user has 15 meetings, this runs 15 vector queries. At this scale, sequential is fine. If it becomes a problem, batch or limit to the first N events.

### 3.4 Briefing Generation

Use the Huginn agent to generate the briefing with personality:

```typescript
const agent = mastra.getAgent("huginn");
const personalityStore = requestContext.get("personality-store");
const calendarService = requestContext.get("calendar-service");

const agentRequestContext = new RequestContext();
agentRequestContext.set("account-id", accountId);
agentRequestContext.set("personality-store", personalityStore);
agentRequestContext.set("calendar-service", calendarService);

const response = await agent.generate(
  [
    {
      role: "user",
      content: buildBriefingPrompt(events, contextSnippets, today),
    },
  ],
  {
    requestContext: agentRequestContext,
    memory: {
      resource: accountId,
      thread: `briefing-${accountId}-${dateStr}`,
    },
  },
);
```

The agent's `buildInstructions()` automatically loads SOUL.md + IDENTITY.md + working memory. The briefing generation inherits the user's personality without extra work. The `requestContext` must include `account-id` and `personality-store` since `buildInstructions()` reads from the personality store per account.

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
import { getBot } from "../../telegram/bot.js";

const bot = getBot();
// In private bot chats, Telegram user ID === chat ID.
// channel_links.provider_user_id stores String(ctx.from.id) — a positive integer.
// This assumption breaks for group chats (negative IDs).
await bot!.api.sendMessage(telegramChatId, briefingText, {
  parse_mode: "Markdown",
});
```

---

## 4. Workflow Implementation

### 4.1 Nested Workflow (Per-Account)

```typescript
// apps/agent/src/workflows/daily-briefing.ts

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { getBot } from "../telegram/bot.js";
import type { CalendarService, CalendarEvent } from "@huginn/shared";

// --- Schemas ---

const accountInputSchema = z.object({
  accountId: z.string(),
  telegramChatId: z.string(),
});

const calendarOutputSchema = z.object({
  accountId: z.string(),
  telegramChatId: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      start: z.string(), // ISO datetime (serialized from Date)
      end: z.string(), // ISO datetime
      description: z.string().optional(),
      location: z.string().optional(),
      isAllDay: z.boolean(),
      source: z.object({
        provider: z.string(),
        connectionLabel: z.string(),
      }),
    }),
  ),
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

// --- Helper ---

function serializeEvents(events: CalendarEvent[]) {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    description: e.description,
    location: e.location,
    isAllDay: e.isAllDay,
    source: e.source,
  }));
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// --- Steps ---

const fetchCalendar = createStep({
  id: "fetch-calendar",
  inputSchema: accountInputSchema,
  outputSchema: calendarOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const { accountId, telegramChatId } = inputData;
    const calendarService = requestContext!.get("calendar-service") as CalendarService;

    const now = new Date();
    const events = await calendarService.getEvents(accountId, {
      start: startOfDay(now),
      end: endOfDay(now),
    });

    return {
      accountId,
      telegramChatId,
      events: serializeEvents(events),
      hasEvents: events.length > 0,
    };
  },
});

const queryMemory = createStep({
  id: "query-memory",
  inputSchema: calendarOutputSchema,
  outputSchema: memoryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { events, hasEvents, ...rest } = inputData;

    if (!hasEvents) {
      return { ...inputData, memoryContext: [] };
    }

    const agent = mastra.getAgent("huginn");
    const memory = agent.getMemory();

    if (!memory) {
      console.warn("[daily-briefing] No memory configured — skipping memory query");
      return { ...inputData, memoryContext: [] };
    }

    const contextSnippets: string[] = [];
    for (const event of events) {
      try {
        const { messages } = await memory.recall({
          threadId: `briefing-lookup-${rest.accountId}`,
          resourceId: rest.accountId,
          vectorSearchString: event.title,
          threadConfig: {
            semanticRecall: {
              topK: 2,
              messageRange: 1,
              scope: "resource",
            },
          },
        });

        if (messages.length > 0) {
          const snippets = messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
            .slice(0, 2)
            .join(" ... ");
          if (snippets) {
            contextSnippets.push(`Re: "${event.title}" — ${snippets}`);
          }
        }
      } catch (error) {
        console.warn(`[daily-briefing] Memory query failed for "${event.title}":`, error);
      }
    }

    return { ...inputData, memoryContext: contextSnippets };
  },
});

const generateBriefing = createStep({
  id: "generate-briefing",
  inputSchema: memoryOutputSchema,
  outputSchema: briefingOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    const { accountId, telegramChatId, events, hasEvents, memoryContext } = inputData;
    const agent = mastra.getAgent("huginn");

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Format calendar for the prompt
    let formattedCalendar: string;
    if (!hasEvents) {
      formattedCalendar = "No meetings scheduled today — your calendar is clear.";
    } else {
      formattedCalendar = events
        .map((e) => {
          const start = new Date(e.start);
          const end = new Date(e.end);
          const timeStr = e.isAllDay
            ? "All day"
            : `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
          const loc = e.location ? ` (${e.location})` : "";
          return `- ${timeStr}: ${e.title}${loc} [${e.source.connectionLabel}]`;
        })
        .join("\n");
    }

    const contextSection =
      memoryContext.length > 0 ? memoryContext.join("\n") : "No relevant context found.";

    const prompt = `Generate a morning briefing for today, ${today}.

## Today's Calendar
${formattedCalendar}

## Relevant Context from Past Conversations
${contextSection}

## Instructions
- Keep it concise — this is a Telegram message
- Lead with the calendar overview
- Weave in any relevant memory context naturally (e.g., "You mentioned wanting to follow up with X about Y — your meeting with them is at 2pm")
- End with a brief motivational note in your personality voice
- Use Markdown formatting compatible with Telegram (bold, bullet points)
- Do NOT use headers or horizontal rules`;

    // Build a requestContext so buildInstructions() can load personality
    const { RequestContext } = await import("@mastra/core/request-context");
    const agentRequestContext = new RequestContext();
    agentRequestContext.set("account-id", accountId);
    agentRequestContext.set("personality-store", requestContext!.get("personality-store"));
    agentRequestContext.set("calendar-service", requestContext!.get("calendar-service"));

    const response = await agent.generate([{ role: "user" as const, content: prompt }], {
      requestContext: agentRequestContext,
      memory: {
        resource: accountId,
        thread: `briefing-${accountId}-${today.replace(/\s+/g, "-").toLowerCase()}`,
      },
    });

    return { accountId, telegramChatId, briefingText: response.text };
  },
});

const sendTelegram = createStep({
  id: "send-telegram",
  inputSchema: briefingOutputSchema,
  outputSchema: deliveryOutputSchema,
  execute: async ({ inputData }) => {
    const { accountId, telegramChatId, briefingText } = inputData;

    const dryRun = process.env.DAILY_BRIEF_DRY_RUN === "true";
    if (dryRun) {
      console.log(`[daily-briefing] DRY RUN for account ${accountId}:\n${briefingText}`);
      return { sent: false, reason: "dry-run" };
    }

    const bot = getBot();
    if (!bot) {
      return { sent: false, reason: "bot-not-configured" };
    }

    try {
      // In private bot chats, Telegram user ID === chat ID.
      await bot.api.sendMessage(telegramChatId, briefingText, {
        parse_mode: "Markdown",
      });
      return { sent: true, reason: "delivered" };
    } catch (error) {
      console.error(`[daily-briefing] Telegram send failed for account ${accountId}:`, error);

      // Retry without Markdown if formatting was the issue
      if (error instanceof Error && error.message.includes("can't parse")) {
        try {
          await bot.api.sendMessage(telegramChatId, briefingText);
          return { sent: true, reason: "delivered-plain-text" };
        } catch (retryError) {
          console.error(`[daily-briefing] Plain text retry also failed:`, retryError);
        }
      }

      return { sent: false, reason: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

// --- Nested Workflow (per account) ---

const processAccountWorkflow = createWorkflow({
  id: "process-account-briefing",
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
  id: "resolve-accounts",
  inputSchema: z.object({}),
  outputSchema: z.array(accountInputSchema),
  execute: async ({ requestContext }) => {
    const db = requestContext!.get("db");
    const accountService = requestContext!.get("account-service");

    // Query accounts with Telegram link + enabled calendar connection
    // Implementation uses Drizzle joins — see §3.1
    const accounts = await accountService.getAccountsWithTelegramAndCalendar();
    return accounts;
  },
});

export const dailyBriefingWorkflow = createWorkflow({
  id: "daily-briefing",
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

import cron from "node-cron";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "./mastra/index.js";

import type { Database } from "@huginn/shared";
import type { CalendarService, AccountService, PersonalityStore } from "@huginn/shared";

interface SchedulerDeps {
  db: Database;
  calendarService: CalendarService;
  personalityStore: PersonalityStore;
  accountService: AccountService;
}

export function startScheduler(deps: SchedulerDeps) {
  const cronExpr = process.env.DAILY_BRIEF_CRON ?? "0 7 * * *";
  const enabled = process.env.DAILY_BRIEF_ENABLED === "true";

  if (!enabled) {
    console.log("[scheduler] Daily briefing disabled (set DAILY_BRIEF_ENABLED=true)");
    return;
  }

  cron.schedule(cronExpr, async () => {
    const startTime = Date.now();
    console.log("[scheduler] Running daily briefing...");

    try {
      const workflow = mastra.getWorkflow("daily-briefing");
      const run = await workflow.createRun();

      // Inject app-level services via RequestContext
      const requestContext = new RequestContext();
      requestContext.set("db", deps.db);
      requestContext.set("calendar-service", deps.calendarService);
      requestContext.set("personality-store", deps.personalityStore);
      requestContext.set("account-service", deps.accountService);

      const result = await run.start({ inputData: {}, requestContext });

      if (result.status === "success") {
        const results = result.result as Array<{ sent: boolean; reason: string }>;
        const sent = results.filter((r) => r.sent).length;
        const failed = results.filter((r) => !r.sent).length;
        console.log(
          `[scheduler] Daily briefing complete: ${sent} sent, ${failed} failed (${Date.now() - startTime}ms)`,
        );
      } else {
        console.error("[scheduler] Daily briefing failed:", result.status);
      }
    } catch (error) {
      console.error("[scheduler] Daily briefing error:", error);
    }
  });

  console.log(`[scheduler] Daily briefing scheduled: ${cronExpr}`);
}
```

### 4.3 Mastra Registration

```typescript
// apps/agent/src/mastra/index.ts — additions

import { dailyBriefingWorkflow } from "../workflows/daily-briefing.js";

new Mastra({
  agents: { huginn: huginnAgent },
  tools: { "get-calendar": getCalendarTool },
  workflows: { "daily-briefing": dailyBriefingWorkflow },
  // ... existing config
});
```

### 4.4 Boot Sequence

```typescript
// apps/agent/src/index.ts — additions

import { startScheduler } from "./scheduler.js";

// After Mastra initialization and Telegram bot setup
startScheduler({ db, calendarService, personalityStore, accountService });
```

Note: `accountService` is already created in `index.ts` (inside the Telegram bot block). Move the `createAccountService(db)` call earlier so it's available for both Telegram handlers and the scheduler.

### 4.5 New AccountService Method

Add `getAccountsWithTelegramAndCalendar()` to the `AccountService` interface and implementation:

```typescript
// packages/shared/src/types/accounts.ts — addition to AccountService interface
getAccountsWithTelegramAndCalendar(): Promise<Array<{ accountId: string; telegramChatId: string }>>;

// packages/shared/src/services/account-service.ts — implementation
async getAccountsWithTelegramAndCalendar() {
  const rows = await db
    .selectDistinct({
      accountId: accounts.id,
      telegramChatId: channelLinks.providerUserId,
    })
    .from(accounts)
    .innerJoin(channelLinks, and(
      eq(channelLinks.accountId, accounts.id),
      eq(channelLinks.provider, 'telegram'),
    ))
    .innerJoin(calendarConnections, and(
      eq(calendarConnections.accountId, accounts.id),
      eq(calendarConnections.enabled, true),
    ));

  return rows;
}
```

---

## 5. Milestones

### M1: Infrastructure — Cron + Workflow Skeleton + Account Resolution

**Goal**: Workflow triggers on schedule and resolves eligible accounts.

- [ ] `pnpm add node-cron @types/node-cron` in `apps/agent`
- [ ] Create `apps/agent/src/workflows/daily-briefing.ts` with all step shells (throw `Not implemented`)
- [ ] Create `apps/agent/src/scheduler.ts` with cron trigger and RequestContext DI
- [ ] Wire scheduler into `apps/agent/src/index.ts` (move accountService creation earlier)
- [ ] Register `dailyBriefingWorkflow` in Mastra constructor (`apps/agent/src/mastra/index.ts`)
- [ ] Add `DAILY_BRIEF_ENABLED` and `DAILY_BRIEF_CRON` env vars
- [ ] Add `getAccountsWithTelegramAndCalendar()` to `AccountService` interface + implementation
- [ ] Implement `resolve-accounts` step using the new service method
- [ ] Create manual trigger script for testing (see §6)

**Done when**: Running the manual trigger logs the list of eligible accounts.

### M2: Calendar Fetch + Memory Query

**Goal**: For each account, fetch today's events and query semantic memory for context.

- [ ] Implement `fetch-calendar` step using `calendarService.getEvents()` from `requestContext`
- [ ] Implement `query-memory` step using `memory.recall()` with `vectorSearchString` per event title
- [ ] Use synthetic `threadId` (`briefing-lookup-${accountId}`) — `threadId` is required even with `scope: 'resource'`
- [ ] Handle no-events gracefully (pass empty array, skip memory query)
- [ ] Handle memory query failures gracefully (log warn, continue with empty context)

**Done when**: Manual trigger logs calendar events + memory snippets for each account.

### M3: LLM Briefing Generation

**Goal**: Agent generates a personalized briefing message.

- [ ] Implement `generate-briefing` step using `agent.generate()` with per-account `requestContext`
- [ ] Pass `requestContext` with `account-id` + `personality-store` + `calendar-service` so `buildInstructions()` works
- [ ] Design the briefing prompt (see §3.4 for shape)
- [ ] Handle no-events day with a short "clear day" message
- [ ] Verify personality injection — the briefing should sound like the agent, not generic

**Done when**: Manual trigger logs a complete briefing message that reflects the user's personality.

### M4: Telegram Delivery + Polish

**Goal**: Briefing arrives in Telegram. Error handling is solid.

- [ ] Implement `send-telegram` step using `getBot()` import + `bot.api.sendMessage()`
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
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "../mastra/index.js";
import {
  createDb,
  createCalendarService,
  createPersonalityStore,
  createAccountService,
} from "@huginn/shared";

async function main() {
  const db = createDb(process.env.APP_DATABASE_URL!);
  const calendarService = createCalendarService(db);
  const personalityStore = createPersonalityStore(db);
  const accountService = createAccountService(db);

  const workflow = mastra.getWorkflow("daily-briefing");
  const run = await workflow.createRun();

  const requestContext = new RequestContext();
  requestContext.set("db", db);
  requestContext.set("calendar-service", calendarService);
  requestContext.set("personality-store", personalityStore);
  requestContext.set("account-service", accountService);

  const result = await run.start({ inputData: {}, requestContext });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
```

Run with: `pnpm tsx apps/agent/src/scripts/trigger-briefing.ts`

### Dry Run Mode

`DAILY_BRIEF_DRY_RUN=true` — generates the briefing but logs to console instead of sending to Telegram. Implemented as a guard in the `send-telegram` step.

### Mastra Studio

The workflow will appear in Mastra Studio's Workflows tab. Each run is inspectable — step inputs, outputs, timing, failures.

---

## 7. Verified Assumptions

These were open questions in the draft spec. All have been verified against the codebase.

### 7.1 Semantic Memory Scope — CONFIRMED ✅

Semantic recall is configured with `scope: 'resource'` in the Memory constructor (`apps/agent/src/mastra/agents/huginn.ts`). Cross-thread search works as needed.

### 7.2 Telegram Chat ID — CONFIRMED ✅

`channel_links.provider_user_id` stores `String(ctx.from.id)` — the Telegram user ID (a positive integer). In private 1:1 bot chats, user ID and chat ID are the same, so `bot.api.sendMessage(providerUserId, ...)` works correctly.

### 7.3 Memory API — CORRECTED ⚠️

**Draft said**: `memory.query()` with `selectBy: { vectorSearchString }`.  
**Actual**: Method is `memory.recall()`. `vectorSearchString` is a top-level parameter. `threadId` is **required** (not optional). See §3.3 for the corrected pattern. The synthetic `threadId` approach works because `scope: 'resource'` fans out the vector search across all threads regardless of the specified `threadId`.

### 7.4 Agent Access in Steps — CONFIRMED ✅

Workflow steps receive `{ mastra }` in the execute context. `mastra.getAgent('huginn')` returns the fully-configured agent with memory.

### 7.5 Bot Instance — RESOLVED ✅

Bot uses a factory pattern: `createBot()` initializes, `getBot()` returns the singleton. The workflow imports `getBot()` from `../../telegram/bot.js`. The bot is initialized in `index.ts` before the scheduler starts, so `getBot()` always returns a valid instance when the workflow runs.

### 7.6 CalendarService Access — RESOLVED ✅

CalendarService is not registered with Mastra. Injected via `RequestContext` from the scheduler, which has access to the app-level `db`, `calendarService`, `personalityStore`, and `accountService` singletons created in `index.ts`.

### 7.7 Workflow API — CONFIRMED ✅

- `createRun()` is **async** (`await workflow.createRun()`)
- `.foreach()` with nested workflow is the documented pattern for multi-step per-item processing
- `requestContext` can be passed to `run.start()` and is available in step execute context
- `.then()` chains steps sequentially; `.foreach(nestedWorkflow, { concurrency })` for fan-out

### 7.8 Zod Import — CORRECTED ⚠️

Codebase uses `import { z } from 'zod'` (not `'zod/v4'`). Both resolve to v4 since zod@4.3.6 is installed, but using `'zod'` for consistency.

### 7.9 CalendarEvent Fields — CORRECTED ⚠️

Draft schema had `sourceLabel: string`. Actual `CalendarEvent` has `source: { provider: CalendarProviderType; connectionLabel: string }`. Schema updated to match.

---

## 8. Environment Variables

```env
# Enable/disable the daily briefing (default: disabled)
DAILY_BRIEF_ENABLED=true

# Cron expression in SERVER timezone.
# Railway default is UTC. Adjust for your local time.
# Example: 0 23 * * * = 07:00 SGT (UTC+8) next day
DAILY_BRIEF_CRON=0 7 * * *

# Log briefing to console instead of sending via Telegram (default: false)
DAILY_BRIEF_DRY_RUN=false
```
