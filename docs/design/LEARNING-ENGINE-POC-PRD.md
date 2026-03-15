# Learning Engine POC — Product Requirements Document

> **Goal:** Prove that an eval-gated learning loop can produce better
> SOUL/IDENTITY files than the current static defaults.
>
> **Design doc:** [learning-engine-system-design.md](learning-engine-system-design.md)
>
> **Branch:** `feature/personality-learning`

---

## 1. Problem Statement

Sovereign's personality files (SOUL + IDENTITY) are static defaults seeded
on first contact. They don't adapt to the user. After 500 messages the
agent still says "New user. Limited context available."

Observational Memory already watches conversations and builds compressed
observations. The learning engine uses those observations to periodically
refine the personality files — making the agent genuinely adapt to each user.

### What this POC tests

1. Can OM observations be read programmatically and used to draft better
   personality files?
2. Does a composite scorer reliably distinguish good drafts from bad ones?
3. Does a feedback loop (score → critique → redraft) converge on better
   results than a single-shot draft?
4. Is signal-based triggering + triage gate a cost-effective way to decide
   when to run the loop?

---

## 2. Non-Goals (Explicitly Out of Scope)

| Out of scope                                                             | Why                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Generic `LearningAspect` interface                                       | POC is hardcoded to personality. Generalize in Phase 2. |
| Backtesting / A/B gate                                                   | Add after we trust the scorer pipeline (Phase 3).       |
| Live `style-fidelity` scorer on agent                                    | Phase 2.                                                |
| Context assembler / token budget enforcement                             | Current `buildInstructions()` is fine for POC.          |
| Adaptive signal thresholds                                               | Phase 4.                                                |
| `/scores` dashboard command                                              | Phase 3.                                                |
| `/soul history`, `/soul revert`, `/identity history`, `/identity revert` | Phase 3.                                                |
| Writing-style or project-context aspects                                 | Phase 2+.                                               |
| Multi-user load testing                                                  | Single-user dev testing only.                           |

---

## 3. Prerequisites & Existing Infrastructure

### Already built (no changes needed)

| Component            | File(s)                             | What it provides                                                                  |
| -------------------- | ----------------------------------- | --------------------------------------------------------------------------------- |
| Personality store    | `src/identity/store.ts`, `types.ts` | `load()`, `save()`, `exists()`, `history()` with versioning + audit trail         |
| Schema migrations    | `src/identity/migrate.ts`           | `personality_files`, `personality_file_history`, `user_preferences` tables        |
| Default seeds        | `src/identity/seed.ts`              | `DEFAULT_SOUL`, `DEFAULT_IDENTITY`, `ensureUserSeeded()`                          |
| Instructions builder | `src/identity/instructions.ts`      | `buildInstructions(resourceId, store)` — SOUL + IDENTITY + BASE                   |
| Sovereign agent      | `src/mastra/agents/sovereign.ts`    | Agent with async instructions, resource-scoped Working Memory                     |
| Telegram bot         | `src/telegram/telegram-bot.ts`      | Webhook mode, per-chat queue, per-user `resourceId`, `/start`, `/help`, `/status` |
| Mastra instance      | `src/mastra/index.ts`               | Storage, observability, personality DB init                                       |

### Needs adding

| Component                         | Where                                        | Section |
| --------------------------------- | -------------------------------------------- | ------- |
| Observational Memory config       | `sovereign.ts`                               | §4.1    |
| `learning_state` table            | `src/learning/migrations.ts`                 | §4.2    |
| `refinement_log` table            | `src/learning/migrations.ts`                 | §4.3    |
| Signal detector (regex + OM tags) | `src/learning/signal.ts`                     | §4.4    |
| Triage gate                       | `src/learning/triage.ts`                     | §4.5    |
| Refinement workflow               | `src/mastra/workflows/refine-personality.ts` | §4.6    |
| Personality scorer                | `src/learning/scorers/personality.ts`        | §4.7    |
| `/learn` command                  | `src/telegram/telegram-bot.ts`               | §4.8    |
| DEV_MODE config                   | `src/learning/config.ts`                     | §4.9    |

---

## 4. Requirements

### 4.0 Spike — Verify OM Storage API

**Before building anything else**, write a scratch script that:

1. Calls `storage.getObservationalMemory(threadId, resourceId)` against
   the sovereign agent's memory store.
