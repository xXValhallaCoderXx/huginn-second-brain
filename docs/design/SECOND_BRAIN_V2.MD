# Product Requirements Document (PRD)

# Sovereign — Personal AI Assistant

### Version 3.0 — Expanded Research + Framework Reassessment

### March 2026

---

## 0. What Changed Since V1

This document builds on SECOND_BRAN.MD (V2.0). The following developments triggered a reassessment:

1. **Mastra hit 1.0** (January 2026) and is now at 1.9.x — stable, production-ready, with server adapters, dynamic agent management, and versioning.
2. **Observational Memory (OM)** — Mastra shipped a new SOTA memory system that fundamentally changes how we think about the learning loops from V1. OM achieves 94.87% on LongMemEval with GPT-5-mini, using no RAG, no vector DB for recall — just background Observer + Reflector agents that compress conversation history into dense observations. This replaces a huge chunk of what our custom Loop 1/2/3 were designed to do.
3. **Built-in Auth + RBAC** — Mastra 1.9.0 ships pluggable auth (`@mastra/core/auth`) and RBAC via WorkOS integration. Multi-tenant is now a framework feature, not something we bolt on.
4. **NanoClaw evolved** — Now supports WhatsApp + Telegram + Slack + Discord + Gmail simultaneously, has Agent Swarms (parallel sub-agents), HEARTBEAT.md for scheduled tasks, and container isolation. Much more capable than V1 assessed.
5. **TinyClaw emerged** — A dedicated multi-agent orchestration framework (TinyAGI/tinyclaw) with chain execution, fan-out collaboration, live TUI dashboard, and SQLite message queues. The only claw focused on multi-agent teams.
6. **Anthropic TOS concerns** — Anthropic clarified that using Claude subscription OAuth tokens in third-party products is against TOS for business use. Personal use is fine, but "if you're building a business on top of the Agent SDK, you should use an API key instead." This directly affects any NanoClaw-based product we'd ship to others.

---

## 1. Revised Framework Assessment

### 1.1 The Three Contenders

The V1 decision was Mastra. The user wants us to reassess against NanoClaw (simplicity) and TinyClaw (multi-agent orchestration), including a potential hybrid approach.

### 1.2 Mastra (TypeScript) — The Structured Framework

**What it is:** A full-featured TypeScript agent framework from the Gatsby team. Purpose-built for building AI-powered applications with agents, memory, workflows, vector search, and multi-agent orchestration.

**Current state (March 2026):**
- Version 1.9.0, stable, actively developed (weekly changelogs)
- Server adapters: Hono, Express, Fastify, Koa — drop into existing apps
- Observational Memory: SOTA long-term memory, text-based, no vector DB needed for recall
- Also still has: working memory, semantic recall (RAG), message history
- Built-in auth + RBAC via WorkOS
- Agent networks with supervisor pattern, delegation hooks, tool approval propagation
- Skills marketplace (skills.sh) for extending agents
- Dynamic agent management with versioning and rollback
- requestContext for per-user/per-request configuration
- MCP server authoring — expose agents as MCP tools
- libSQL, PostgreSQL, MongoDB storage providers
- Model routing: 40+ providers via AI SDK v6

**What changed since V1:**
- Observational Memory replaces our custom learning loop design (massive win)
- Auth + RBAC means multi-user path is now a framework feature
- Server adapters mean we don't need a separate Hono setup — Mastra IS the server
- Skills system provides extensibility without custom middleware
- Agent versioning means we can A/B test personality configurations

**Strengths for Sovereign:**
- Model-agnostic (OpenRouter, 195+ models) — critical for BYOK and cost control
- Observational Memory solves the "agent remembers everything" problem natively
- Per-user isolation via resourceId is still a first-class concept
- Auth/RBAC makes shipping to others dramatically simpler
- Full programmatic control over personality, memory, soul in TypeScript
- Vector search in libSQL still available for the knowledge vault / email embeddings

**Weaknesses:**
- Larger framework surface area — more to learn upfront
- Active development means occasional breaking changes (mitigated by 1.0 stability)
- OM's Observer/Reflector use a separate LLM call (cost, but cheap with Gemini Flash)
- Enterprise auth features (`ee/` directory) are source-available, not Apache 2.0

### 1.3 NanoClaw (TypeScript) — The Minimal Agent

**What it is:** A ~500-line TypeScript personal AI assistant built on the Claude Agent SDK. Agents run in isolated Linux containers. Multi-channel messaging via skills.

