# Sovereign Identity Layer — Phase 2 Architecture Specification

**Status**: Draft — ready for review  
**Phase**: 2 (Observational Memory + Storage Migration)  
**Date**: 2026-03-21  
**Depends on**: Phase 1 complete (all milestones passing, smoke test green)

---

## 1. Purpose

Phase 2 adds long-term conversational memory to Sovereign via Mastra's Observational Memory (OM), and consolidates infrastructure by migrating Mastra's storage from libSQL to the existing Railway PostgreSQL instance.

**What this phase delivers**: The agent remembers what happened across long conversations — not just the last 15 messages, but a compressed log of everything it has observed about the user. This is the raw signal that Phase 3's personality refinement workflow will consume.

**What this phase does NOT deliver**: Automatic personality evolution. OM observes and compresses; it does not write to SOUL.md or IDENTITY.md. That's Phase 3.

---

## 2. What Changes

### 2.1 Summary of Changes

| Component | Phase 1 (Current) | Phase 2 (Target) |
|-----------|-------------------|-------------------|
| Mastra storage | libSQL (local file) | PostgreSQL (`mastra` schema) |
| Agent memory | Working memory + 15 message history | Working memory + OM + message history (OM-managed) |
| Environment variables | `MASTRA_DATABASE_URL=file:./mastra.db` | Removed — Mastra uses `APP_DATABASE_URL` |
| Background LLM calls | None | Observer + Reflector (OM background agents) |
| New dependency | — | `@mastra/pg`, OM-compatible model provider |

### 2.2 What Does NOT Change

- Account layer (accounts, channel_links, linking_codes) — untouched
- PersonalityStore interface and implementation — untouched
- Identity layer (SOUL.md, IDENTITY.md, buildInstructions()) — untouched
- Telegram handler message flow — untouched
- Web app (auth, dashboard, linking) — untouched
- Working memory template and resource scoping — untouched

The only files that change are the Mastra instance config and the agent definition. Everything else stays exactly as deployed.

---

## 3. Storage Migration: libSQL → PostgreSQL

### 3.1 Rationale

- **Eliminates infrastructure risk**: libSQL as a file inside a Docker container requires explicit volume management to survive container restarts. PostgreSQL on Railway is managed and persistent.
- **One database to manage**: Backups, monitoring, and connection management are simplified.
- **Unblocks Phase 3**: The refinement workflow needs to read OM observations and write personality files. Colocation in one database (different schemas) makes this a single-connection operation.
- **OM requires it**: OM supports `@mastra/pg`, `@mastra/libsql`, and `@mastra/mongodb`. We're already on Postgres for the app — using it for Mastra too is the obvious choice.

### 3.2 Schema Isolation

Mastra's tables live in a dedicated PostgreSQL schema, separate from app tables:

| Schema | Tables | Managed By |
|--------|--------|------------|
| `public` | `accounts`, `channel_links`, `personality_files`, `linking_codes`, Better Auth tables | Drizzle migrations (app) |
| `mastra` | `mastra_threads`, `mastra_messages`, `mastra_workflow_snapshot`, `mastra_evals`, etc. | Mastra auto-migration (`PostgresStore.init()`) |

**The boundary is enforced at the code level**: app code never queries `mastra.*` tables directly. Mastra never touches `public.*` tables. The bridge remains `account.id` = `resourceId`.

### 3.3 Configuration Change

**Before (Phase 1):**

```typescript
// apps/agent/src/mastra/index.ts
import { LibSQLStore } from '@mastra/libsql';

const storage = new LibSQLStore({
  id: 'sovereign-storage',
  url: process.env.MASTRA_DATABASE_URL!,  // file:./mastra.db
});
```

**After (Phase 2):**

```typescript
// apps/agent/src/mastra/index.ts
import { PostgresStore } from '@mastra/pg';

const storage = new PostgresStore({
  id: 'sovereign-storage',
  connectionString: process.env.APP_DATABASE_URL!,
  schemaName: 'mastra',
});
```

### 3.4 Environment Variable Changes

