# Mastra Identity System PRD

Defines how Sovereign learns, stores, and evolves its understanding of the user through personality files, observational memory, working memory, and scheduled refinement workflows.

## 1. Problem

The current generic agent has no identity — it doesn't know who the user is, how they communicate, or what matters to them. Every conversation starts from zero. The goal is an agent that:

- Has a distinct personality and communication style from day one (seeded by the user)
- Learns the user's preferences, relationships, and patterns automatically from conversations
- Proposes updates to its own understanding and gets user approval
- Maintains a git-versioned history of how its understanding evolved

## 2. Current State

- `genericAgent` uses static string instructions and bare `new Memory()`
- No personality files exist
- No OM configured (default Memory has no observationalMemory, no workingMemory)
- Telegram bot hardcodes `resource: telegram-chat:{chatId}` — no stable user identity
- No scheduled workflows exist

## 3. Identity Architecture

### 3.1 Three Personality Files (Filesystem)

Stored at `.data/users/{resourceId}/`:

**SOUL.md** — How the agent communicates

- Tone, formality, humor, pet peeves
- Response length preferences
- What to avoid (corporate speak, over-apologizing, etc.)
- Scoped style rules (formal with work contacts, casual solo)

**IDENTITY.md** — Who the user is

- Name, roles, key relationships (with context)
- Active projects, employer, team
- Time zone, location, daily schedule patterns

**MEMORY.md** — Standing context that changes often

- Current priorities and deadlines
- Recent decisions and their rationale
- Active threads to track (waiting on X from Y)
- Temporary context (traveling next week, on PTO, etc.)

These are plain markdown, human-editable, git-versioned. The agent reads them; the refinement workflow proposes changes; the user approves.

### 3.2 Why Three Files Instead of One

- Different change velocities: SOUL.md changes rarely (weeks/months), MEMORY.md changes daily/weekly, IDENTITY.md changes when life changes
- Different approval thresholds: SOUL.md changes should always require approval (communication style is sensitive), MEMORY.md factual updates can auto-apply with notification
- Easier to review diffs: a MEMORY.md commit is "added Project Falcon deadline" not a wall of unrelated changes

### 3.3 File Format Guidelines

Each file should:

- Be ≤50 lines at steady state (the agent's context window shouldn't bloat)
- Use flat markdown (headings + bullet points, no deep nesting)
- Avoid vague statements (not "be helpful" — instead "prefer 2-3 sentence answers unless asked to elaborate")
- Include concrete examples where useful ("when I say 'brief me' I mean 3-5 bullet points max")

## 4. Memory Stack

Four complementary systems, each with a distinct role:

### 4.1 Observational Memory (automatic, background)

Mastra OM with `resource` scope (experimental but appropriate for single-user MVP).
OM handles what we previously called Loop 1 (signal capture) and most of Loop 2 (reflection).

**Configuration approach:**

```typescript
Memory({
  options: {
    observationalMemory: {
      model: 'openrouter/google/gemini-2.5-flash',
      scope: 'resource',
      observation: {
        instruction: 'Focus on: communication preferences, relationship dynamics, scheduling patterns, emotional tone shifts, stated priorities and deadlines. Deprioritize: small talk, weather, transient logistics.',
        messageTokens: 30_000,
      },
      reflection: {
        instruction: 'When consolidating, group by: user preferences, relationships, active projects, recurring patterns. Preserve specific dates, names, and stated preferences. Flag contradictions rather than resolving them silently.',
        observationTokens: 40_000,
      },
    },
  },
})
```

Key decisions:

- `scope: 'resource'` shares observations across all threads for the same user. This means the agent remembers context from one Telegram chat when talking in another. Appropriate for single-user, but async buffering is auto-disabled in resource scope.
- Custom `observation.instruction` focuses the Observer on identity-relevant signals rather than generic conversation summaries.
- Custom `reflection.instruction` guides the Reflector to organize by the categories that matter for personality refinement.

### 4.2 Working Memory (structured, persistent)

Resource-scoped working memory for small, always-available structured data that the agent reads on every turn.

**Template approach (markdown):**