**Current state (March 2026):**
- Single Node.js process, skill-based channel system
- Channels: WhatsApp, Telegram, Slack, Discord, Gmail — all simultaneously
- Agent Swarms: spawns sub-agents for parallel research, summarisation, and drafting
- HEARTBEAT.md: scheduled tasks defined in markdown — cron-like but human-readable
- Container isolation: Apple Container (macOS), Docker Sandbox (micro VM), Docker (Linux)
- Per-group CLAUDE.md memory files — isolated filesystem per group
- Tools: functions in `src/tools/`, picked up on restart — no SDK, no build step
- Web access via agent-browser skill

**Strengths for Sovereign:**
- Incredibly simple — entire codebase readable in 20 minutes
- Container isolation gives real security (hypervisor-level, not just permission checks)
- HEARTBEAT.md is an elegant pattern for scheduled tasks (morning briefings, nightly reflection)
- Agent Swarms could handle our multi-agent needs (triage, drafting, etc.)
- Tool registration pattern is the gold standard for simplicity
- Fast to prototype — "git clone, claude, /setup — running in 5 minutes"

**Weaknesses for Sovereign:**
- **Anthropic-only** — tightly coupled to Claude Agent SDK, no model routing, no OpenRouter, no BYOK across providers. Users must pay Anthropic directly.
- **No structured memory** — per-group CLAUDE.md files are not vector-searchable. Our second brain vision requires semantic search across email history, calendar, notes. NanoClaw has no answer for this.
- **No RAG pipeline** — no embeddings, no vector store, no similarity search.
- **TOS risk for shipping** — Anthropic's clarified TOS says building a business on the Agent SDK should use API keys, not subscription OAuth tokens. NanoClaw's current auth flow uses Claude Code OAuth. Shipping this as a product creates legal ambiguity.
- **No multi-user isolation** — NanoClaw is single-instance, single-user. Each user needs their own deployment. There's no concept of resourceId or tenant scoping.
- **No observability** — no tracing, no eval framework, no experiment system.

### 1.4 TinyClaw (TinyAGI) — Multi-Agent Orchestration

**What it is:** A multi-agent collaboration framework where specialized agents (@coder, @writer, @reviewer) work as a team. The only claw focused on multi-agent orchestration rather than single-assistant use.

**Current state (March 2026):**
- Multiple AI providers: Anthropic Claude, OpenAI Codex, custom endpoints
- Parallel processing: agents process messages concurrently
- Team collaboration: chain execution (sequential handoffs) and fan-out (parallel distribution)
- SQLite message queue with atomic transactions, retry logic, dead-letter management
- Multi-channel: Discord, WhatsApp, Telegram — shared conversation context
- Live TUI dashboard for real-time team visualisation
- TinyOffice web portal for task board management
- Persistent sessions: conversation context maintained across restarts
- Per-agent isolated workspace and conversation history
- Sender pairing for access control
- Plugin system for extending with custom hooks and event listeners
- tinyclaw-infra: Docker orchestration layer with network isolation

**Strengths for Sovereign:**
- Multi-agent is native — @triage, @calendar, @memory, @drafter as named agents with @ routing
- Chain execution maps perfectly to our pipeline: triage → classify → draft → notify
- Fan-out enables parallel processing (check calendar AND draft reply simultaneously)
- SQLite queue gives reliable message delivery with retry semantics
- Agent isolation — each specialist gets its own context window (avoids context compaction problems)
- TUI dashboard is a nice ops tool for monitoring agent health

**Weaknesses for Sovereign:**
- **No OpenRouter / local model support** — only Anthropic Claude and OpenAI. No free model classification, no BYOK across providers. This breaks our cost model entirely.
- **No structured memory or vector search** — each agent has conversation history, but there's no shared knowledge graph, no embeddings, no second brain.
- **No built-in memory beyond conversation** — no working memory, no semantic recall, no observational memory. Agents can't learn about the user over time.
- **Higher API costs** — multiple agents = multiple concurrent API calls. Running 3-5 agents in parallel burns through tokens fast. Anthropic rate limiting and account flagging are real risks.
- **Not designed for personal assistant use** — TinyClaw's sweet spot is development teams (coder/writer/reviewer), not communication triage / calendar / briefings.
- **No multi-user / multi-tenant** — single team per instance.
- **No auth, no RBAC, no user management.**

### 1.5 The Hybrid: NanoClaw + TinyClaw

**The idea:** Use NanoClaw as the lightweight per-agent runtime (simple, container-isolated, tool-friendly) and TinyClaw as the multi-agent orchestration layer (routing, chains, fan-out, queue).

**Assessment:**

This is architecturally interesting but creates more problems than it solves for Sovereign:

