# Sovereign Learning Engine — System Design (Final)

> Merged architecture for Sovereign's self-improving personality system.
> Supersedes: `LEARNING-MODULE-PLAN.md`, `SYSTEM-DESIGN-LEARNING-ENGINE.md`

---

## 1. Core Idea

A generic **learning loop engine** that any "aspect" of the agent can plug into.
Personality, writing style, project context, tool preferences — all use the
same engine with different configurations.

The engine is **event-driven** (not scheduled), **eval-gated** (changes must
pass a quality bar), and **budget-aware** (each aspect has a token limit for
what it injects into the system prompt).

```
┌─────────────────────────────────────────────────────┐
│              Learning Engine (generic)                │
│                                                     │
│  Input:  signals (detected cheaply from conversation)│
│  Gate 1: triage (single cheap LLM call: worth it?)  │
│  Core:   draft → score → refine loop (strong LLM)   │
│  Gate 2: backtest (A/B test on real messages)        │
│  Output: improved artifact (markdown file, config)   │
│                                                     │
│  The engine doesn't know what it's improving.       │
│  It just runs the loop.                             │
└─────────────────────────────────────────────────────┘
```

---

## 2. Why Not "Every X Messages"

Running a full refinement loop on a fixed cadence is:

- **Expensive** — 3–9+ LLM calls per cycle (draft × iterations × LLM-based scorers)
- **Wasteful** — most cycles find nothing new, especially for established users
- **Fragile** — hard to pick the right N; too low = expensive, too high = slow learning

| Scenario                                      | Messages | New signal?     | Should refine? |
| --------------------------------------------- | -------- | --------------- | -------------- |
| Casual chat for a week                        | 200      | 3 weak signals  | Probably not   |
| Deep conversation about role, projects, style | 15       | 8 dense signals | Yes            |
| Daily "what's the weather"                    | 100      | 0 signals       | No             |

Better approach: **event-driven with a triage gate**. Only spend when there's
real signal to learn from.

---

## 3. Architecture

```
Conversations
     │
     ▼
┌──────────────┐
│  OM Observer  │  ← already watching every conversation (Mastra built-in)
│  (real-time)  │     custom observer instruction tags personality signals
└──────┬───────┘
       │ observations (some tagged as signals)
       ▼
┌──────────────┐
│   Signal      │  ← lightweight: counts signals, NO LLM calls
│  Accumulator  │     pattern matching on OM tags + message heuristics
└──────┬───────┘
       │ threshold reached for an aspect
       ▼
┌──────────────┐
│  Triage Gate  │  ← ONE cheap LLM call: "is there enough here to learn?"
│  (flash model)│     if NO → reset counter, cost: ~$0.001
└──────┬───────┘
       │ YES
       ▼
┌──────────────┐
│  Learning     │  ← full GATHER → DRAFT → SCORE ↺ → COMMIT loop
│  Loop         │     uses .dountil() — Mastra's native loop primitive
│ (strong model)│     max 3 iterations, then abort
└──────┬───────┘
       │ scored candidate (composite ≥ threshold)
       ▼
┌──────────────┐
│  Backtest     │  ← A/B test: generate responses with old vs new personality
│  (optional)   │     LLM-as-judge picks winner. New wins → commit. Old wins → discard.
└──────┬───────┘
       │ passed all gates
       ▼
┌──────────────┐
│  Personality  │  ← versioned store (already exists)
│  Store        │     personality_file_history captures every change + score + reason
└──────────────┘
```

---

## 4. Layer-by-Layer Breakdown

### 4.1 OM Observer (existing, enhanced)

Mastra's Observational Memory already watches conversations and compresses
them into dated observations. We add a custom `observation.instruction` to
tag personality-relevant signals:

```typescript
observationalMemory: {
  model: 'google/gemini-2.5-flash',
  scope: 'resource',  // cross-conversation, per user
  observation: {
    instruction: `In addition to your normal observations, tag any of
      these with a [SIGNAL:TYPE] prefix:
      [SIGNAL:FACT] - user stated something about themselves
      [SIGNAL:PREF] - user expressed a preference about how you respond
      [SIGNAL:STYLE] - user sent a writing sample or asked to improve text
      [SIGNAL:CORRECT] - user corrected your behavior
      [SIGNAL:EXPERTISE] - user demonstrated domain expertise`
  }
}
```

**Cost:** Zero additional — OM Observer is already running. The custom
instruction just asks it to tag observations differently.

### 4.2 Signal Accumulator (new, no LLM)