```typescript
workingMemory: {
  enabled: true,
  scope: 'resource',
  template: `# Active Context
- Current date/time awareness: [auto-updated]
- Current priority: [what the user is focused on right now]
- Pending approvals: [list of proposed personality updates awaiting review]
- Last briefing: [date and key items from most recent morning briefing]
- Active follow-ups: [things the agent is tracking proactively]
`
}
```

Working memory is the agent's scratchpad for transient operational state. It's distinct from MEMORY.md (which is user-facing and human-editable) — working memory is agent-internal.

### 4.3 Personality File Injection (dynamic instructions)

The `instructions` field on the Agent accepts a function with `requestContext`. On every call, load the three personality files from disk and compose the system prompt:

```typescript
instructions: async ({ requestContext }) => {
  const resourceId = getResourceId(requestContext);
  const soul = await loadPersonalityFile(resourceId, 'SOUL');
  const identity = await loadPersonalityFile(resourceId, 'IDENTITY');
  const memory = await loadPersonalityFile(resourceId, 'MEMORY');
  return [
    soul,
    identity,
    memory,
    SOVEREIGN_BASE_INSTRUCTIONS,
  ].filter(Boolean).join('\n\n---\n\n');
}
```

This means personality file changes take effect on the very next message — no restart needed.

### 4.4 Semantic Recall (vector search for knowledge corpus)

Not part of the identity system directly, but will be added in the email/calendar sprint. Mentioned here for completeness — semantic recall queries the vector store (email content, calendar events, vault notes), while OM handles conversation memory. Two systems, complementary.

## 5. The Learning Loop

### 5.1 What Learns Automatically (OM)

OM Observer and Reflector run in background. No code needed beyond config. They capture:

- User preferences stated in conversation ("I hate long emails")
- Relationship context ("Sarah is my manager", "met John at the conference")
- Emotional signals (frustration with verbose answers, satisfaction with bullet points)
- Project/deadline mentions
- Scheduling patterns ("I'm always in meetings Tuesday mornings")

This data lives in the OM observation log, visible to the agent on every turn.

### 5.2 What Requires a Refinement Workflow (custom)

OM observations are raw signal. The refinement workflow is the interpretive layer that proposes structured changes to personality files.

**Nightly refinement workflow:**

1. Read OM observation log for the user (via Mastra memory API)
2. Read current SOUL.md, IDENTITY.md, MEMORY.md
3. LLM call: "Given these recent observations and the current personality files, propose specific updates. Return structured diffs."
4. Store proposals in a `personality_proposals` table (libSQL):
   - `id`, `resourceId`, `file` (SOUL|IDENTITY|MEMORY), `current_content`, `proposed_content`, `rationale`, `confidence`, `status` (pending|approved|rejected), `created_at`
5. For MEMORY.md changes with high confidence (factual additions like new projects, deadlines): auto-apply and notify
6. For SOUL.md and IDENTITY.md changes: queue for morning briefing approval

**Refinement prompt design (critical):**

The prompt must:

- Distinguish signal from noise (not every casual remark is a preference)
- Require evidence ("Based on observations from March 12 and March 14 where the user...")
- Propose minimal, targeted diffs (not rewrite the whole file)
- Flag contradictions ("User said they prefer formal tone on March 1, but was very casual on March 10 — possible context-dependent preference")
- Respect the 50-line steady-state guideline

### 5.3 Approval Flow

The morning briefing (Sprint 2) is the natural approval surface. Until then, a simpler Telegram-based flow:

1. After nightly refinement runs, if there are pending proposals:
2. Send Telegram message: "I have {n} proposed updates to my understanding of you. Want to review?"
3. User taps review → agent sends each proposal with rationale and diff
4. User replies approve/reject/edit for each
5. Approved changes are applied to the filesystem file, committed to git

Implementation: Telegram inline keyboard buttons (grammY supports these) for approve/reject. Edit requires a text reply.

### 5.4 Git Versioning

Every approved personality file change is a git commit:

- Commit message: `[sovereign] Update {file}: {rationale summary}`
- The `.data/users/{resourceId}/` directory is a git-tracked subtree
- `git log .data/users/nate/SOUL.md` shows the identity evolution timeline
- User can revert any change: `git revert {hash}`

