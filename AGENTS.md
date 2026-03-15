# AGENTS.md

This document provides guidance for AI coding agents working in this repository.

## CRITICAL: Mastra Skill Required

**BEFORE doing ANYTHING with Mastra code or answering Mastra questions, load the Mastra skill FIRST.**

See [Mastra Skills section](#mastra-skills) for loading instructions.

## Project Overview

This is a **Mastra** project written in TypeScript. Mastra is a framework for building AI-powered applications and agents with a modern TypeScript stack.

## Commands

Use these commands to interact with the project.

### Installation

```bash
npm install
```

### Development

Start the Mastra Studio at localhost:4111 by running the `dev` script:

```bash
npm run dev
```

### Build

In order to build a production-ready server, run the `build` script:

```bash
npm run build
```

## Project Structure

Folders organize your agent's resources, like agents, tools, and workflows.

| Folder                 | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mastra`           | Entry point for all Mastra-related code and configuration.                                                                               |
| `src/mastra/agents`    | Define and configure your agents - their behavior, goals, and tools.                                                                     |
| `src/mastra/workflows` | Define multi-step workflows that orchestrate agents and tools together.                                                                  |
| `src/mastra/tools`     | Create reusable tools that your agents can call                                                                                          |
| `src/mastra/mcp`       | (Optional) Implement custom MCP servers to share your tools with external agents                                                         |
| `src/mastra/scorers`   | (Optional) Define scorers for evaluating agent performance over time                                                                     |
| `src/mastra/public`    | (Optional) Contents are copied into the `.build/output` directory during the build process, making them available for serving at runtime |

### Top-level files

Top-level files define how your Mastra project is configured, built, and connected to its environment.

| File                  | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/mastra/index.ts` | Central entry point where you configure and initialize Mastra.                                                    |
| `.env.example`        | Template for environment variables - copy and rename to `.env` to add your secret [model provider](/models) keys. |
| `package.json`        | Defines project metadata, dependencies, and available npm scripts.                                                |
| `tsconfig.json`       | Configures TypeScript options such as path aliases, compiler settings, and build output.                          |

## Telegram Webhook

The bot uses Telegram's webhook mode. Telegram pushes updates to a public URL — **updating `.env` alone does NOT push the new URL to Telegram**. You must re-register the webhook any time the URL changes (new ngrok session, new deployment domain, etc.).

### Re-register the webhook

```bash
pnpm telegram:webhook:set
```

This calls `apps/api/src/scripts/set-telegram-webhook.ts`, which reads `TELEGRAM_WEBHOOK_URL` from `.env` and calls the Telegram Bot API `setWebhook` method.

### When to run this

- Every time you start a new ngrok session (the URL changes each time)
- After deploying to a new Railway domain
- Any time the bot stops receiving messages despite the server running

### Check current webhook status

```bash
pnpm telegram:webhook:info
```

### Agent key convention

Mastra's `mastra.getAgent(key)` looks up agents by their **object key** in the `agents: {}` map in `src/mastra/index.ts` — **not** by the agent's `id` property. These must match:

```typescript
// src/mastra/index.ts
agents: { sovereign: sovereignAgent }  // key = 'sovereign'

// telegram-bot.ts
getConfiguredTelegramAgentKey() // must return 'sovereign'
```

If you add a new agent, ensure the key in the `agents` map matches whatever string `getConfiguredTelegramAgentKey()` returns.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Mastra .well-known skills discovery](https://mastra.ai/.well-known/skills/index.json)