2. Logs the returned `ObservationalMemoryRecord` shape: `activeObservations`,
   `observationTokenCount`, `totalTokensObserved`, `generationCount`.
3. Confirms the data matches what Mastra Studio shows.

**Acceptance:** Script runs, prints OM record for an existing user, shape
matches documented API. If API doesn't exist or returns unexpected data,
stop and reassess before proceeding.

**File:** `src/scripts/verify-om-api.ts`

---

### 4.1 Enable Observational Memory

Add `observationalMemory` config to the sovereign agent.

```typescript
// sovereign.ts — add to Memory constructor
observationalMemory: {
  model: 'google/gemini-2.5-flash',
  scope: 'resource',
  observation: {
    instruction: `In addition to your normal observations, tag any of
      these with a [SIGNAL:TYPE] prefix:
      [SIGNAL:FACT] - user stated something about themselves
      [SIGNAL:PREF] - user expressed a preference about how you respond
      [SIGNAL:STYLE] - user sent a writing sample or discussed writing style
      [SIGNAL:CORRECT] - user corrected your behavior or tone
      [SIGNAL:EXPERTISE] - user demonstrated domain expertise`
  }
}
```

**Acceptance criteria:**

- After 20+ messages with Sovereign, OM observations appear in Mastra Studio.
- At least some observations contain `[SIGNAL:*]` tags.
- No degradation to response latency or quality.

**Dependencies:** `GOOGLE_API_KEY` env var for Gemini Flash.

---

### 4.2 Learning State Table

New migration table tracking signal counts and refinement timestamps per user.

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

**Location:** `src/learning/migrations.ts` — called from `src/mastra/index.ts`
during startup, same pattern as `runMigrations()` for personality tables.

**Acceptance:** Table created on startup. Signal count increments are visible
via direct SQL query or a debug log.

---

### 4.3 Refinement Log Table

Every learning loop invocation is logged — whether it resulted in a commit,
abort, or triage skip.

```sql
CREATE TABLE IF NOT EXISTS refinement_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL,
  aspect_id TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  trigger_source TEXT NOT NULL,       -- 'auto' | 'manual' (/learn command)
  triage_result TEXT NOT NULL,        -- 'YES' | 'NO' | 'BYPASSED'
  triage_reason TEXT,
  iterations INTEGER,
  final_score REAL,
  outcome TEXT NOT NULL,              -- 'COMMITTED' | 'ABORTED' | 'TRIAGE_SKIP'
  change_summary TEXT,
  duration_ms INTEGER
);
```

**Location:** Same `src/learning/migrations.ts` file.

**Acceptance:** After a `/learn` run, a row exists in `refinement_log` with
all fields populated. Queryable via `sqlite3 .data/personality.db`.

---

### 4.4 Signal Detector

Dual-path signal detection that runs after every processed message.

**Path 1: Regex on raw messages (always runs)**

Pattern-match the user's message text against signal patterns:

| Signal type | Example patterns                                                                |
| ----------- | ------------------------------------------------------------------------------- |
| `FACT`      | "I'm a", "I work at", "I'm based in", "my name is", "I live in"                 |
| `PREF`      | "I prefer", "don't do", "keep it", "I like when", "please always", "stop doing" |
| `STYLE`     | "improve this", "rewrite this", "make this more", "edit this"                   |
| `CORRECT`   | "no, I meant", "that's wrong", "I said", "not like that"                        |
| `EXPERTISE` | (skip for POC — hard to regex, OM tag will cover this)                          |

**Path 2: OM observation tag parsing (runs when OM has data)**

After the agent responds, read `activeObservations` from OM storage and
parse `[SIGNAL:*]` tags.

```typescript
const record = await memory.storage.getObservationalMemory(
  threadId,
  resourceId,
);
if (record?.activeObservations) {
  const tagRegex = /\[SIGNAL:(FACT|PREF|STYLE|CORRECT|EXPERTISE)\]/g;
  // count unique tags since last check
}
```

**Deduplication:** Track `(resourceId, signalType, messageTimestamp)` to
avoid double-counting when both regex and OM detect the same signal.

**Trigger condition:**

```
signal_count >= effectiveThreshold AND
(now - last_refinement_at) >= cooldown AND
(now - last_triage_at) >= cooldown
```

Where `effectiveThreshold`:

- First-ever refinement (no `last_refinement_at`): `ceil(threshold / 2)` = 3
- Normal: `threshold` = 5

**Location:** `src/learning/signal.ts`

**Exported API:**

```typescript
export async function detectSignals(
  messageText: string,
  resourceId: string,
  threadId: string,
  memory: Memory,
): Promise<{ signalCount: number; shouldTrigger: boolean }>;
```

**Acceptance:**

- Sending "I'm a backend engineer based in Singapore" increments signal count by ≥1.
- Sending "what's the weather" does not increment.
- Both regex and OM paths produce counts; deduplicated total ≤ sum of individuals.

---

### 4.5 Triage Gate

One cheap LLM call to decide whether accumulated signals justify a full
learning loop.

**Model:** `google/gemini-2.5-flash` (same as OM observer)

**Prompt:**

```
You are deciding whether the AI assistant should update its personality
profile for a user.

Recent signals detected from conversations with this user:
{signal_summaries}

Current personality profile:
---
SOUL:
{current_soul}
---
IDENTITY:
{current_identity}
---

Is there anything meaningfully new in the signals that isn't already
captured in the current SOUL and IDENTITY files?

Answer with exactly one of:
YES: [one-line reason what's new]
NO: [one-line reason why not]
```

**Behavior:**

- `YES` → proceed to learning loop.
- `NO` → reset signal counter to 0, update `last_triage_at`, log as `TRIAGE_SKIP`.

**Location:** `src/learning/triage.ts`

**Exported API:**

```typescript
export async function triageGate(
  resourceId: string,
  signals: SignalSummary[],
  currentSoul: string,
  currentIdentity: string,
): Promise<{ proceed: boolean; reason: string }>;
```

**Acceptance:**

- When signals contain "user said they're a backend engineer" and current
  IDENTITY says "New user" → returns `YES`.
- When signals say "user asked about weather" and IDENTITY already captures
  user's interests → returns `NO`.

---

### 4.6 Refinement Workflow

A Mastra workflow that runs the full gather → draft → score → commit loop.

**Steps:**

1. **Gather** — Read OM observations + current SOUL/IDENTITY + signal summaries.
   Cold-start fallback: if OM has no observations, read last 40 messages from
   memory instead.

2. **Draft** — LLM generates candidate SOUL + IDENTITY files.
   Model: same as agent (`openrouter/openai/gpt-5-mini`) or configurable.

   **Draft prompt:**

   ```
   You are updating a personality profile for an AI assistant based on
   observed user behavior.

   Current SOUL:
   {current_soul}

   Current IDENTITY:
   {current_identity}

   Observations about this user:
   {observations_or_messages}

   {feedback_from_previous_iteration}

   Generate updated versions of both files. Rules:
   - Only add claims supported by the observations.
   - Preserve all accurate content from the current files.
   - Keep SOUL under 1500 tokens. Keep IDENTITY under 1500 tokens.
   - Use the same markdown format as the current files.
   - Do not fabricate facts. If uncertain, omit.

   Respond with exactly:
   ## SOUL
   [updated soul content]

   ## IDENTITY
   [updated identity content]
   ```

3. **Score** — Run `personalityScorer.run()` on the candidate (see §4.7).

4. **Check** — If composite score ≥ 0.7, proceed to commit. If < 0.7 and
   `iterationCount < 3`, feed the scorer's reason back as critique and
   loop to step 2. If `iterationCount >= 3`, abort.

5. **Commit** — Save new SOUL + IDENTITY to personality store with the
   scorer reason as `change_reason`. Log to `refinement_log`.

**Implementation:** Mastra `createWorkflow` + `createStep` + `.dountil()`.

```typescript
const refinePersonalityWorkflow = createWorkflow({
  id: "refine-personality",
  inputSchema: z.object({
    resourceId: z.string(),
    threadId: z.string(),
    triggerSource: z.enum(["auto", "manual"]),
  }),
  outputSchema: z.object({
    outcome: z.enum(["COMMITTED", "ABORTED"]),
    iterations: z.number(),
    finalScore: z.number().nullable(),
    changeSummary: z.string().nullable(),
  }),
})
  .then(gatherStep)
  .then(draftStep)
  .dountil(scoreAndMaybeRedraftStep, async ({ inputData, iterationCount }) => {
    return inputData.passed || iterationCount >= 3;
  })
  .then(commitOrAbortStep)
  .commit();
```

