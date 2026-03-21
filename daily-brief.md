# Daily Briefing Feature

Huginn sends each linked user a personalized morning briefing via Telegram — calendar overview, memory context about upcoming meetings, and a motivational note in Huginn's personality.

## Why This Feature

- Ties together every layer: **Workflows**, **Calendar**, **Memory**, **Personality**, **Telegram**
- First Mastra Workflow — introduces the pattern needed for Phase 3 personality refinement
- Genuinely useful from day one — no interaction required to get value
- Simple scope: one workflow, one trigger, one delivery channel

---

## Architecture

```
┌──────────────┐     ┌───────────────────────────┐     ┌──────────────┐
│  Cron Trigger │────▶│  daily-briefing workflow   │────▶│  Telegram    │
│  (node-cron)  │     │                           │     │  (grammY)    │
│  7:00 AM local│     │  Step 1: Resolve accounts │     └──────────────┘
└──────────────┘     │  Step 2: Fetch calendar    │
                     │  Step 3: Query memory      │
                     │  Step 4: Generate briefing │
                     │  Step 5: Send via Telegram │
                     └───────────────────────────┘
```

## Milestones

### M1: Infrastructure (Cron + Workflow Skeleton)

**Goal**: Workflow triggers on schedule and can iterate over linked accounts.

- [ ] Install `node-cron` in `apps/agent`
- [ ] Create `apps/agent/src/workflows/daily-briefing.ts` — Mastra Workflow with 5 steps
- [ ] Create `apps/agent/src/scheduler.ts` — cron job that triggers the workflow
- [ ] Wire scheduler into `apps/agent/src/index.ts` (start on boot)
- [ ] Add `DAILY_BRIEF_ENABLED=true` and `DAILY_BRIEF_CRON=0 7 * * *` env vars (opt-in)
- [ ] Step 1 (`resolve-accounts`): Query all accounts that have at least one Telegram channel link AND at least one enabled calendar connection

### M2: Calendar + Memory Context

**Goal**: Fetch today's schedule and relevant memory for each account.

- [ ] Step 2 (`fetch-calendar`): Use existing `CalendarService.getEvents()` for today's date range
- [ ] Step 3 (`query-memory`): Use Huginn agent's `Memory` to search for semantic matches against meeting titles/attendees — surfaces past conversation context about the people/topics in today's meetings
- [ ] Format output as structured data: `{ events: CalendarEvent[], memoryContext: string[] }`

### M3: LLM Briefing Generation

**Goal**: Agent generates a personalized briefing message using its personality.

- [ ] Step 4 (`generate-briefing`): Use the Huginn agent to generate a briefing message
  - Load account's SOUL + IDENTITY personality files
  - Inject today's calendar + memory context
  - Prompt: "Generate a morning briefing for today. Include calendar overview with key context you remember about the meetings/people. Keep the tone consistent with your personality. Be concise — this is a Telegram message."
  - Use `agent.generate()` with `requestContext` set for the account
- [ ] Output: Markdown-formatted Telegram message

### M4: Telegram Delivery + Polish

**Goal**: Send the briefing and handle edge cases.

- [ ] Step 5 (`send-telegram`): Use grammY `bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" })` to deliver
  - Look up `chatId` from `channel_links` table for the account's Telegram link