A simple counter per `(resourceId, aspectId)`. Tracks how many relevant
signals have been observed since the last learning cycle.

**Detection is deterministic. No LLM calls.**

Three detection strategies run **in parallel** (not as fallbacks — both
OM tags and regex run on every message, results are deduplicated):

1. **OM observation tags** — Parse `[SIGNAL:*]` prefixes from OM observations
   via `storage.getObservationalMemory()`. Free if OM is already running.
2. **Keyword/regex matching on raw messages** — "I'm based in", "call me",
   "I prefer", etc. Runs independently of OM. Catches signals when OM hasn't
   triggered yet (cold start) or when OM drops/reformats tags.
3. **Message metadata** — Message length distribution, emoji usage, response
   length preferences. Pure computation, no LLM.

**Why parallel, not fallback:** LLMs are inconsistent with structured
formatting in free-form outputs. OM may forget `[SIGNAL:*]` tags, vary
the format, or omit them entirely. Regex on raw messages is the reliable
baseline. OM tags are a bonus signal, not the source of truth.

**Deduplication:** Both sources feed into the same signal counter.
Deduplicate by `(resourceId, aspectId, signalType, messageTimestamp)`
so the same preference stated once doesn't count twice.

**State storage:** A `learning_state` table:

```sql
CREATE TABLE IF NOT EXISTS learning_state (
  resource_id TEXT NOT NULL,
  aspect_id TEXT NOT NULL,
  signal_count INTEGER NOT NULL DEFAULT 0,
  last_refinement_at TEXT,
  last_triage_at TEXT,
  PRIMARY KEY (resource_id, aspect_id)
);
```

When `signal_count ≥ threshold` AND `cooldown elapsed` → trigger triage gate.

### 4.3 Triage Gate (new, 1 cheap LLM call)

Before spinning up the expensive learning loop, one cheap call decides if
it's worth it:

```
Given these recent signals about user {resourceId}:
{signal_summaries}

Current SOUL:
{current_soul}

Current IDENTITY:
{current_identity}

Is there anything meaningfully new to learn that isn't already
captured in the current files? Answer YES or NO with a one-line reason.
```

- **YES** → proceed to learning loop
- **NO** → reset signal counter, skip. Cost: ~$0.001

This gate prevents the most common waste: running a full refinement loop
when the signals just confirm what's already known.

### 4.4 Learning Loop (eval-gated, `.dountil()`)

> **Verified:** `.dountil()` exists in the installed `@mastra/core` version.
> Signature: `workflow.dountil(step, async ({ inputData, iterationCount }) => boolean)`
> Runs step at least once. `iterationCount` starts at 1.

The core loop. Only runs when triage says YES.

```
┌─────────────────────────────────────────────────────────────────┐
│                    LEARNING LOOP                                 │
│                    (Mastra workflow with .dountil())             │
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌────────┐ │
│  │  DRAFT   │────▶│  SCORE   │────▶│  PASS?   │─YES▶│ COMMIT │ │
│  │ candidate│     │ composite│     │ ≥ thresh │     │ to DB  │ │
│  └──────────┘     └──────────┘     └────┬─────┘     └────────┘ │
│       ▲                                 │ NO                    │
│       │                                 ▼                       │
│       │                          ┌────────────┐                 │
│       └──────────────────────────│  FEEDBACK   │                │
│         (loop with critique)     │  + iterate  │                │
│                                  └────────────┘                 │
│                                                                 │
│  Max iterations: 3 (circuit breaker)                            │
│  If exhausted without passing: ABORT, keep current files        │
└─────────────────────────────────────────────────────────────────┘
```

**Scorer: Composite with hard gates**

Each aspect defines its own scorer dimensions. For personality:

| Dimension          | Weight | What it checks                       |
| ------------------ | ------ | ------------------------------------ |
| Evidence grounding | 0.30   | Claims backed by OM observations?    |
| Specificity        | 0.20   | Actionable, not generic platitudes?  |
| No regression      | 0.25   | Preserves existing accurate content? |
| Factual accuracy   | 0.25   | Nothing fabricated beyond evidence?  |

Plus **hard gates** (binary, override composite to 0):

- Token budget exceeded? → auto-fail
- Empty or trivially short? → auto-fail
- PII leakage into SOUL? → auto-fail

**Implemented using `@mastra/evals` built-in scorers + custom `createScorer()`:**

