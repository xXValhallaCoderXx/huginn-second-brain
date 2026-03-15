# TODO — Hardening & Future Work

## Token Management
- [ ] **Smarter maxOutputTokens**: Currently hardcoded at `4000` in `telegram-bot.ts`. Should dynamically calculate headroom based on model context window, input token count, and working memory template size — and warn when approaching limits.
- [ ] **Context window overflow**: When `lastMessages: 20` + large system prompt approaches the model's context limit, older messages get silently truncated. Add a strategy (summarisation, sliding window) to handle this gracefully rather than failing or losing context.

## Security
- [ ] **Telegram webhook secret**: `TELEGRAM_WEBHOOK_SECRET` is currently set to the placeholder `replace-with-a-random-secret` in `.env`. Implement actual secret validation in the webhook handler so unauthenticated requests are rejected.
- [ ] **Input sanitisation**: Telegram messages are passed directly into the agent prompt. Add length caps and strip control characters before forwarding to the LLM.
- [ ] **Rate limiting**: No per-user rate limiting on the message queue. A single user can spam messages and rack up LLM costs. Add a per-user token bucket or cooldown.

## Reliability
- [ ] **Queue backpressure**: The message queue has no max depth. Under high load it will grow unbounded. Add a max queue size per chat and drop or reject overflow messages with a user-facing notice.
- [ ] **Agent generate error handling**: If `agent.generate()` throws (LLM error, timeout, etc.), the error is currently unhandled inside the worker. Wrap in try/catch and send the user a fallback message rather than silently failing.
- [ ] **Personality store cache invalidation**: The 30s TTL cache in `store.ts` means edits to SOUL/IDENTITY won't be reflected until the cache expires. Add an explicit `invalidate(resourceId)` method and call it after any write.

## Observability
- [ ] **Structured logging**: Console logs are plain strings. Replace with a structured logger (e.g. `pino`) with log levels, so production logs can be filtered and ingested by a log aggregator.
- [ ] **Working memory update confirmation**: The `WARN: Tool input validation failed for updateWorkingMemory` error is swallowed silently. Surface these failures as a metric or alert so degraded memory is visible.

## Personality Layer (Phase 2 / Phase 3 per PRD)
- [ ] **Observational Memory**: Add a second memory layer that passively accumulates facts about the user (interests, habits, preferences) without requiring explicit updates — see PRD Phase 2.
- [ ] **Personality Refinement Workflow**: Build the scheduled workflow at `src/mastra/workflows/personality-refinement.ts` that reviews conversation history and proposes IDENTITY updates — see PRD Phase 3.
- [ ] **User-editable SOUL/IDENTITY**: Expose a mechanism (Telegram command or future UI) for the user to view and edit their SOUL and IDENTITY files directly.
