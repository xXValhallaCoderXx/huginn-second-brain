# Add Memory, Personality, and Example Tool to Huginn
## Current State
* Mastra + Hono server with Telegram webhook route
* Huginn agent: stateless, generic instructions, no memory, no tools
* Model: `openrouter/anthropic/claude-sonnet-4.6`
* Telegram bot forwards messages to agent via `huginnAgent.generate(userMessage)` with no resource/thread context
* No `.env` file yet (only `.env.example` with `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`)
## 1. Memory — Observational Memory + libSQL Storage
### 1a. Install packages
```warp-runnable-command
npm install @mastra/memory@latest @mastra/libsql@latest
```
### 1b. Add libSQL storage to Mastra instance
In `src/mastra/index.ts`, add a `LibSQLStore` at the instance level so all agents share it.
Use `file:./mastra.db` for local dev (file-based SQLite). Mastra auto-creates tables on first use.
### 1c. Add Memory with OM to the Huginn agent
In `src/mastra/agents/huginn.ts`:
* Import `Memory` from `@mastra/memory`
* Create a `Memory` instance with `observationalMemory` enabled
* OM default model is `google/gemini-2.5-flash` (needs `GOOGLE_GENERATIVE_AI_API_KEY`). Since we're already on OpenRouter, use `openrouter/google/gemini-2.5-flash` instead to keep everything on one API key.
* Pass the `Memory` instance to the agent's `memory` option
### 1d. Update Telegram bot handler to pass resource + thread
In `src/telegram/bot.ts`:
* Every `agent.generate()` call must include `memory: { resource, thread }`
* `resource`: hardcode `"nate"` for MVP (single-player)
* `thread`: use the Telegram chat ID (`ctx.chat.id.toString()`) — each Telegram chat becomes its own conversation thread
This means the agent will remember conversations per-chat, and OM will compress old messages automatically.
### 1e. Update `.env.example`
No new env vars needed — OM model routes through the existing `OPENROUTER_API_KEY`.
Add a `LIBSQL_URL` var for future flexibility (default: `file:./mastra.db`).
## 2. Personality Files
### 2a. Create personality directory and files
Create `src/personality/` with three files:
* `SOUL.md` — How Huginn communicates (tone, style, verbosity preferences)
* `IDENTITY.md` — Who the user is and who Huginn is
* `MEMORY.md` — Standing facts, preferences, context Huginn should always know
Keep them short for MVP — a few paragraphs each. The user will edit these over time.
### 2b. Load and inject into agent instructions
Create a helper `src/personality/load.ts` that:
* Reads the three `.md` files from disk at import time
* Exports a combined string
Update `huginn.ts` to use this combined personality string as the base of `instructions`.
## 3. Example Tool — Current Date/Time
A simple tool that gives the agent awareness of the current date and time, since LLMs don't know this natively.
### 3a. Create the tool
Create `src/mastra/tools/datetime-tool.ts` using `createTool()` from `@mastra/core/tools`.
* `id`: `"get-current-datetime"`
* No input needed
* Returns current date, time, day of week, timezone
### 3b. Wire into the agent
Import the tool in `huginn.ts` and add it to the `tools` object.
Update instructions to mention the tool is available.
## Files Changed
* `package.json` — new deps (`@mastra/memory`, `@mastra/libsql`)
* `src/mastra/index.ts` — add `LibSQLStore` storage
* `src/mastra/agents/huginn.ts` — add Memory + personality + tool
* `src/telegram/bot.ts` — pass `resource` + `thread` to `generate()`
* `src/personality/SOUL.md` — new file
* `src/personality/IDENTITY.md` — new file
* `src/personality/MEMORY.md` — new file
* `src/personality/load.ts` — new file (reads personality files)
* `src/mastra/tools/datetime-tool.ts` — new file
* `.env.example` — add `LIBSQL_URL`
* `.gitignore` — add `*.db` for libSQL data files