```env
# ─── Removed ───
# MASTRA_DATABASE_URL=file:./mastra.db   # No longer needed

# ─── Unchanged ───
APP_DATABASE_URL=postgresql://user:pass@host:5432/sovereign   # Now used by both app AND Mastra
```

Update `docker-compose.yml` to remove `MASTRA_DATABASE_URL` from the agent service's environment block.

### 3.5 Migration Strategy

**Data loss is acceptable for the POC.** Mastra's libSQL contains threads, messages, and working memory from testing. None of this is production user data worth migrating. The migration approach is:

1. Deploy the new agent code with `PostgresStore` pointing to the existing Railway Postgres
2. Mastra auto-creates its tables in the `mastra` schema on first `init()`
3. Old libSQL file is abandoned (can be deleted)
4. Working memory for existing accounts starts fresh — users will need to re-establish context

If data preservation is needed later (production migration), Mastra's tables can be dumped from libSQL and imported into Postgres. But for the POC, a clean start is simpler.

### 3.6 Dependency Changes

```bash
# In apps/agent
pnpm remove @mastra/libsql    # or whatever the libSQL package is named
pnpm add @mastra/pg
```

---

## 4. Observational Memory Configuration

### 4.1 Scope Decision: Thread (not Resource)

OM supports two scopes:

- **Thread scope** (default): Each thread has its own observations. Well-tested, stable, supports async buffering.
- **Resource scope** (experimental): Observations shared across all threads for a resource. Marked experimental. Async buffering is disabled. Can be slow for users with many threads.

**We use thread scope.** Here's why:

- Resource scope is explicitly experimental. Mastra warns about task adherence issues across simultaneous threads and notes it can be slow for users with many existing threads.
- We already have **working memory** scoped to `resource` (account ID) for cross-thread state — priorities, deadlines, active context. This gives us cross-conversation continuity.
- Thread-scoped OM gives us **deep recall within a conversation** — the agent remembers everything discussed in this Telegram chat, even across hundreds of messages.
- The combination of thread-scoped OM + resource-scoped working memory gives us both: long-term per-conversation recall AND cross-conversation shared state.

**Revisit this when resource scope exits experimental.** If Mastra stabilizes resource scope and fixes the async buffering limitation, we may switch — especially for Phase 3's refinement workflow, which benefits from cross-thread observations.

### 4.2 Agent Definition (Updated)

```typescript
// apps/agent/src/mastra/agents/sovereign.ts

import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { buildInstructions } from '../../identity/instructions';
import type { PersonalityStore } from '@sovereign/shared';

const WORKING_MEMORY_TEMPLATE = `# Active Context
- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:
`;

export type SovereignContext = {
  'account-id': string;
  'personality-store': PersonalityStore;
};

export const sovereignAgent = new Agent({
  id: 'sovereign',
  name: 'Sovereign',
  model: 'openrouter/anthropic/claude-sonnet-4',

  instructions: async ({ runtimeContext }) => {
    const accountId = runtimeContext.get('account-id') as string;
    const store = runtimeContext.get('personality-store') as PersonalityStore;
    return buildInstructions(accountId, store);
  },

  memory: new Memory({
    storage: new PostgresStore({
      id: 'sovereign-memory',
      connectionString: process.env.APP_DATABASE_URL!,
      schemaName: 'mastra',
    }),
    options: {
      // ── Observational Memory (NEW) ──
      observationalMemory: {
        model: 'openrouter/google/gemini-2.5-flash',
        scope: 'thread',
        observation: {
          messageTokens: 30_000,         // Trigger observation at 30k tokens (default)
          previousObserverTokens: 2_000, // Keep ~2k tokens of recent observations for Observer context
        },
        reflection: {
          observationTokens: 40_000,     // Trigger reflection at 40k tokens (default)
        },
      },

      // ── Working Memory (unchanged from Phase 1) ──
      workingMemory: {
        enabled: true,
        scope: 'resource',       // Cross-thread, scoped to account.id
        template: WORKING_MEMORY_TEMPLATE,
      },

      // ── Message History ──
      // Note: With OM enabled, message history is managed by OM.
      // The lastMessages setting still controls how many recent messages
      // are kept in the context window. OM compresses the rest.
      lastMessages: 15,
    },
  }),
});
```