**Location:** `src/mastra/workflows/refine-personality.ts`

**Registration:** Add to `workflows: {}` in `src/mastra/index.ts`.

**Acceptance:**

- Running the workflow for a user with 20+ messages produces a non-default
  SOUL and IDENTITY.
- The commit includes a `change_reason` from the scorer.
- History shows the previous version preserved.

---

### 4.7 Personality Scorer

A custom scorer built with Mastra's `createScorer()` four-step pipeline
(`@mastra/core/evals`). Evaluates candidate SOUL/IDENTITY files against
the observations they were derived from.

**Dimensions:**

| Dimension          | Weight | What it checks                                               |
| ------------------ | ------ | ------------------------------------------------------------ |
| Evidence grounding | 0.30   | Every claim in the candidate can be traced to an observation |
| Specificity        | 0.20   | Contains specific, actionable info — not generic platitudes  |
| No regression      | 0.25   | All accurate content from current files is preserved         |
| Factual accuracy   | 0.25   | Nothing fabricated beyond what observations support          |

**Hard gates (any one → score = 0):**

- Combined SOUL + IDENTITY exceeds 3,000 tokens → auto-fail
- Either file is empty or under 20 characters → auto-fail

**Implementation: `createScorer()` four-step pipeline**

```typescript
import { createScorer } from "@mastra/core/evals";
import { z } from "zod";

export const personalityScorer = createScorer({
  id: "personality-fit",
  description:
    "Evaluates candidate SOUL/IDENTITY files against user observations",
  judge: {
    model: "google/gemini-2.5-flash",
    instructions: "You evaluate AI personality profile updates for quality.",
  },
})
  // Step 1: Hard gates (deterministic — no LLM)
  .preprocess(({ run }) => {
    const { candidateSoul, candidateIdentity } = run.output;
    const combined = `${candidateSoul}\n${candidateIdentity}`;
    const tokenEstimate = Math.ceil(combined.length / 4);
    const hardGateFailed =
      tokenEstimate > 3000 ||
      candidateSoul.length < 20 ||
      candidateIdentity.length < 20;
    return { hardGateFailed, tokenEstimate };
  })
  // Step 2: LLM-as-judge evaluates all 4 dimensions
  .analyze({
    description: "Evaluate personality update across all quality dimensions",
    outputSchema: z.object({
      evidenceGrounding: z.number().min(0).max(1),
      specificity: z.number().min(0).max(1),
      noRegression: z.number().min(0).max(1),
      factualAccuracy: z.number().min(0).max(1),
      weakestDimension: z.string(),
    }),
    createPrompt: ({ run }) => {
      const {
        candidateSoul,
        candidateIdentity,
        currentSoul,
        currentIdentity,
        observations,
      } = run.output;
      return `Evaluate this personality profile update on four dimensions (0.0–1.0 each).

CURRENT SOUL:
${currentSoul}

CURRENT IDENTITY:
${currentIdentity}

PROPOSED SOUL:
${candidateSoul}

PROPOSED IDENTITY:
${candidateIdentity}

OBSERVATIONS (evidence from user conversations):
${observations}

Score each dimension:
1. evidenceGrounding: Can every claim in the proposed files be traced to an observation? (1.0 = all grounded)
2. specificity: Are traits specific and observable, or vague platitudes? (1.0 = highly specific)
3. noRegression: Is all accurate content from current files preserved? (1.0 = nothing lost)
4. factualAccuracy: Is anything fabricated beyond what observations support? (1.0 = nothing fabricated)
5. weakestDimension: Name of the lowest-scoring dimension with a brief explanation.

Return JSON matching the schema.`;
    },
  })
  // Step 3: Compute weighted composite (deterministic)
  .generateScore(({ results }) => {
    if (results.preprocessStepResult?.hardGateFailed) return 0;
    const d = results.analyzeStepResult;
    return (
      0.3 * d.evidenceGrounding +
      0.2 * d.specificity +
      0.25 * d.noRegression +
      0.25 * d.factualAccuracy
    );
  })
  // Step 4: LLM generates human-readable reason (used as critique for redraft)
  .generateReason({
    description: "Explain the score and suggest improvements",
    createPrompt: ({ results, score }) => {
      if (results.preprocessStepResult?.hardGateFailed) {
        return `The candidate failed a hard gate check (token estimate: ${results.preprocessStepResult.tokenEstimate}). Explain this failure briefly.`;
      }
      const d = results.analyzeStepResult;
      return `Composite score: ${score?.toFixed(2)}