- [ ] Handle no-calendar-connected gracefully (skip account, no error)
- [ ] Handle no-events day: "Looks like a clear day — no meetings on the calendar!"
- [ ] Handle bot/API errors: log + continue to next account (don't let one failure block others)
- [ ] Add to AGENTS.md documentation

---

## Technical Design

### Workflow Definition

```typescript
// apps/agent/src/workflows/daily-briefing.ts
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod/v4";

const resolveAccounts = createStep({
  id: "resolve-accounts",
  inputSchema: z.object({}),
  outputSchema: z.object({
    accounts: z.array(z.object({
      accountId: z.string(),
      telegramChatId: z.string(),
    })),
  }),
  execute: async ({ mastra }) => {
    // Query accounts with Telegram links + calendar connections
  },
});

const fetchCalendar = createStep({ ... });
const queryMemory = createStep({ ... });
const generateBriefing = createStep({ ... });
const sendTelegram = createStep({ ... });

export const dailyBriefingWorkflow = createWorkflow({
  id: "daily-briefing",
  inputSchema: z.object({}),
  outputSchema: z.object({ sent: z.number(), skipped: z.number() }),
})
  .then(resolveAccounts)
  .foreach(/* per account */)
    .then(fetchCalendar)
    .then(queryMemory)
    .then(generateBriefing)
    .then(sendTelegram)
  .commit();
```

### Scheduler

```typescript
// apps/agent/src/scheduler.ts
import cron from "node-cron";
import { mastra } from "./mastra";

export function startScheduler() {
  const cronExpr = process.env.DAILY_BRIEF_CRON ?? "0 7 * * *";
  const enabled = process.env.DAILY_BRIEF_ENABLED === "true";

  if (!enabled) {
    console.log("[scheduler] Daily briefing disabled");
    return;
  }

  cron.schedule(cronExpr, async () => {
    console.log("[scheduler] Running daily briefing...");
    const workflow = mastra.getWorkflow("daily-briefing");
    const run = workflow.createRun();
    const result = await run.start({ inputData: {} });
    console.log("[scheduler] Daily briefing complete:", result);
  });

  console.log(`[scheduler] Daily briefing scheduled: ${cronExpr}`);
}
```

### Registration

```typescript
// apps/agent/src/mastra/index.ts — add to Mastra constructor
import { dailyBriefingWorkflow } from "../workflows/daily-briefing";

new Mastra({
  agents: { huginn: huginnAgent },
  tools: { "get-calendar": getCalendarTool },
  workflows: { "daily-briefing": dailyBriefingWorkflow },
  storage,
  observability,
});
```

### Per-Account Processing Flow

For each account with a linked Telegram + calendar:

1. **Fetch calendar** → `CalendarService.getEvents(accountId, { start: todayStart, end: todayEnd })`
2. **Query memory** → Semantic search against meeting titles: `"Product Sprint Planning"`, `"Technical Interview - Edwin"` → returns past conversation snippets mentioning those topics/people
3. **Generate briefing** → Agent `.generate()` with personality + calendar + memory context
4. **Send** → `bot.api.sendMessage(chatId, briefingText, { parse_mode: "Markdown" })`

### Example Output (Telegram)

```
☀️ Good morning! Here's your day:

📅 **Monday, March 23rd**

• **12:00–12:30** Sales sync
• **13:00–13:30** Gnosis Ramp weekly sync
• **13:30–14:15** GB Lite Sync
• **14:30–15:30** Product Sprint Planning & Retro
• **15:30–16:30** GTM AI + pipeline review
• **16:30–17:30** Technical Interview — Edwin

💡 You mentioned wanting to follow up with Sharon about
the partnership proposal — your Monerium session with her
is at 21:00.

Have a productive day! 🚀
```

---

## New Dependencies

| Package            | Version | Purpose                    |
| ------------------ | ------- | -------------------------- |
| `node-cron`        | `^3.x`  | Cron scheduler for Node.js |
| `@types/node-cron` | `^3.x`  | TypeScript types (devDep)  |

---

## New Environment Variables

| Variable              | Default     | Description                                    |
| --------------------- | ----------- | ---------------------------------------------- |
| `DAILY_BRIEF_ENABLED` | `false`     | Opt-in flag to enable daily briefings          |
| `DAILY_BRIEF_CRON`    | `0 7 * * *` | Cron expression (default: 7:00 AM server time) |

---

## New Files

```
apps/agent/src/
├── workflows/
│   └── daily-briefing.ts    # Mastra Workflow (5 steps)
├── scheduler.ts             # node-cron trigger
```

---

## Testing Strategy

1. **Manual trigger**: Add a `POST /admin/trigger-briefing` endpoint (dev-only) to trigger the workflow on-demand without waiting for cron
2. **Dry run**: Add `DAILY_BRIEF_DRY_RUN=true` mode that generates the briefing but logs instead of sending to Telegram
3. **Per-step unit tests** (future): Test each step independently with mocked dependencies
4. **Studio visibility**: Workflow will appear in Mastra Studio's Workflows tab for trace inspection

---

## Open Questions

- [ ] Should users be able to configure their preferred briefing time via the web UI? (deferred — start with a single server-wide cron)
- [ ] Should the briefing also be sent via the web chat interface, not just Telegram? (deferred — Telegram-only for v1)
- [ ] Should we support timezone-per-user for briefing delivery? (deferred — server timezone for v1)
- [ ] Should the workflow persist run history for review in Studio? (yes — `shouldPersistSnapshot: true`)