### 4.3 OM Model Choice

The Observer and Reflector are background agents that compress conversation history. They need:
- Large context window (128k+ tokens)
- Fast inference (they run on every threshold breach)
- Low cost (they run frequently)

**Choice: `google/gemini-2.5-flash` via OpenRouter.**

This is Mastra's recommended default. It's fast, cheap, and has a large context window. Since we're already routing through OpenRouter for the main agent, using it for OM models keeps the infrastructure simple (one API key, one provider).

Alternative if Gemini has issues: `anthropic/claude-haiku-4-5` — also fast and cheap, slightly more expensive but high quality.

### 4.4 How OM Interacts with Existing Memory

The context window the agent sees, top to bottom:

```
┌─────────────────────────────────────────────────┐
│  SOUL.md content (communication style)          │  ← Dynamic instructions
│  IDENTITY.md content (user context)             │  ← Dynamic instructions
│  BASE_INSTRUCTIONS                              │  ← Dynamic instructions
├─────────────────────────────────────────────────┤
│  Working Memory (resource-scoped)               │  ← Mastra injects as system message
│  "Current focus: Project Falcon, deadline Fri"  │
├─────────────────────────────────────────────────┤
│  OM Reflections (if any)                        │  ← Mastra injects
│  Condensed patterns from old observations       │
├─────────────────────────────────────────────────┤
│  OM Observations                                │  ← Mastra injects
│  "Date: 2026-03-20                              │
│   - 🔴 14:30 User discussed Terraform setup..." │
├─────────────────────────────────────────────────┤
│  Recent message history (last N messages)       │  ← Mastra injects
│  Raw conversation for current task              │
├─────────────────────────────────────────────────┤
│  User's current message                         │
└─────────────────────────────────────────────────┘
```

**Key insight**: OM does NOT replace working memory. They serve different purposes:

| Feature | Scope | Purpose | Content |
|---------|-------|---------|---------|
| Working Memory | Resource (account) | Cross-thread structured state | Priorities, deadlines, active tasks |
| Observational Memory | Thread (conversation) | Long-term conversation recall | Compressed log of what happened |

A user tells the agent about a deadline in Telegram chat A → working memory captures it (visible in chat B). That same conversation gets long → OM compresses it into observations (visible in future messages within chat A). Both are useful, both are retained.

---

## 5. Token Budget Rationale

### 5.1 Default Thresholds

| Threshold | Value | What Happens |
|-----------|-------|--------------|
| `observation.messageTokens` | 30,000 | Observer runs, compresses messages into observations |
| `reflection.observationTokens` | 40,000 | Reflector runs, condenses observations into reflections |
| `observation.previousObserverTokens` | 2,000 | Observer sees ~2k tokens of recent observations for context |

### 5.2 Why Defaults Are Fine for the POC

- Most Telegram conversations won't hit 30k tokens quickly. A typical back-and-forth might generate 500-1000 tokens per exchange. The Observer won't fire until ~30-60 exchanges.
- When it does fire, async buffering (enabled by default in thread scope) means the user doesn't experience any latency.
- The defaults are what Mastra used to achieve 94.87% on LongMemEval. No reason to deviate without evidence.

### 5.3 Cost Implications

OM adds background LLM calls. For a POC with 1-2 users:

- Observer calls: ~once per 30k tokens of conversation. At Gemini 2.5 Flash pricing, this is negligible.
- Reflector calls: ~once per 40k tokens of accumulated observations. Even rarer.
- Total added cost: likely under $0.10/month for POC-scale usage.

Monitor via OpenRouter dashboard. If costs spike unexpectedly, check for runaway Observer loops.

---

## 6. Changes to Mastra Instance Config

The Mastra instance itself needs to use the new storage:

```typescript
// apps/agent/src/mastra/index.ts

import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { sovereignAgent } from './agents/sovereign';

export const mastra = new Mastra({
  agents: { sovereign: sovereignAgent },
  storage: new PostgresStore({
    id: 'sovereign-mastra',
    connectionString: process.env.APP_DATABASE_URL!,
    schemaName: 'mastra',
  }),
});
```