- **Double Anthropic lock-in.** Both depend on Anthropic. No OpenRouter, no BYOK, no free model classification. Our cost model ($5.50/mo infrastructure) is impossible — users would pay $20+/mo just for Claude subscriptions, or significant API costs running multiple agents.
- **No shared memory.** NanoClaw has CLAUDE.md per group. TinyClaw has conversation history per agent. Neither has vector search. The second brain — the entire product thesis — has no home in this stack.
- **TOS compounding.** If one project's Anthropic relationship is uncertain, combining two makes it worse for a shipping product.
- **Operational complexity.** NanoClaw containers + TinyClaw orchestration + a custom vector/memory layer = three systems to maintain instead of one.
- **You'd be building Mastra anyway.** To make this hybrid work for Sovereign, you'd need to add: vector search, embeddings pipeline, structured memory, user isolation, auth, model routing, scheduled workflows, eval framework. At that point you've rebuilt Mastra on top of a more constrained foundation.

**Verdict:** The hybrid is a cool hacking project but wrong for Sovereign's product vision. It optimises for agent simplicity at the expense of the second brain, which is the actual differentiator.

### 1.6 Decision Matrix

| Criterion                      | Mastra       | NanoClaw     | TinyClaw     | Nano+Tiny    |
| ------------------------------ | ------------ | ------------ | ------------ | ------------ |
| Second brain (vector search)   | ✅ Native     | ❌ None       | ❌ None       | ❌ Must build |
| Long-term memory               | ✅ OM + RAG   | ⚠️ CLAUDE.md  | ⚠️ Conv only  | ⚠️ CLAUDE.md  |
| Model-agnostic / BYOK          | ✅ 40+ provs  | ❌ Claude only | ⚠️ Claude+OAI | ❌ Claude only |
| Multi-agent orchestration      | ✅ Networks   | ⚠️ Swarms     | ✅ Native     | ✅ Native     |
| Multi-user / shipping          | ✅ Auth+RBAC  | ❌ Per-inst   | ❌ Per-inst   | ❌ Per-inst   |
| Container isolation            | ❌ Process    | ✅ Native     | ⚠️ Via infra  | ✅ Native     |
| Setup simplicity               | ⚠️ Medium     | ✅ 5 minutes  | ⚠️ Medium     | ❌ Complex    |
| Scheduled tasks                | ✅ Workflows  | ✅ HEARTBEAT  | ⚠️ Via cron   | ✅ HEARTBEAT  |
| Learning / self-improvement    | ✅ OM native  | ❌ Manual     | ❌ None       | ❌ Must build |
| Cost model (MVP)               | ✅ ~$5.50/mo  | ⚠️ $20+/mo   | ⚠️ API costs  | ❌ High       |
| TOS risk for shipping          | ✅ Clean      | ⚠️ Unclear    | ✅ API keys   | ⚠️ Unclear    |
| Eval / observability           | ✅ Built-in   | ❌ None       | ❌ None       | ❌ None       |
| Developer velocity (TypeScript)| ✅ Full       | ✅ Full       | ⚠️ Config-y   | ⚠️ Split      |

### 1.7 Final Framework Decision

**Mastra remains the correct choice.** The gap has actually widened since V1.

Observational Memory eliminates the need to build custom learning loops. Auth + RBAC eliminates the need to build custom multi-user infrastructure. The second brain vision — semantic search across communication history with personality-aware agents — is only achievable in Mastra without building substantial infrastructure from scratch.

**But borrow these patterns from the claw ecosystem:**

From NanoClaw:
- **HEARTBEAT.md pattern** — Define scheduled tasks in human-readable markdown files. Translate these into Mastra scheduled workflows, but let users define them in markdown rather than code.
- **Tool directory simplicity** — Functions in a `tools/` directory, auto-discovered. Keep Mastra tool registration this simple.
- **CLAUDE.md as UX pattern** — Already captured in V1's personality files (SOUL.md, IDENTITY.md, MEMORY.md), but NanoClaw validates this is a pattern users love. Double down on it.

From TinyClaw:
- **@agent routing** — Users address specific agents with `@triage`, `@calendar`, `@memory`. Natural in Telegram. Map to Mastra agent network delegation.
- **Chain execution + fan-out** — Pipeline patterns. Triage → classify → draft (chain). Simultaneously check calendar AND search memory (fan-out). Model these as Mastra workflow steps.
- **Live dashboard concept** — Not TUI, but the idea of a status view showing agent health, queue depth, recent decisions. Build this into the Plan C web app.

---

## 2. The Observational Memory Game-Changer

### 2.1 Why This Replaces Our Custom Learning Loops

V1 designed three custom learning loops:
- **Loop 1 (Real-time):** Capture signals from every interaction
- **Loop 2 (Nightly):** Reflect on signals, propose SOUL.md/MEMORY.md updates
- **Loop 3 (Weekly):** Deep evaluation, trend analysis, self-improvement hypotheses