For MVP: use simple `child_process` git commands in Node. No need for a git library.

## 6. Implementation Modules

### 6.1 Personality File Loader (`src/identity/loader.ts`)

- `loadPersonalityFile(resourceId, file)` → reads from `.data/users/{resourceId}/{file}.md`, returns content or empty string if missing
- `writePersonalityFile(resourceId, file, content)` → writes file, ensures directory exists
- `getPersonalityDir(resourceId)` → returns resolved path
- File reads should be cached in-memory with a short TTL (e.g. 30s) or use `fs.watch` for invalidation, since they're read on every agent call

### 6.2 Sovereign Agent (`src/mastra/agents/sovereign-agent.ts`)

Replaces `genericAgent` as the primary agent. Uses dynamic instructions from personality files. Configured with OM + working memory.

### 6.3 Memory Configuration (`src/identity/memory.ts`)

Shared Memory instance with OM, working memory, and (later) semantic recall. Used by all agents in the network.

### 6.4 Refinement Workflow (`src/mastra/workflows/personality-refinement.ts`)

Mastra scheduled workflow. Steps:

1. `readObservations` — pull OM log for the resourceId
2. `readPersonalityFiles` — load current SOUL/IDENTITY/MEMORY
3. `generateProposals` — LLM call to produce structured diffs
4. `storeProposals` — persist to `personality_proposals` table
5. `autoApplyMemory` — auto-apply high-confidence MEMORY.md updates
6. `notifyUser` — send Telegram notification about pending proposals

### 6.5 Proposal Store (`src/identity/proposals.ts`)

Simple libSQL table for tracking proposals. Schema:

- `id` TEXT PRIMARY KEY
- `resource_id` TEXT
- `file` TEXT (SOUL|IDENTITY|MEMORY)
- `current_content` TEXT
- `proposed_content` TEXT
- `rationale` TEXT
- `confidence` REAL
- `status` TEXT (pending|approved|rejected)
- `created_at` TEXT
- `resolved_at` TEXT

### 6.6 Git Integration (`src/identity/git.ts`)

- `commitPersonalityChange(resourceId, file, message)` — stage + commit the changed file
- `getPersonalityHistory(resourceId, file)` — return recent commit log
- `revertPersonalityChange(resourceId, commitHash)` — git revert

## 7. Resource ID Strategy

For MVP (single-user): hardcoded `resourceId = 'nate'`.

The Telegram bot currently uses `telegram-chat:{chatId}` as both resource and thread. This should change to:

- `resource`: `'nate'` (the user, constant across all chats)
- `thread`: `telegram-chat:{chatId}` (the conversation, unique per chat)

This enables resource-scoped OM and working memory to work across multiple Telegram chats (e.g. different group chats, private chat) while maintaining a single identity.

## 8. Open Questions

1. **OM resource scope stability** — resource scope is marked experimental. Should we start with thread scope and upgrade later, or go resource scope from day one since we're single-user?
2. **Working memory vs MEMORY.md overlap** — working memory is agent-internal scratchpad, MEMORY.md is user-facing standing context. Is this distinction clear enough, or will they drift into duplication?
3. **Observer instruction tuning** — how aggressive should the Observer be in capturing personality-relevant signals? Too aggressive = noise, too conservative = misses patterns. Needs experimentation.
4. **Refinement frequency** — nightly is the PRD default. Should it run more often for the first week (to bootstrap identity faster) then taper to nightly?
5. **File size management** — what happens when MEMORY.md grows past 50 lines? Auto-archive old items? Propose deletions in refinement?

## 9. Phased Delivery

**Phase 1 (now):** Personality files + loader + Sovereign agent with dynamic instructions. No OM yet, no refinement. Just get the personality injection working and start talking to a version of Sovereign that knows who you are.

**Phase 2 (next):** OM configuration + working memory. Agent starts remembering across conversations automatically. Manual personality file edits still the only update path.

**Phase 3 (after email sprint):** Refinement workflow + proposal store + approval flow + git versioning. The agent proposes its own personality updates. The learning loop closes.