| Dimension          | Mastra Scorer                    | Type     | How it maps                                           |
| ------------------ | -------------------------------- | -------- | ----------------------------------------------------- |
| Evidence grounding | `createFaithfulnessScorer()`     | Built-in | Context = conversation evidence. Extracts claims from proposed update, verifies each against context. Score = supported_claims / total_claims. |
| Factual accuracy   | `createHallucinationScorer()`    | Built-in | Hard gate. `getContext` hook pulls conversation messages at runtime. Score > 0.3 → auto-fail (fabricated claims). |
| No regression      | `createToneScorer()`             | Built-in | Compares sentiment of old vs new personality text. Score < 0.5 → flag for wild personality drift. |
| Specificity        | Custom `createScorer()`          | Custom   | LLM-as-judge analyze step: "Are these traits specific and observable, or vague platitudes?" |
| Conciseness        | Custom `createScorer()`          | Custom   | Function preprocess (word count, line count) + LLM analyze (are traits actionable vs bloated?). Hard gate on token budget. |

All scorers use the four-step pipeline from `@mastra/core/evals`:
`preprocess → analyze (LLM judge or function) → generateScore → generateReason`

Built-in scorers come from `@mastra/evals/scorers/prebuilt`. Custom scorers
use `createScorer` from `@mastra/core/evals` (already in `@mastra/core`).

**Feedback loop:** When score fails, the reason is injected as critique
for the next draft iteration. e.g., _"SOUL scored low on evidence grounding
(0.4). Cite specific observations."_

### 4.5 Backtest Gate (inspired by autoresearch)

After the scorer pipeline passes, one final empirical test:

```
1. Sample 5 real past messages from this user
2. Generate responses using OLD personality files
3. Generate responses using NEW personality files
4. LLM-as-judge: which response set better matches this user?
5. New wins → COMMIT. Old wins → DISCARD (or loop back with feedback).
```

This is the difference between:

- "This change _looks_ good" (scorer) — necessary but abstract
- "This change _produces_ better responses" (backtest) — concrete proof

**The judge prompt:**

```
You are evaluating two response sets to the same user messages.

User messages: {sampled_messages}

Response Set A: {responses_with_old_personality}
Response Set B: {responses_with_new_personality}

Which set better matches this user's apparent preferences for tone,
depth, directness, and style? Answer: A or B, with a brief explanation.
```

**Cost:** ~$0.02-0.05 per backtest (10 generate calls + 1 judge).
Only runs on proposals that already passed scoring, so rarely.

**Why this is powerful:**

1. Self-correcting — bad-on-paper-good changes get caught
2. Measurable — every commit has empirical win evidence
3. Autonomous — queue experiments overnight, wake up to win/loss logs

**POC note:** Backtesting is Phase 3. Start without it. Add when the
basic loop is proven.

### 4.6 Reading OM Observations (GATHER step)

Mastra exposes OM observations via a public storage API:

```typescript
// Access via the Mastra memory storage layer
const memory = agent.getMemory();
const record = await memory.storage.getObservationalMemory(threadId, resourceId);

if (record) {
  const observations = record.activeObservations; // full text of current observations
  const tokenCount = record.observationTokenCount;
  const totalObserved = record.totalTokensObserved;

  // For resource-scoped OM: observations include <thread id="...">...</thread> tags
  // Parse signal tags from observations
  const signalRegex = /\[SIGNAL:(FACT|PREF|STYLE|CORRECT|EXPERTISE)\]\s*(.+)/g;
  let match;
  while ((match = signalRegex.exec(observations))) {
    console.log(`${match[1]}: ${match[2]}`);
  }
}

// Get historical observation generations (post-reflection)
const history = await memory.storage.getObservationalMemoryHistory(
  threadId, resourceId, 5
);
```

**Table:** `mastra_observational_memory` — key columns: `activeObservations`
(text), `observationTokenCount`, `totalTokensObserved`, `generationCount`,
`scope` ('thread' | 'resource'), `lastObservedAt`.

This means the GATHER step is straightforward: read `activeObservations`,
parse any `[SIGNAL:*]` tags, and pass them + current SOUL/IDENTITY to the
DRAFT step. No need to query raw libSQL tables.

### 4.7 Bootstrap: Cold Start for New Users

OM needs ~30K tokens of conversation before its first observation triggers.
For a new user, that's potentially 50–100+ messages before OM has anything
to read. The signal accumulator would never fire.

**Solution: dual-path signal detection + on-demand trigger.**