Mastra's Observational Memory does Loop 1 and most of Loop 2 **automatically, in real-time, as a framework feature:**

**How OM works:**
1. Every agent response includes its system prompt, recent messages, and injected context in the context window.
2. When message tokens exceed a threshold (default 30K), a background **Observer** agent compresses old messages into dense, dated, prioritised observations.
3. When observations exceed their threshold (default 40K tokens), a background **Reflector** condenses them — combining related items, finding patterns, discarding irrelevant data.
4. The main agent sees these observations in its context. No explicit memory queries. No RAG retrieval. Just a stable, evolving observation log.
5. Async buffering means the agent never pauses — observations are pre-computed in the background.

**What this means for Sovereign:**

| V1 Custom Loop                        | Replaced By                               | Still Need?       |
| ------------------------------------- | ----------------------------------------- | ----------------- |
| Loop 1: Signal capture                | OM Observer — captures signals implicitly  | ❌ Built-in        |
| Loop 2: Nightly reflection            | OM Reflector — runs when thresholds hit    | ⚠️ Partially       |
| Loop 2: Propose SOUL.md updates       | Custom workflow (still needed)             | ✅ Build this      |
| Loop 2: Relationship graph update     | Custom workflow (still needed)             | ✅ Build this      |
| Loop 3: Weekly deep reflection        | Custom workflow (still needed)             | ✅ Build this      |
| Loop 3: Knowledge vault maintenance   | Custom workflow (still needed)             | ✅ Build this      |

**What we still build:**
- A scheduled workflow (Mastra cron) that reviews OM observations and proposes updates to SOUL.md, IDENTITY.md, MEMORY.md. This is simpler than V1's Loop 2 because the raw signal capture is already done — we just need to read the observation log and generate proposals.
- A weekly workflow that does trend analysis across the observation log, generates a weekly summary, and commits knowledge vault changes.
- The morning briefing that surfaces proposed personality updates for user approval.

**Net result:** ~60% of the learning loop complexity is eliminated. What remains is higher-level orchestration that reads from OM's output rather than building the entire signal → reflection → update pipeline from scratch.

### 2.2 Revised Memory Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    THE SECOND BRAIN V2                          │
│                    (Per User, via resourceId)                   │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  OBSERVATIONAL MEMORY (Mastra OM)                         │ │
│  │                                                           │ │
│  │  Automatic, background, text-based:                       │ │
│  │    → Observer compresses conversations into dated notes   │ │
│  │    → Reflector condenses observations over time           │ │
│  │    → Agent always sees relevant context, never bloated    │ │
│  │    → Prompt-cacheable (4-10x cost reduction)              │ │
│  │    → SOTA accuracy (94.87% LongMemEval)                   │ │
│  │                                                           │ │
│  │  Replaces: V1 Loop 1 signal capture + Loop 2 reflection  │ │
│  │  Scoped per: resourceId (user) + threadId (conversation)  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  VECTOR MEMORY (libSQL)                                    │ │
│  │                                                           │ │
│  │  Structured search across all ingested content:            │ │
│  │    → Email content (PII-stripped) + classification         │ │
│  │    → Calendar events + attendee context                    │ │
│  │    → User-created notes from the vault                    │ │
│  │    → Meeting prep context                                 │ │
│  │                                                           │ │
│  │  OM handles conversation memory; vector handles the       │ │
│  │  knowledge corpus. Two systems, complementary roles.      │ │
│  │                                                           │ │
│  │  "What did Sarah say about the budget?" → vector search   │ │
│  │  "Remember I told you I hate morning meetings" → OM       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  PERSONALITY FILES (Markdown — user-editable)              │ │
│  │                                                           │ │
│  │  SOUL.md     — Communication style, tone, values          │ │
│  │  IDENTITY.md — Who the user is, roles, relationships      │ │
│  │  MEMORY.md   — Key facts, preferences, standing context   │ │
│  │                                                           │ │
│  │  Injected into agent system prompts.                      │ │
│  │  User can view/edit. Agent proposes updates (via OM        │ │
│  │  observations → scheduled refinement workflow).            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  KNOWLEDGE VAULT (Markdown + Git)                          │ │
│  │                                                           │ │
│  │  Same as V1 — Obsidian-compatible, Git-versioned.          │ │
│  │  Vault content also embedded into vector memory.           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  RELATIONSHIP GRAPH (libSQL relational)                    │ │
│  │                                                           │ │
│  │  Same as V1 — contacts, interaction patterns, importance. │ │
│  │  Fed by OM observations (the agent notices who matters    │ │
│  │  without us building explicit signal capture).             │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 OM Configuration for Sovereign