Note: both the Mastra instance-level storage and the agent-level Memory storage point to the same PostgresStore config. This is intentional — Mastra uses one storage for everything.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `apps/agent/src/mastra/index.ts` | Switch storage from `LibSQLStore` to `PostgresStore` with `schemaName: 'mastra'` |
| `apps/agent/src/mastra/agents/sovereign.ts` | Add `observationalMemory` config to Memory options, switch storage to `PostgresStore` |
| `apps/agent/package.json` | Remove `@mastra/libsql`, add `@mastra/pg` |
| `docker-compose.yml` | Remove `MASTRA_DATABASE_URL` from agent service |
| `.env` / `.env.example` | Remove `MASTRA_DATABASE_URL` |

**No changes to**: `packages/shared/*`, `apps/web/*`, `apps/agent/src/identity/*`, `apps/agent/src/accounts/*`, `apps/agent/src/telegram/*`

---

## 8. Build Milestones

### Milestone 2.0 — Storage Migration

- Replace `LibSQLStore` with `PostgresStore` (schemaName: `mastra`) in both Mastra instance and agent Memory
- Remove `@mastra/libsql` dependency, add `@mastra/pg`
- Remove `MASTRA_DATABASE_URL` from env and Docker Compose
- Verify: Mastra auto-creates tables in `mastra` schema
- Verify: Existing Phase 1 functionality still works (send Telegram message, get response, working memory persists)
- **Acceptance**: Agent works exactly as before, but storage is Postgres. `SELECT * FROM mastra.mastra_threads` returns data.

### Milestone 2.1 — Enable Observational Memory

- Add `observationalMemory` config to the agent's Memory options
- Configure with Gemini 2.5 Flash, thread scope, default thresholds
- Verify: Have a long conversation (or simulate one) → observations appear in `mastra.mastra_messages` (or wherever OM stores observations)
- Verify: Working memory still functions alongside OM
- **Acceptance**: After a sufficiently long conversation, the agent recalls details from early in the chat that would have been outside the 15-message window.

### Milestone 2.2 — Deploy & Observe

- Deploy updated agent to Railway
- Use Sovereign normally for daily tasks over 1-2 weeks
- Observe: What does the Observer capture? Are observations useful? Do they miss important context?
- Observe: Does the agent stay on task, or does OM introduce confusion?
- Observe: Any latency impact from Observer/Reflector background calls?
- **Acceptance**: OM is running in production, observations are accumulating, no regressions in agent quality.

---

## 9. Observation Period: What to Watch

After deploying OM, use Sovereign as your daily assistant for 1-2 weeks before speccing Phase 3. This is not idle waiting — it's data collection. Pay attention to:

### 9.1 Observation Quality

- **Are observations capturing the right signal?** Look at the raw observations (query `mastra` schema or use Mastra Studio). Do they capture facts about you, your preferences, your communication style? Or are they mostly summarizing task logistics?
- **Are observations missing important context?** Did you tell the agent something important that it later forgot, despite OM being enabled?
- **Are observations too noisy?** Are they capturing irrelevant details that clutter the context window?

This directly informs Phase 3: if observations are rich with personality signals, the refinement workflow can extract style and identity patterns. If they're mostly task summaries, we may need custom Observer instructions.

### 9.2 Working Memory + OM Interaction

- **Do they complement or conflict?** Working memory holds structured state (priorities, deadlines). OM holds compressed conversation history. Do they ever contradict each other?
- **Is the agent confused by having both?** Does it try to update working memory with information that OM already tracks?
- **Should we simplify?** The OM docs note that "in practical terms, OM replaces both working memory and message history." If OM subsumes what working memory does for us, we might simplify in Phase 3.

### 9.3 Performance & Cost

- **Latency**: Does the agent feel slower after enabling OM? Async buffering should prevent this, but verify.
- **Cost**: Check OpenRouter dashboard. How much are Observer/Reflector calls costing relative to main agent calls?
- **Reliability**: Any errors in the agent logs from OM? Observer timeouts? Reflector failures?