1. **Regex detectors run from message 1.** They don't depend on OM.
   A new user saying "I'm a backend engineer based in Singapore, keep
   responses concise" fires 3 signals immediately via regex.

2. **`/learn` command bypasses all gates.** The user (or we, during dev)
   can trigger a refinement at any time. The GATHER step falls back
   gracefully when OM has no observations — it uses raw message history
   from `memory.query()` instead.

3. **Lower threshold for first-ever run.** If `learning_state` has no
   `last_refinement_at` (never refined before), use `signalThreshold / 2`
   (e.g., 3 instead of 5). First impressions are information-dense.

```typescript
const isFirstRun = !state.last_refinement_at;
const effectiveThreshold = isFirstRun
  ? Math.ceil(aspect.config.signalThreshold / 2)
  : aspect.config.signalThreshold;
```

**GATHER fallback when OM is empty:**

```typescript
async function gatherContext(resourceId: string, threadId: string) {
  const memory = agent.getMemory();
  const omRecord = await memory.storage.getObservationalMemory(threadId, resourceId);

  if (omRecord && omRecord.observationTokenCount > 0) {
    // Normal path: use OM observations
    return { source: 'om', observations: omRecord.activeObservations };
  }

  // Cold start: fall back to raw message history
  const messages = await memory.query({ resourceId, threadId, last: 40 });
  return { source: 'messages', messages };
}
```

The draft prompt adapts based on source — OM observations are pre-distilled,
raw messages need the LLM to extract patterns itself (slightly more expensive
but only happens once per user).

---

## 5. Making It Modular: Aspects

The engine operates on **aspects** — pluggable modules that define what
to learn and how to score it. The engine doesn't know about "personality"
or "style" specifically.

### Aspect interface

```typescript
interface LearningAspect<TArtifact = string> {
  id: string; // 'personality', 'style', 'projects'

  // --- DETECTION ---
  signalDetectors: SignalDetector[]; // what to look for (no LLM)
  triagePrompt: string; // prompt for the triage gate

  // --- LEARNING ---
  gather: (ctx: GatherContext) => Promise<AspectContext>;
  draftPrompt: string; // prompt template for DRAFT step
  scorers: AspectScorer[]; // quality scorers with weights

  // --- STORAGE ---
  store: {
    load: (resourceId: string) => Promise<TArtifact>;
    save: (
      resourceId: string,
      artifact: TArtifact,
      reason: string,
    ) => Promise<void>;
  };

  // --- CONFIG ---
  config: {
    signalThreshold: number; // signals needed before triage (default: 5)
    cooldownMs: number; // min gap between runs (default: 24h, DEV_MODE: 5min)
    scoreThreshold: number; // min composite score to commit (default: 0.7)
    maxIterations: number; // circuit breaker (default: 3)
    tokenBudget: number; // max tokens for this aspect's output
    draftModel: string; // LLM for drafting (strong)
    triageModel: string; // LLM for triage (cheap)
  };
}

// Runtime config — controlled by environment variable
const DEV_MODE = process.env.LEARNING_DEV_MODE === 'true';

function getEffectiveCooldown(aspect: LearningAspect): number {
  return DEV_MODE ? 5 * 60 * 1000 : aspect.config.cooldownMs; // 5min vs 24h
}
```

### Example aspects

**Personality Aspect** (first to build)

- Signals: `[SIGNAL:FACT]`, `[SIGNAL:PREF]`, `[SIGNAL:CORRECT]`
- Scorers: evidence grounding, specificity, no regression, factual accuracy
- Store: `PersonalityStore` (SOUL + IDENTITY files)
- Threshold: 5 signals, 24h cooldown, score ≥ 0.7
- Budget: 1,500 tokens each (SOUL, IDENTITY)

**Writing Style Aspect** (second to build — validates the generic engine)

