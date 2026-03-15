# Learning Engine POC — Summary

> Quick reference for what's been built, what's planned, and key decisions.
>
> Full docs: [POC PRD](docs/design/LEARNING-ENGINE-POC-PRD.md) · [System Design](docs/design/learning-engine-system-design.md)

---

## What It Does

Sovereign's SOUL and IDENTITY personality files start as static defaults. The learning engine watches conversations, detects meaningful signals (facts, preferences, corrections), and periodically refines those files — making the agent genuinely adapt to each user over time.

**Core loop:** detect signals → triage gate → gather observations → draft update → score → critique/redraft → commit or abort

---

## What's Built

### Identity Layer (complete, working)

| File | Purpose |
|------|---------|
| `src/identity/types.ts` | `PersonalityFileType`, `PersonalityStore` interface, `VersionEntry` |
| `src/identity/store.ts` | `DatabasePersonalityStore` — upsert with versioning, 30s cache, singleton |
| `src/identity/migrate.ts` | `personality_files`, `personality_file_history`, `user_preferences` tables |
| `src/identity/seed.ts` | `DEFAULT_SOUL`, `DEFAULT_IDENTITY`, `ensureUserSeeded()` |
| `src/identity/instructions.ts` | `buildInstructions()` — SOUL + IDENTITY + BASE joined at runtime |

### Learning Engine (in progress)

| File | Status | Purpose |
|------|--------|---------|
| `src/learning/config.ts` | ✅ Done | `DEV_MODE`, thresholds, cooldowns, model config |
| `src/learning/migrations.ts` | ✅ Done | `learning_state` + `refinement_log` tables |
| `src/learning/signal.ts` | ✅ Done | Dual-path signal detection (regex + OM tag parsing) |
| `src/learning/triage.ts` | ✅ Done | Cheap LLM gate — "is there anything new worth learning?" |
| `src/learning/scorers/personality.ts` | ✅ Done | `createScorer()` pipeline (see below) |
| `src/learning/loop.ts` | ✅ Done | Orchestrates the full refinement cycle |
| `src/learning/db.ts` | ✅ Done | Database helpers for learning state + logging |
| `src/mastra/workflows/refine-personality.ts` | 🔲 TODO | Mastra workflow wrapping the loop |
| Sovereign OM config | 🔲 TODO | Enable Observational Memory on the agent |
| `/learn` command | 🔲 TODO | Telegram command to manually trigger refinement |
| After-message hook | 🔲 TODO | Auto-trigger via signal detection after each message |

### Sovereign Agent (complete, working)

- Agent with async instructions via `RequestContext` (per-user personality injection)
- Resource-scoped Working Memory, `lastMessages: 20`, `maxOutputTokens: 4000`
- Telegram bot: webhook mode, `/start`, `/help`, `/status`, per-chat queue, dedup guard

---

## Key Design Decisions

### Personality Scorer — `createScorer()` Pipeline

Replaced a custom multi-scorer approach with a single `createScorer()` from `@mastra/core/evals`. Four-step pipeline:

1. **Preprocess** (deterministic) — Hard gates: token budget, empty files → auto-fail
2. **Analyze** (LLM judge) — Gemini Flash scores all 4 dimensions in one call
3. **GenerateScore** (deterministic) — Weighted composite: evidence 0.30, specificity 0.20, no-regression 0.25, accuracy 0.25
4. **GenerateReason** (LLM) — One-sentence critique fed back as redraft input

**Why this approach:**
- Single LLM call instead of 4 parallel scorers — cheaper, simpler
- Auto-persists to `mastra_scorers` table — free audit trail
- Visible in Mastra Studio
- Same API as built-in scorers we'll add in Phase 2

### No `@mastra/evals` Package Needed

`createScorer()` lives in `@mastra/core/evals` which is already installed. The separate `@mastra/evals` package provides prebuilt scorers (faithfulness, hallucination, tone consistency) — useful for Phase 2 but not needed for the POC's custom scorer.

### Signal Detection — Dual Path

Regex patterns on raw messages (always runs) + OM `[SIGNAL:*]` tag parsing (when OM has data). Both paths deduplicated. Regex ensures signals are caught even before OM is fully warmed up.

### Feedback Loop with `.dountil()`

Score fails → reason becomes critique → redraft → re-score. Up to 3 iterations. Mastra's `.dountil()` workflow primitive handles the loop.

---

## Key Areas / Watch Items

1. **OM Observer Instructions** — The custom `[SIGNAL:*]` tagging instruction needs testing. If the OM model ignores tags, regex is the fallback (already parallel, not dependent).

2. **Scorer Calibration** — `scoreThreshold: 0.7` is a starting guess. If commit rate < 50%, lower it. If bad content slips through, raise it. Track via `refinement_log`.

3. **Cold Start** — Users with < 30K tokens of conversation may not have OM observations yet. Fallback reads last 40 raw messages. First-run threshold is halved (3 → 2 signals in dev mode).

4. **Cost** — Each refinement run: ~1 triage call + 1–3 draft calls + 1–3 scorer judge calls + 1–3 reason calls. Estimated $0.05–0.10/run with Gemini Flash. Monitor via LLM usage logs.

5. **Token Budget** — Each personality file capped at 1500 tokens. Combined hard gate at 3000. If files grow too large, the scorer auto-fails and critique tells the drafter to trim.

6. **Regression Safety** — Full version history in `personality_file_history`. Manual rollback via DB query for now; `/soul revert` command planned for Phase 3.

---

## Next Steps (Implementation Order)

1. ~~`config.ts`~~ ✅
2. ~~`migrations.ts`~~ ✅
3. Spike: `scripts/verify-om-api.ts` — confirm OM storage API works
4. Enable OM on sovereign agent
5. ~~`signal.ts`~~ ✅
6. ~~`triage.ts`~~ ✅
7. ~~`scorers/personality.ts`~~ ✅
8. `workflows/refine-personality.ts` — Mastra workflow wrapping the loop
9. `/learn` command in Telegram bot
10. After-message hook for auto-triggering
11. `.env.example` update

---

## File Map

```
apps/api/src/
  identity/                     # Personality storage layer (DONE)
    types.ts
    store.ts
    migrate.ts
    seed.ts
    instructions.ts
  learning/                     # Learning engine (PARTIAL)
    config.ts                   # DEV_MODE, thresholds, models
    migrations.ts               # learning_state + refinement_log
    signal.ts                   # Dual-path signal detection
    triage.ts                   # LLM gate
    db.ts                       # DB helpers
    loop.ts                     # Refinement orchestrator
    scorers/
      personality.ts            # createScorer() pipeline
  mastra/
    agents/sovereign.ts         # Sovereign agent (DONE)
    workflows/
      refine-personality.ts     # TODO: Mastra workflow
    index.ts                    # Mastra instance (DONE)
  telegram/
    telegram-bot.ts             # Telegram bot (DONE, /learn TODO)

docs/design/
  LEARNING-ENGINE-POC-PRD.md    # Full requirements
  learning-engine-system-design.md  # Architecture deep dive
```