```typescript
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

const sovereignMemory = new Memory({
  storage: new LibSQLStore({
    url: process.env.LIBSQL_URL, // per-user database
  }),
  options: {
    observationalMemory: {
      // Use a cheap, fast model for observation/reflection
      // Gemini Flash has 1M context — plenty for reflector
      model: "google/gemini-2.5-flash",
    },
    // Also keep working memory for persistent structured data
    workingMemory: true,
    // Semantic recall for querying the email/calendar corpus
    semanticRecall: {
      topK: 10,
      messageRange: { before: 2, after: 2 },
    },
  },
});
```

This single configuration gives us:
- **Automatic conversation compression** (OM) — the agent remembers everything without context bloat
- **Working memory** — persistent user preferences, current task state
- **Semantic recall** — RAG-style retrieval from the email/calendar vector store
- **All scoped per resourceId** — multi-user ready from day one

---

## 3. Single-Player to Multi-User: Updated Path

### 3.1 Why This Is Easier Now

V1 estimated multi-user as "configuration, not refactoring." That was true, but now it's even simpler because Mastra 1.9.0 ships with pluggable auth and RBAC out of the box.

**New: Mastra Auth + RBAC (via WorkOS)**

```typescript
import { Mastra } from "@mastra/core";
import { MastraAuthWorkos, MastraRBACWorkos } from "@mastra/auth-workos";

const mastra = new Mastra({
  server: {
    auth: new MastraAuthWorkos({
      apiKey: process.env.WORKOS_API_KEY,
      clientId: process.env.WORKOS_CLIENT_ID,
    }),
    rbac: new MastraRBACWorkos({
      apiKey: process.env.WORKOS_API_KEY,
      clientId: process.env.WORKOS_CLIENT_ID,
      roleMapping: {
        admin: ["*"],
        user: ["agents:read", "agents:generate", "memory:*"],
      },
    }),
  },
});
```

This gives us SSO, role management, and permission enforcement across all Mastra server endpoints — automatically.

**New: requestContext for per-user configuration**

```typescript
const sovereignAgent = new Agent({
  name: "sovereign",
  // Dynamic instructions based on authenticated user
  instructions: ({ requestContext }) => {
    const userId = requestContext.get("userId");
    const soulMd = loadUserFile(userId, "SOUL.md");
    const identityMd = loadUserFile(userId, "IDENTITY.md");
    return `${soulMd}\n\n${identityMd}\n\nYou are Sovereign...`;
  },
  // Dynamic memory based on user tier
  memory: ({ requestContext }) => {
    const tier = requestContext.get("user-tier");
    return tier === "pro" ? proMemory : standardMemory;
  },
});
```

### 3.2 The Decision: Ship to Others or Stay Single-Player?

**Recommendation: Build single-player MVP, design for multi-user, defer the auth layer.**

Here's why this is the right call:

**Arguments for staying single-player (MVP):**
- Zero auth infrastructure to build, test, or maintain
- No user management, onboarding, or billing to design
- All development energy goes into making the agent genuinely useful
- You validate the product thesis before investing in distribution
- Hardcoded `resourceId = "nate"` is the simplest possible code path

**Arguments for designing multi-user from the start:**
- Mastra's resourceId scoping means isolation is free — you're already doing it
- The personality file structure (`/users/{id}/SOUL.md`) is trivial to implement
- If you validate the product and want to ship, the auth layer is a 1-2 week addition, not a rewrite
- WorkOS integration is ~50 lines of config

**What this means practically:**

In MVP code, you do this:
```typescript
const RESOURCE_ID = "nate"; // hardcoded for now
```

But you structure everything as if resourceId comes from auth:
- Personality files live in `/data/users/{resourceId}/SOUL.md`
- libSQL databases are per-user: `/data/users/{resourceId}/sovereign.db`
- Vault directories are per-user: `/data/users/{resourceId}/vault/`
- All Mastra memory calls pass resourceId

When you're ready to ship:
1. Add WorkOS auth (~50 lines of Mastra config)
2. Change `RESOURCE_ID` from hardcoded to `authenticatedUser.id`
3. Add a Telegram bot registration flow (new users create their own bot, or you run a multi-user bot with chat ID → resourceId mapping)
4. Add BYOK flow (users provide their own OpenRouter key)

**Estimated effort to go multi-user: 1-2 weeks.** Not a rewrite. Not even a significant refactor. Just add an auth layer and swap the resourceId source.

### 3.3 Multi-User Cost Model