### 9.4 Signals That You're Ready for Phase 3

You're ready to spec the refinement workflow when you can answer:

1. "I've looked at 50+ observations and I know what patterns appear in them" — you understand the shape of the data
2. "The observations contain signals about my communication preferences and identity" — refinement has something to work with
3. "OM is stable in production with no regressions" — the foundation is solid
4. "I have a hypothesis for what the refinement prompt should look for" — you're designing with evidence, not guessing

---

## 10. Smoke Test (Phase 2)

Run after deployment. All Phase 1 smoke test steps must still pass, plus:

```
 1. All Phase 1 smoke tests pass (account creation, linking, personality,
    working memory, multi-user isolation)

 2. Storage migration verified:
    - Query: SELECT schemaname, tablename FROM pg_tables
      WHERE schemaname = 'mastra' → shows Mastra tables
    - Agent responds to Telegram messages (confirms storage works)

 3. Working memory still works after migration:
    - Tell agent "I'm focused on Phase 2, deadline is end of week"
    - New Telegram chat: "what am I working on?" → mentions Phase 2

 4. OM basic functionality:
    - Have a conversation of 20+ back-and-forth messages in one Telegram chat
    - Reference something from early in the conversation
    - Agent recalls it (even if it would have been outside 15-message window)

 5. OM does not interfere with multi-user isolation:
    - Account A has a long conversation → observations generated
    - Account B: "what has been discussed?" → no knowledge of A's conversation

 6. OM does not interfere with personality injection:
    - Update SOUL.md in DB → agent's tone changes in next message
    - OM observations don't override personality directives
```

---

## 11. Open Questions

| # | Question | Status | When to Decide |
|---|----------|--------|----------------|
| 1 | Should Observer use custom instructions to bias toward personality/identity signals? | Open | During observation period — look at default observations first |
| 2 | Will we keep working memory alongside OM long-term, or let OM subsume it? | Open | During observation period — see if they complement or conflict |
| 3 | Switch to resource-scoped OM when it exits experimental? | Open | When Mastra ships stable resource scope + async buffering support |
| 4 | OM model: stick with Gemini Flash or switch to Claude Haiku? | Open | After observing quality of Gemini Flash observations |

---

## 12. What Comes After (Phase 3 Preview)

Phase 3 is the **Personality Refinement Workflow** — the system that reads OM observations and evolves SOUL.md and IDENTITY.md over time. It's explicitly NOT specced here because we need observation data first. But the rough shape is:

1. A scheduled or triggered workflow reads recent OM observations for an account
2. It extracts patterns: communication preferences, recurring topics, identity facts, style signals
3. It loads the current SOUL.md and IDENTITY.md via `PersonalityStore.load()`
4. It produces updated versions and saves them via `PersonalityStore.save()` with a reason like "Refined from observations 2026-03-21 to 2026-03-28"
5. The next message the agent handles picks up the new personality files via `buildInstructions()`

Every interface needed for this already exists. Phase 2's job is to make sure the observations feeding into this pipeline are high quality.

---

## 13. Glossary (Additions to Phase 1)

| Term | Meaning |
|------|---------|
| **Observational Memory (OM)** | Mastra's memory system that compresses conversation history into dense observation logs via background Observer and Reflector agents. |
| **Observer** | Background agent that watches conversations and creates observations — compressed notes about what happened. Runs when message tokens exceed a threshold. |
| **Reflector** | Background agent that condenses observations when they grow too large, combining related items and discarding noise. |
| **Observation** | A single timestamped note created by the Observer. Formatted as a dated log entry with priority markers. |
| **Reflection** | A condensed summary produced by the Reflector from accumulated observations. |
| **Thread scope** | OM scope where each conversation thread has its own independent observations. Default and stable. |
| **Resource scope** | OM scope where observations are shared across all threads for a resource (account). Experimental. |
| **Async buffering** | OM's default mode where observations are pre-computed in the background as conversation grows, activating instantly when the threshold is hit. No conversation pause. |