- Signals: `[SIGNAL:STYLE]`, writing improvement requests
- Scorers: evidence, conciseness, style fidelity
- Store: `PersonalityStore` (updates SOUL's style section)
- Threshold: 3 signals (each is rich), score ≥ 0.75
- Budget: shares SOUL's 1,500 token budget

**Project Context Aspect** (future)

- Signals: project mentions, tech stack references, deadline mentions
- Scorers: evidence, relevance, staleness detection
- Store: Working memory or new `PROJECTS` file type
- Threshold: 3 signals (projects change fast), score ≥ 0.7
- Budget: 500 tokens

---

## 6. Signal Detection: Cheap, Not Smart

Signal detection is deterministic. Zero LLM calls.

| Strategy            | How                                                       | Cost                      | Reliability |
| ------------------- | --------------------------------------------------------- | ------------------------- | ----------- |
| Keyword/regex       | "I'm based in", "call me", "I prefer", "don't do"         | Free (string match)       | High — deterministic, always runs |
| OM observation tags | Parse `[SIGNAL:*]` prefixes from OM observations          | Free (OM already running) | Medium — LLM may forget/vary tags |
| Message metadata    | Avg message length, emoji frequency, response preferences | Free (computation)        | High — pure math |

**Both regex and OM tag detection run in parallel on every message.**
Results are deduplicated before incrementing the signal counter.
Regex is the reliable baseline; OM tags are a bonus.

Signal accumulator increments per `(resourceId, aspectId)`. When count
≥ threshold AND cooldown elapsed → fire triage gate.

---

## 7. Context Window Budget

### The problem

Each aspect's output competes for space in the system prompt. Without
limits, personality files grow until they degrade response quality.

### Token envelope

```
┌──────────────────────────────────────────────────────────────┐
│                 CONTEXT WINDOW BUDGET                         │
│                 (Target: ≤ 8K tokens system prompt)           │
│                                                              │
│  SOUL.md              ≤ 1,500 tok   Communication style      │
│  IDENTITY.md          ≤ 1,500 tok   Who the user is          │
│  BASE_INSTRUCTIONS    ≤ 1,000 tok   Core agent persona       │
│  Working Memory       ≤ 1,500 tok   Active context           │
│  Module Instructions  ≤ 2,000 tok   All aspect tool prompts  │
│  ────────────────────────────────────                        │
│  Subtotal             ≤ 8,000 tok                            │
│                                                              │
│  OM observations: managed by Mastra (separate budget)        │
│  Messages + tool calls: remaining context window             │
│                                                              │
│  On 128K model: ~8K system + ~4K OM = ~12K overhead          │
│  Leaves ~116K for conversation + tool calls + output         │
└──────────────────────────────────────────────────────────────┘
```

### How budget is enforced

1. **At draft time:** The scorer hard-fails any candidate exceeding its
   token budget. The feedback loop tells the LLM "make it more concise."

2. **At assembly time:** `buildInstructions()` evolves into a context
   assembler that estimates tokens per block and truncates any block
   exceeding its slot (lowest-priority first).

3. **Key insight:** Most aspects don't need additional prompt space.
   The learning engine runs in the background — it reads OM, generates
   candidates, scores them, writes to DB. The only prompt-space consumers
   are the _outputs_ (SOUL/IDENTITY), which are already budgeted.

---

## 8. Cost Model

### Per-event costs

| Event                                       | LLM calls                                                    | Cost        |
| ------------------------------------------- | ------------------------------------------------------------ | ----------- |
| Signal detection                            | 0                                                            | $0          |
| Triage gate (NO)                            | 1 × flash                                                    | ~$0.001     |
| Triage gate (YES) → full loop (1 iteration) | 1 × flash (triage) + 1 × strong (draft) + 1 × flash (scorer) | ~$0.015     |
| Full loop (3 iterations, worst case)        | 1 + 3 × strong + 3 × flash                                   | ~$0.05–0.10 |
| Backtest (when added)                       | 10 × fast (generates) + 1 × strong (judge)                   | ~$0.02–0.05 |

### Monthly cost per user

| Usage                       | Triages/mo | Full loops/mo | Cost/mo     |
| --------------------------- | ---------- | ------------- | ----------- |
| Light (few messages)        | 1–2        | 0–1           | $0.002–0.02 |
| Normal (daily)              | 5–10       | 2–4           | $0.02–0.10  |
| Heavy (hits cooldown daily) | 30         | 8–15          | $0.10–0.50  |

**Plus OM background cost:** ~$0.05–0.20/month for daily-active user.

**Total: well under $1/month/user.** Signal-based triggering + triage gate
is what makes this affordable.

---

## 9. Observability

Without visibility into what the engine is doing, we can't tune it or
trust it. Three layers of observability:

### 9.1 Refinement Log (database)

Every learning loop run is logged:

```sql
CREATE TABLE IF NOT EXISTS refinement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL,
  aspect_id TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  triage_result TEXT NOT NULL,              -- 'YES' | 'NO'
  triage_reason TEXT,                       -- one-line explanation
  iterations INTEGER,                      -- how many draft/score rounds
  final_score REAL,                        -- composite score (null if aborted)
  backtest_result TEXT,                    -- 'WIN' | 'LOSE' | null (not run)
  outcome TEXT NOT NULL,                   -- 'COMMITTED' | 'ABORTED' | 'TRIAGE_SKIP'
  change_summary TEXT,                     -- what changed (human-readable)
  cost_estimate_usd REAL,                 -- estimated LLM cost for this run
  duration_ms INTEGER                     -- wall clock time
);
```

This gives us:

- Commit/abort ratio (target: ~70% commit)
- Average iterations needed (target: 1.5)
- Cost per user per month
- Which aspects learn fastest
- Triage skip rate (if > 90%, threshold may be too high)

### 9.2 Mastra Tracing (built-in)

Mastra already has OpenTelemetry-based tracing. The learning loop workflows
will show up automatically in traces with:

- Span per workflow step (gather, draft, score, commit)
- LLM call details (model, tokens, latency)
- Tool call traces

Viewable in Mastra Studio's Observability tab.

### 9.3 Live Scorer Trends

Attach a `style-fidelity` scorer to the sovereign agent as a live eval
(sampled at ~30% of responses). This passively measures whether the agent's
outputs actually match the user's style over time:

```typescript
scorers: {
  styleFidelity: {
    scorer: styleFidelityScorer,
    sampling: { type: 'ratio', rate: 0.3 },
  },
}
```

Mastra auto-stores results in `mastra_scorers` table. Over weeks you get a
trend line:

- Week 1: style fidelity 0.4 (default SOUL, generic)
- Week 3: style fidelity 0.65 (post-refinement)
- Week 5: style fidelity 0.82 (SOUL dialed in)

**This is the proof the engine works** — not just that scores pass the bar
in the loop, but that live agent output quality actually improves.

### 9.4 User-Facing Transparency

Telegram commands let the user see what's happening:

| Command             | What it shows                                         |
| ------------------- | ----------------------------------------------------- |
| `/soul`             | Current SOUL file                                     |
| `/identity`         | Current IDENTITY file                                 |
| `/soul history`     | Last 5 versions with scores + reasons                 |
| `/identity history` | Last 5 versions with scores + reasons                 |
| `/soul revert`      | Revert to previous version                            |
| `/identity revert`  | Revert to previous version                            |
| `/learn`            | Trigger immediate refinement (bypass signal/cooldown) |
| `/scores`           | Recent scorer results + commit/abort stats            |

---

## 10. Decisions Summary

| Decision         | Choice                                               | Rationale                                                           |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Trigger model    | Signal-based + triage gate                           | Cost-proportional. Triage gate prevents wasted full loops.          |
| Signal detection | Deterministic (regex, OM tags, metadata)             | No LLM cost for detection. Cheap and fast.                          |
| Loop primitive   | Mastra `.dountil()`                                  | Native framework support. No custom loop machinery.                 |
| Scoring          | Composite (weighted dimensions) + hard gates         | Catches specific failures while allowing holistic quality judgment. |
| Backtesting      | A/B test on real messages, LLM-as-judge              | Concrete proof of improvement, not just abstract scoring.           |
| Background model | Gemini Flash (triage, scoring)                       | $0.10/1M input. Keeps costs negligible.                             |
| Draft model      | Strong model (same as agent, or configurable)        | Quality matters for the artifact being generated.                   |
| Context budget   | Fixed token envelope, enforced at scoring + assembly | Prevents prompt bloat. Most aspects need 0 extra prompt space.      |
| Cooldown         | 24h production / 5min dev (`LEARNING_DEV_MODE`)      | Bounds cost in prod. Dev needs fast iteration.                      |
| Approval flow    | None (AI auto-commits, user can revert)              | Frictionless UX. Version history is the safety net.                 |

---

## 11. POC Plan — Proving the Theory

Before building the full engine, we test the core hypothesis:
**Can an eval-gated loop produce better SOUL/IDENTITY files than
a naive one-shot generation?**

### POC Scope

Build the thinest possible vertical slice that exercises:

1. OM observations → signal detection → triage
2. Draft → score → feedback → redraft loop
3. Scored commit to the existing `personality_files` table
4. Observability to see what happened

### POC Architecture (minimal)

```
┌────────────────────────────────────────────────────┐
│  POC — NO generic engine, NO aspects interface     │
│  Just the personality learning loop, hardcoded     │
│                                                    │
│  1. Enable OM on sovereign agent                   │
│  2. After messages, check for [SIGNAL:*] tags      │
│  3. When threshold hit → triage gate (1 LLM call)  │
│  4. If YES → draft new SOUL + IDENTITY             │
│  5. Score candidate (composite scorer)             │
│  6. If pass → commit. If fail → feedback + retry   │
│  7. Log everything to refinement_log table         │
└────────────────────────────────────────────────────┘
```

### POC: What to build

| #   | Item                       | What                                                                                                   | Effort    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 0   | **Verify OM API**          | Spike: call `storage.getObservationalMemory()` in a scratch script, confirm returned shape matches docs | ~30 min   |
| 1   | **Enable OM**              | Add `observationalMemory` config to `sovereign.ts` with custom observer instruction for signal tagging | ~10 lines |
| 2   | **`learning_state` table** | Migration for signal counter + last refinement timestamp per user                                      | ~20 lines |
| 3   | **`refinement_log` table** | Migration for logging every learning loop run                                                          | ~20 lines |
| 4   | **Signal counter**         | Dual-path: regex on raw messages + OM tag parsing, deduplicated, runs after each message               | ~50 lines |
| 5   | **Triage gate**            | Single Gemini Flash call: "is there enough here to learn?"                                             | ~40 lines |
| 6   | **Draft step**             | Generate candidate SOUL + IDENTITY from OM observations (or raw messages if cold start) + current files | ~60 lines |
| 7   | **Scorer**                 | Composite scorer: evidence + specificity + no-regression + accuracy + hard gates                       | ~80 lines |
| 8   | **The loop**               | Mastra workflow: `gather → draft → .dountil(score, condition) → commit/abort`                          | ~60 lines |
| 9   | **`/learn` command**       | Telegram command to manually trigger the loop (bypass signal/cooldown)                                 | ~15 lines |
| 10  | **Logging**                | Write refinement_log entry for every run (triage result, iterations, score, outcome)                   | ~20 lines |
| 11  | **DEV_MODE config**        | `LEARNING_DEV_MODE` env var: 5min cooldown, verbose logging, lower signal threshold                    | ~15 lines |

**Total: ~400 lines of new code.** No generic engine, no aspects interface,
no backtesting. Just enough to prove the loop works.

### POC: What to skip

- Generic `LearningAspect` interface (build in Phase 2 when we add the second aspect)
- Backtesting (add in Phase 3 when we trust the scorer pipeline)
- Live `style-fidelity` scorer on the agent (add in Phase 2)
- Context assembler with budget enforcement (current `buildInstructions()` is fine for POC)
- Adaptive thresholds
- `/scores` dashboard command

### POC: Success criteria

1. **OM produces tagged observations.** After 20+ messages, we see `[SIGNAL:*]`
   tagged observations in Mastra Studio.

2. **Triage gate correctly filters.** When signals contain new info not in
   current files → YES. When signals are just chat → NO. Test with 10+ triages,
   expect ≥80% correct decisions.

3. **The loop self-corrects.** When iteration 1 scores < 0.7, the feedback
   injection produces a better iteration 2 that scores higher. Measure across
   5+ refinement runs.

4. **Committed SOUL/IDENTITY files are better than defaults.** After 50+
   messages, the SOUL should contain specific style observations and the
   IDENTITY should have real facts about the user. Humanly verifiable.

5. **No regressions.** The loop should never commit files that score worse
   than the current versions. If it does → scorer needs recalibration.

6. **Observability works.** `refinement_log` table has entries for every run.
   We can answer: how many runs? commit/abort ratio? average score?
   average iterations?

### POC: What we learn

After running the POC for 1-2 weeks:

| Question                                 | How we answer it                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Does OM signal tagging actually work?    | Check Studio — are [SIGNAL:*] tags present and accurate?                                                                            |
| Is the triage gate worth the complexity? | Check triage skip rate. If it skips < 30% of the time, the gate isn't adding value and we can remove it.                            |
| Is the scorer too strict or too lenient? | Check commit/abort ratio. Target: ~70% commit. If too many aborts → lower threshold. If too many commits of bad quality → raise it. |
| Does the feedback loop actually help?    | Compare iteration 1 scores vs iteration 2 scores. If iteration 2 isn't consistently better → the feedback prompt needs work.        |
| Is the 24h cooldown right?               | Check: after 24h, has enough new signal accumulated to justify a run? If most post-cooldown runs abort → cooldown is too short.     |
| What does a "good" refinement look like? | Read the committed SOUL/IDENTITY diffs manually. Are they genuinely better?                                                         |

---

## 12. Implementation Phases

### Phase 1: POC (prove the theory)

- **Step 0:** Spike — verify `storage.getObservationalMemory()` returns expected data
- Enable OM with signal tagging
- Build dual-path signal detection (regex + OM tags in parallel, deduplicated)
- Build triage gate
- Build the hardcoded personality learning loop (draft → score → commit)
- Add bootstrap path for cold-start users (lower threshold, raw message fallback)
- Add `learning_state` + `refinement_log` tables
- Add `/learn` command (manual trigger, bypasses all gates)
- Add `LEARNING_DEV_MODE` env var (5min cooldown, lower thresholds, verbose logs)
- Run for 1-2 weeks, evaluate POC success criteria
- **No generic engine. No aspects interface. Just prove the loop works.**

### Phase 2: Engine + Second Aspect (prove the generic claim)

- Extract `LearningAspect` interface from the hardcoded personality loop
- Build the generic eval loop engine (factory that produces workflows from aspect configs)
- Refactor personality into the first aspect
- Build writing-style as the second aspect (validates the engine is truly generic)
- Add live `style-fidelity` scorer to sovereign agent
- Add context assembler with token budget enforcement
- If writing-style aspect works cleanly → engine design is validated
- If it requires engine changes → refactor before adding more aspects

### Phase 3: Backtesting + Polish

- Add the backtest gate (A/B test on real messages)
- Add `/soul history`, `/identity history`, `/soul revert`, `/identity revert`
- Add `/scores` command for trend visibility
- Notification on significant personality changes
- Tune thresholds based on real observation data

### Phase 4: Expansion

- Project context aspect
- Response preferences aspect
- Adaptive thresholds (aspects that learn faster get lower cooldowns)
- Meta-optimization: autoresearch the refinement prompt itself

---

## 13. Open Questions (for PRD)

1. ~~**OM signal tagging fidelity.**~~ **RESOLVED — mitigated by design.**
   Regex runs in parallel with OM tags from day one (not as a fallback).
   Both sources feed the same deduplicated signal counter. If OM tags are
   unreliable, regex still catches signals. POC will measure OM tag hit rate
   to decide if the custom observer instruction is worth keeping.

2. ~~**Reading OM observations programmatically.**~~ **RESOLVED.**
   Mastra exposes a public API: `storage.getObservationalMemory(threadId, resourceId)`
   returns an `ObservationalMemoryRecord` with `activeObservations` (full text),
   `observationTokenCount`, `totalTokensObserved`, `generationCount`.
   History available via `storage.getObservationalMemoryHistory(threadId, resourceId, limit)`.
   Table: `mastra_observational_memory`. See Section 4.6 for code.

3. **Aspect isolation vs shared signals.** Should the personality aspect and
   writing-style aspect share the same signal counter? Or independent counters?
   Starting independent is simpler.

4. **SOUL section ownership.** If personality aspect and writing-style aspect
   both write to SOUL, who owns which section? Options:
   - Personality owns the full SOUL, writing-style provides input to personality
   - SOUL has named sections, each aspect owns its section
   - Starting simple: personality owns SOUL, style enriches it via observations

5. **Backtest model choice.** Should backtesting use the same model as the main
   agent (accurate but expensive) or a cheaper model (faster, less accurate)?
   Start with the same model — accuracy matters more than cost for a gate that
   runs rarely.

6. **Meta-optimization viability.** Can we autoresearch the refinement prompt
   itself? Run different prompt versions, measure backtest win rates, keep the
   best. The versioned PersonalityStore supports this. Phase 4 exploration.

---

## 14. File Organization (planned)

```
apps/api/src/
  identity/               # existing — stays as-is
    types.ts
    store.ts
    migrate.ts
    seed.ts
    instructions.ts
  learning/               # NEW — all learning engine code
    engine.ts             # generic eval loop factory (Phase 2)
    types.ts              # LearningAspect interface (Phase 2)
    signal.ts             # signal accumulator + detection
    triage.ts             # triage gate
    aspects/
      personality.ts      # personality learning aspect
      style.ts            # writing style aspect (Phase 2)
    scorers/
      personality.ts      # composite scorer for SOUL/IDENTITY
      style-fidelity.ts   # live scorer for agent responses (Phase 2)
    migrations.ts         # learning_state + refinement_log tables
  mastra/
    agents/
      sovereign.ts        # updated: OM config, live scorers
    workflows/
      refine-personality.ts  # POC: hardcoded workflow (→ engine-generated in Phase 2)
```