| Component              | Per-User Cost    | Who Pays       |
| ---------------------- | ---------------- | -------------- |
| VPS compute            | ~$0.10/mo        | You (shared)   |
| libSQL storage         | ~$0.01/mo        | You (shared)   |
| OpenRouter inference   | Varies           | User (BYOK)    |
| OM background models   | ~$0.50/mo        | You or user    |
| Gmail/Calendar API     | $0               | Free tier      |

At 100 users on a single 4GB VPS: ~$15/mo infrastructure. Charge $8-12/mo per user for Pro tier = $800-1200 MRR on $15/mo cost.

The OM background models (Observer/Reflector) are the new cost to factor. Using Gemini Flash, this is roughly $0.50/mo per active user based on typical conversation volume. Negligible.

---

## 4. Revised Architecture

### 4.1 What Changed From V1

| Component                | V1                                  | V2 (This Document)                                     |
| ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| Agent memory             | Custom vector-only + learning loops | OM + vector + working memory (Mastra native)            |
| Learning Loop 1          | Custom signal logger middleware     | OM Observer (automatic, background)                     |
| Learning Loop 2          | Custom Inngest cron + LLM pipeline  | OM Reflector + lightweight personality refinement cron   |
| Learning Loop 3          | Custom weekly deep reflection       | Scheduled Mastra workflow (simplified)                   |
| Server framework         | Hono (separate from Mastra)         | Mastra server adapter for Hono (integrated)              |
| Auth                     | "Add later" hand-wave               | Mastra auth + RBAC via WorkOS (concrete path)            |
| Multi-agent              | Mastra supervisor (conceptual)      | Mastra agent network + borrowed TinyClaw routing patterns|
| Scheduled tasks          | Inngest cron                        | Mastra scheduled workflows + HEARTBEAT.md-inspired config|
| Personality updates      | Fully custom pipeline               | OM observations → refinement workflow → user approval    |
| Eval / quality tracking  | None planned                        | Mastra experiments + datasets (built-in)                 |

### 4.2 Updated System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     INPUT CHANNELS                             │
│                                                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  Telegram   │  │  Slack     │  │  Web App   │  ...more     │
│  │  (MVP)      │  │  (Plan C)  │  │  (Plan C)  │              │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘              │
│         └───────────────┼───────────────┘                      │
│                         │                                      │
│                         ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              CHANNEL ADAPTER LAYER                        │ │
│  │  (Same as V1 — normalise inbound/outbound)                │ │
│  └──────────────────────┬───────────────────────────────────┘ │
└─────────────────────────┼──────────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────────┐
│                  MASTRA SERVER (Hono adapter)                    │
│                  (Hetzner CX22 — $4.50/mo)                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              PROCESSING PIPELINE                           │ │
│  │                                                            │ │
│  │  inbound message                                           │ │
│  │    → [Channel Adapter]                                     │ │
│  │    → [Auth + Rate Limit]   ← Mastra auth (WorkOS)         │ │
│  │    → [Intent Router]       ← @agent routing (TinyClaw-y)  │ │
│  │    → [Privacy Gateway]     ← PII strip, tier routing       │ │
│  │    → [Agent Network]       ← Mastra multi-agent execution  │ │
│  │    → [Response Formatter]                                  │ │
│  │    → [Channel Adapter] → outbound                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              AGENT NETWORK (Mastra)                        │ │
│  │                                                            │ │
│  │  Supervisor: @sovereign (routes to specialists)            │ │
│  │                                                            │ │
│  │  @triage    — email classification, priority scoring       │ │
│  │  @calendar  — scheduling, conflict detection               │ │
│  │  @memory    — knowledge queries, vault search              │ │
│  │  @briefing  — daily/weekly summaries                       │ │
│  │  @drafter   — response drafting in user's voice            │ │
│  │  @reminder  — proactive nudges, follow-up tracking         │ │
│  │                                                            │ │
│  │  All agents share: OM memory (per resourceId)              │ │
│  │  All agents see: personality files (SOUL.md etc.)          │ │
│  │  Delegation: supervisor → specialist → response            │ │
│  │                                                            │ │
│  │  Inspired by TinyClaw @routing but with Mastra's           │ │
│  │  delegation hooks, tool approval, and context filtering.   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              MEMORY LAYER (Per User)                       │ │
│  │                                                            │ │
│  │  Observational Memory  — conversation intelligence (auto)  │ │
│  │  Vector Memory (libSQL) — email/calendar/notes corpus      │ │
│  │  Working Memory        — persistent preferences/state      │ │
│  │  Personality Files     — SOUL.md, IDENTITY.md, MEMORY.md  │ │
│  │  Knowledge Vault       — Markdown + Git, Obsidian-compat  │ │
│  │  Relationship Graph    — contacts, patterns, importance    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              SCHEDULED WORKFLOWS                           │ │
│  │                                                            │ │
│  │  Morning briefing    — daily summary + proposed updates    │ │
│  │  Personality refine  — read OM observations → propose      │ │
│  │                        updates to SOUL.md/MEMORY.md        │ │
│  │  Weekly reflection   — trend analysis, self-evaluation     │ │
│  │  Vault maintenance   — archive stale, commit changes       │ │
│  │                                                            │ │
│  │  Defined via HEARTBEAT.md-style config (human-readable)    │ │
│  │  Executed as Mastra scheduled workflows                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              PRIVACY GATEWAY (Same as V1)                  │ │
│  │                                                            │ │
│  │  Tier 1 — Metadata only (local, no LLM)                   │ │
│  │  Tier 2 — PII-stripped + cheap model (ZDR)                 │ │
│  │  Tier 3 — Full content (explicit user opt-in, ZDR)         │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Revised Technology Stack (MVP)