Dimensions: evidence=${d.evidenceGrounding}, specificity=${d.specificity}, noRegression=${d.noRegression}, accuracy=${d.factualAccuracy}
Weakest: ${d.weakestDimension}

Write a one-sentence critique suitable as feedback for a redraft attempt. Focus on the weakest dimension.`;
    },
  });
```

**Standalone execution (used by the refinement workflow):**

```typescript
const result = await personalityScorer.run({
  output: {
    candidateSoul,
    candidateIdentity,
    currentSoul,
    currentIdentity,
    observations,
  },
});
// result.score        → 0.0–1.0 composite
// result.reason       → human-readable critique for redraft
// result.analyzeStepResult → per-dimension breakdown
```

**Why `createScorer()` instead of a custom function:**

- Auto-persists results to Mastra's `mastra_scorers` table — free audit trail
- Visible in Mastra Studio alongside built-in scorers
- Same API as the built-in scorers we'll add in Phase 2 (faithfulness, tone)
- `.run()` method works standalone — no agent attachment needed for POC

**Location:** `src/learning/scorers/personality.ts`

**Acceptance:**

- Default seed files scored against themselves → high no-regression, low
  specificity (they're generic).
- A draft with fabricated facts → low factual accuracy, low evidence.
- A draft that's clearly better and grounded → composite ≥ 0.7.
- Results appear in `mastra_scorers` table after each `.run()` call.

---

### 4.8 `/learn` Command

New Telegram command that manually triggers the refinement workflow,
bypassing signal threshold and cooldown checks.

**Behavior:**

1. User sends `/learn`.
2. Bot replies: "Starting personality refinement..."
3. Bot runs `refinePersonalityWorkflow.createRun()` with `triggerSource: 'manual'`.
4. Bot replies with outcome: "Refinement complete. [COMMITTED | ABORTED].
   Score: 0.XX. [change_summary]"

**Triage is also bypassed** — the `/learn` command goes straight to the
learning loop. It's a dev/debug tool.

**Location:** Add handler in `src/telegram/telegram-bot.ts` alongside
existing `/start`, `/help`, `/status` commands.

**Acceptance:**

- `/learn` triggers the workflow and replies with the outcome.
- A `refinement_log` row is created with `trigger_source = 'manual'` and
  `triage_result = 'BYPASSED'`.

---

### 4.9 DEV_MODE Config

Environment variable `LEARNING_DEV_MODE` that makes development testing
practical.

| Setting                      | Production | DEV_MODE                                      |
| ---------------------------- | ---------- | --------------------------------------------- |
| Cooldown between refinements | 24 hours   | 5 minutes                                     |
| Signal threshold (normal)    | 5          | 3                                             |
| Signal threshold (first run) | 3          | 2                                             |
| Console logging              | Info level | Verbose (all signals, triage results, scores) |

**Location:** `src/learning/config.ts`

```typescript
export const LEARNING_CONFIG = {
  devMode: process.env.LEARNING_DEV_MODE === "true",
  get cooldownMs() {
    return this.devMode ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
  },
  get signalThreshold() {
    return this.devMode ? 3 : 5;
  },
  get firstRunThreshold() {
    return this.devMode ? 2 : 3;
  },
  scoreThreshold: 0.7,
  maxIterations: 3,
  triageModel: "google/gemini-2.5-flash" as const,
  draftModel: "openrouter/openai/gpt-5-mini" as const,
  aspectId: "personality" as const,
};
```

**Env vars to add to `.env.example`:**

```
LEARNING_DEV_MODE=true
GOOGLE_API_KEY=your-google-api-key
```

**Acceptance:** With `LEARNING_DEV_MODE=true`, back-to-back `/learn` calls
succeed within minutes. With `LEARNING_DEV_MODE` unset, auto-triggered runs
respect 24h cooldown.

---

## 5. Integration Points

### 5.1 After-message hook (signal detection)

After the sovereign agent responds to a message, run signal detection.
This hooks into the existing message queue worker in `telegram-bot.ts`.

```
existing: message → agent.generate() → reply
add:      message → agent.generate() → reply → detectSignals()
                                                  ↓ (if shouldTrigger)
                                               triageGate()
                                                  ↓ (if YES)
                                               refinePersonalityWorkflow.createRun()
```

**Important:** Signal detection and triage run **after** the response is
sent. The user never waits for the learning loop. If triage triggers the
full workflow, it runs asynchronously (fire-and-forget with error logging).

### 5.2 Mastra index registration

Register the `refinePersonalityWorkflow` in `src/mastra/index.ts`:

```typescript
workflows: {
  (weatherWorkflow, refinePersonalityWorkflow);
}
```

This makes it visible in Mastra Studio for debugging.

### 5.3 Database migrations

`src/learning/migrations.ts` must be called at startup from `src/mastra/index.ts`,
using the same `personalityClient` (they share `.data/personality.db`).

---

## 6. File Plan

```
apps/api/src/
  learning/                          # NEW directory
    config.ts                        # LEARNING_CONFIG, DEV_MODE
    migrations.ts                    # learning_state + refinement_log tables
    signal.ts                        # detectSignals(), regex patterns, OM tag parsing
    triage.ts                        # triageGate()
    scorers/
      personality.ts                 # personalityScorer (createScorer pipeline)
  mastra/
    agents/
      sovereign.ts                   # MODIFIED: add observationalMemory config
    workflows/
      refine-personality.ts          # NEW: the refinement workflow
    index.ts                         # MODIFIED: register workflow, run learning migrations
  telegram/
    telegram-bot.ts                  # MODIFIED: add /learn command, after-message hook
```

**New files:** 6
**Modified files:** 3

---

## 7. Environment Variables

| Variable            | Required  | Default | Purpose                                                |
| ------------------- | --------- | ------- | ------------------------------------------------------ |
| `GOOGLE_API_KEY`    | Yes (new) | —       | Gemini Flash for OM observer, triage gate, scorer      |
| `LEARNING_DEV_MODE` | No        | `false` | Enables fast iteration (5min cooldown, low thresholds) |

**Existing vars unchanged:** `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`.

---

## 8. Success Criteria

### Must pass (POC is a failure without these)

| #   | Criterion                                                   | How to verify                                                                              |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | OM produces observations with `[SIGNAL:*]` tags             | Mastra Studio → Observational Memory tab after 20+ messages                                |
| 2   | `/learn` command runs the full workflow end-to-end          | Send `/learn` in Telegram, get a COMMITTED or ABORTED response                             |
| 3   | Committed SOUL/IDENTITY are measurably better than defaults | Read the committed files — they contain real user facts and style observations             |
| 4   | `refinement_log` has complete audit trail                   | Query `SELECT * FROM refinement_log` — rows have all fields populated                      |
| 5   | No regression in normal chat quality                        | Chat normally for 20+ messages after a refinement commit — responses are as good or better |

### Should pass (validates design assumptions)

| #   | Criterion                           | How to verify                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| 6   | Triage gate correctly filters noise | Run 10+ triages — ≥80% of YES/NO decisions are correct (human judgment)                    |
| 7   | Feedback loop improves scores       | Compare iteration 1 vs iteration 2 scores across 5+ runs — iteration 2 should score higher |
| 8   | Auto-trigger fires appropriately    | After enough signal-dense messages, refinement triggers without `/learn`                   |
| 9   | Cold-start path works               | New user with < 30K tokens of conversation can still get a refinement via `/learn`         |

### Nice to have (bonus learnings)

| #   | Criterion              | How to verify                                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 10  | OM tag hit rate        | What % of signals are caught by OM tags vs regex? Informs whether custom observer instruction is worth keeping      |
| 11  | Cost per refinement    | Check LLM usage logs — is actual cost within the $0.05–0.10/run estimate?                                           |
| 12  | Iteration distribution | How many loops does it typically take to pass? If always 1 → scorer might be too lenient. If always 3 → too strict. |

---

## 9. Risks & Mitigations

| Risk                                            | Impact                                    | Mitigation                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| OM doesn't produce `[SIGNAL:*]` tags reliably   | Signal detection depends on OM            | Regex runs in parallel — always catches basic signals regardless of OM. Spike (§4.0) verifies OM API before building.        |
| Scorer is too strict → everything aborts        | No personality updates happen             | Start with `scoreThreshold: 0.7` not 0.8. Monitor commit/abort ratio. Lower threshold if abort rate > 50%.                   |
| Scorer is too lenient → bad content committed   | User sees degraded agent quality          | Version history provides instant rollback. `/soul revert` is Phase 3 but manual DB rollback works for POC.                   |
| OM hasn't observed enough for cold-start users  | First refinement produces shallow results | Cold-start fallback reads raw messages. Lower threshold for first run. `/learn` bypasses all gates.                          |
| Draft LLM fabricates facts                      | IDENTITY contains wrong info about user   | Evidence grounding scorer dimension (weight 0.30) + factual accuracy (0.25) penalizes fabrication. Hard gate on empty files. |
| Refinement workflow blocks message processing   | User waits for learning loop              | Workflow runs async (fire-and-forget) after response is sent. Never blocks the message queue.                                |
| `GOOGLE_API_KEY` adds a new provider dependency | Setup friction                            | Document in `.env.example`. Gemini Flash is free tier or very cheap. Could swap to OpenRouter model if needed.               |

---

## 10. Testing Plan

### During development

1. **Unit test the scorer** — Call `personalityScorer.run()` with known
   good/bad candidate pairs, verify scores land in expected ranges.
   Results auto-persist to `mastra_scorers` table for review.

2. **Unit test signal regex** — Feed known message strings, verify correct
   signal types detected.

3. **Integration test the workflow** — Run `refinePersonalityWorkflow` in
   Mastra Studio's workflow tester with a real `resourceId` that has message
   history.

### During POC evaluation (1-2 weeks)

1. **Daily use** — Chat normally with Sovereign via Telegram. Let signal
   detection and auto-trigger run naturally.

2. **Periodic `/learn`** — Manually trigger refinement every few days to
   observe results.

3. **Check `refinement_log`** — Query the table to track:
   - How many runs? Commit vs abort ratio?
   - Average composite score?
   - Average iterations needed?
   - Triage skip rate?

4. **Read SOUL/IDENTITY diffs** — After each commit, manually compare old
   vs new files. Are the changes genuinely better?

5. **Regression check** — After a commit, send 10 messages across different
   topics. Do responses feel like they "know" you better? Any regressions?

---

## 11. Implementation Order

Build in this order. Each step is independently verifiable before moving to
the next.

| Order | Item                                                | Depends on               | Verifiable by                                   |
| ----- | --------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| 1     | `src/learning/config.ts`                            | nothing                  | import works                                    |
| 2     | `src/learning/migrations.ts` + wire into `index.ts` | config                   | tables exist in DB after restart                |
| 3     | Spike: `src/scripts/verify-om-api.ts`               | nothing                  | prints OM record or confirms API exists         |
| 4     | Enable OM on sovereign agent                        | spike confirms API       | OM observations appear in Studio after chatting |
| 5     | `src/learning/signal.ts`                            | config, migrations       | signal count increments visible in logs         |
| 6     | `src/learning/triage.ts`                            | signal                   | manual triage call returns YES/NO with reason   |
| 7     | `src/learning/scorers/personality.ts`               | nothing                  | `personalityScorer.run()` returns expected scores for known inputs |
| 8     | `src/mastra/workflows/refine-personality.ts`        | triage, scorer, signal   | workflow runs in Studio                         |
| 9     | `/learn` command in `telegram-bot.ts`               | workflow                 | `/learn` in Telegram triggers full loop         |
| 10    | After-message hook in `telegram-bot.ts`             | signal, triage, workflow | auto-trigger fires after enough signals         |
| 11    | `.env.example` update                               | all                      | documented                                      |

---

## 12. Definition of Done

The POC is complete when:

1. All "must pass" success criteria (§8) are verified.
2. At least 50 messages have been exchanged with the bot post-OM-enable.
3. At least 3 refinement runs have completed (mix of manual and auto).
4. `refinement_log` has been reviewed and key metrics recorded.
5. A decision is made: **proceed to Phase 2** or **iterate on POC**.

### Decision criteria for proceeding to Phase 2

- Commit rate ≥ 50% (scorer isn't too strict)
- Committed files are subjectively better than defaults (human judgment)
- Auto-trigger fires at reasonable intervals (not too noisy, not too quiet)
- No regressions in normal chat quality after commits
- Cost per refinement is within acceptable range (< $0.15/run)