| Layer               | Technology                                       | Change from V1                                             |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Input channel       | Telegram Bot API via grammY                      | No change                                                  |
| Application server  | Mastra server (Hono adapter)                     | **Changed:** Hono integrated via Mastra adapter, not separate |
| Agent framework     | Mastra 1.9.x                                     | **Updated:** 1.0+ stable, OM, auth, skills                 |
| Agent memory        | Mastra OM + semantic recall + working memory     | **Changed:** OM replaces custom learning loops              |
| Agent orchestration | Mastra agent networks                            | **Updated:** delegation hooks, tool approval propagation    |
| Personality layer   | SOUL.md, IDENTITY.md, MEMORY.md                  | No change (validated by NanoClaw's CLAUDE.md pattern)       |
| Scheduled tasks     | Mastra scheduled workflows                       | **Changed:** replaces Inngest. HEARTBEAT.md-style config    |
| PII stripping       | Scrubadub (Python)                               | No change                                                  |
| LLM routing         | Mastra model router (OpenRouter + AI SDK v6)     | **Updated:** v6 support, 40+ providers                      |
| Database + vectors  | libSQL (Mastra storage provider)                 | No change                                                  |
| Knowledge vault     | Markdown + Git                                   | No change                                                  |
| Email               | Gmail API (OAuth2)                               | No change                                                  |
| Calendar            | Google Calendar API (OAuth2)                     | No change                                                  |
| Hosting             | Hetzner CX22 (4GB, $4.50/mo)                    | No change                                                  |
| Domain + SSL        | Cloudflare                                       | No change                                                  |
| Auth (when needed)  | Mastra auth + RBAC via WorkOS                    | **New:** concrete multi-user path                           |
| Eval / quality      | Mastra experiments + datasets                    | **New:** built-in quality tracking                          |

---

## 5. Revised Sprint Plan

### 5.1 Sprint 0 (Week 1): The Brain POC — With OM

**Goal:** Same as V1 — prove the second brain works. But now with OM, the memory layer is dramatically simpler to set up.

**Features:**
- Hetzner VPS provisioning
- Mastra project setup with Hono server adapter + libSQL storage
- OpenRouter integration via Mastra model router
- **Configure OM with Gemini Flash** — conversation memory working from day one
- Gmail API OAuth2: fetch last 30 days of email
- Scrubadub PII stripping pipeline
- Embed all email content (PII-stripped) into libSQL vector store (for corpus search)
- Create SOUL.md, IDENTITY.md, MEMORY.md for yourself
- Single Mastra agent with personality injection + OM + semantic recall
- Telegram bot (grammY) connected to this agent
- Ask it questions about your email history AND have it remember your conversation context automatically

**What's different from V1 Sprint 0:**
- OM gives you automatic conversation memory — the agent remembers what you discussed across sessions without any custom code.
- Semantic recall gives you RAG over the email corpus.
- Combined: you get both "What did Sarah say about the budget?" (vector search) AND "Remember, I told you earlier I'm working on Project Falcon" (OM) out of the box.

### 5.2 Sprint 1 (Weeks 2-3): Email Triage + Notifications

Same as V1, but with these additions:
- OM is already running — every triage interaction feeds the observation log
- No need for a separate signal logger middleware (OM captures this)
- Agent network setup: @sovereign supervisor + @triage specialist (first specialist)
- Privacy gateway as Mastra middleware

### 5.3 Sprint 2 (Weeks 4-5): Calendar + Briefings + Drafting

Same as V1, plus:
- Morning briefing now also surfaces OM-derived insights: "I've noticed you usually reply to Sarah quickly — you have an unread email from her that's 4 hours old."
- @calendar, @briefing, @drafter agents join the network
- HEARTBEAT.md-style config for morning briefing schedule

### 5.4 Sprint 3 (Weeks 6-7): Multi-Agent + Proactive + Personality Refinement

**Changed from V1:**
- Multi-agent network fully active: @triage, @calendar, @memory, @briefing, @drafter, @reminder
- **Personality refinement workflow** (replaces V1 Loop 2):
  - Scheduled Mastra workflow runs nightly
  - Reads OM observation log for the current user
  - LLM call: "Based on these observations, what should I update in SOUL.md / MEMORY.md?"
  - Generates proposed diffs
  - Queues for morning briefing approval
  - This is ~100 lines of code instead of the ~500+ lines V1's full Loop 2 required
- **Weekly reflection workflow** (simplified V1 Loop 3):
  - Reads week's personality refinement outputs + OM reflections
  - Generates weekly summary and trend analysis
  - Commits vault changes to Git
- Relationship graph: populated from OM observations (the agent's observation log naturally mentions who it interacted with and how)
- Mastra experiments: set up basic eval tracking for classification accuracy

### 5.5 Sprint 4 (Weeks 8-10): Polish + Internal Testing

Same as V1, plus:
- **If validation is strong:** Add WorkOS auth + multi-user in the last 2 weeks
- **If validation is mixed:** Stay single-player, focus on quality
- Mastra eval experiments to track classification accuracy over time
- OM-aware personality updates are now a daily habit — agent proposes, user approves

---

## 6. Updated Risk Register

| Risk                                                 | Likelihood | Impact   | Mitigation                                                                                                                                                      | New? |
| ---------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Gmail API quota limits                               | Medium     | High     | Same as V1 — push notifications, quota increase                                                                                                                | No   |
| OpenRouter free model rate limits                    | Medium     | Medium   | Same as V1 — Haiku fallback, caching, batching                                                                                                                 | No   |
| Mastra framework instability                         | **Low**    | Medium   | **Reduced:** 1.0+ stable, weekly releases, large community. Worst case still fork.                                                                              | ↓    |
| Google OAuth verification delays                     | High       | High     | Same as V1 — start early, use testing mode                                                                                                                     | No   |
| OM background model costs                            | Low        | Low      | **New:** Gemini Flash is cheap. ~$0.50/mo/user. Monitor token usage.                                                                                            | Yes  |
| OM observation quality degradation                   | Low        | Medium   | **New:** If Observer produces bad observations, agent performance degrades. Mitigate: use Mastra experiments to track quality metrics. Switch OM model if needed. | Yes  |
| Anthropic TOS changes affecting ecosystem            | Medium     | Low      | **New:** Sovereign doesn't depend on Claude Agent SDK. BYOK + OpenRouter = provider-agnostic. We're insulated.                                                   | Yes  |
| WorkOS pricing for multi-user                        | Low        | Medium   | **New:** WorkOS free tier supports up to 1M MAU. Only becomes relevant at significant scale.                                                                     | Yes  |
| Single VPS failure                                   | Medium     | High     | Same as V1 — automated backups, IaC                                                                                                                            | No   |

---

## 7. Sources (New)

- [Mastra 1.0 Changelog](https://mastra.ai/blog/changelog-2026-01-20)
- [Mastra 1.9.0 Changelog — Auth + RBAC](https://mastra.ai/blog/changelog-2026-03-04)
- [Mastra Observational Memory Docs](https://mastra.ai/docs/memory/observational-memory)
- [Mastra OM Announcement Blog](https://mastra.ai/blog/observational-memory)
- [Mastra OM Research — 95% LongMemEval](https://mastra.ai/research/observational-memory)
- [VentureBeat: OM Cuts Agent Costs 10x](https://venturebeat.com/data/observational-memory-cuts-ai-agent-costs-10x-and-outscores-rag-on-long)
- [NanoClaw GitHub](https://github.com/qwibitai/nanoclaw)
- [NanoClaw Official Site](https://nanoclaws.io/)
- [TinyClaw (TinyAGI) GitHub](https://github.com/TinyAGI/tinyclaw)
- [TinyClaw Setup Guide](https://tinyclawguide.com/)
- [TinyClaw + ClawRouter Analysis](https://sonusahani.com/blogs/tinyclaw-clawrouter)
- [OpenClaw Alternatives Comparison](https://udit.co/blog/openclaw-alternative)
- [Anthropic Agent SDK TOS Clarification](https://thenewstack.io/anthropic-agent-sdk-confusion/)
- [Claude Agent SDK Reference](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Mastra Agent Memory Docs](https://mastra.ai/docs/agents/agent-memory)
- [Mastra Skills System](https://mastra.ai/blog/changelog-2026-02-04)

All V1 sources remain valid and are not repeated here.
