## Monorepo layout

This repository is now organized as a small pnpm workspace:

```text
apps/
	api/           # Mastra + Hono + Telegram service
	public-docs/   # public-facing Docusaurus site
	private-docs/  # internal/private Docusaurus site
```

## Getting started

From the repository root:

```text
pnpm install
pnpm dev
```

Then open:

```text
http://localhost:3000
```

The root scripts proxy into `apps/api`, so local development still feels like a single app.

The server automatically uses `PORT` in hosted environments such as Railway.

## Docs apps

Two separate Docusaurus apps live alongside the API:

- `apps/public-docs` for public-facing product and onboarding docs
- `apps/private-docs` for internal runbooks, operations notes, and team-only guides

Useful commands from the repository root:

```text
pnpm dev:public-docs
pnpm dev:private-docs
pnpm build:docs
```

The docs apps are scaffolded as independent docs-only sites, so you can deploy them separately without coupling them to the Telegram API service.

## Telegram bot integration

This project now includes a Telegram webhook route at:

```
/telegram/webhook
```

Add these values to the repository-root `.env`:

```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_URL=https://your-public-domain/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=replace-with-a-random-secret
```

Set the webhook after your public HTTPS URL is live:

```
npm run telegram:webhook:set
```

Check the current webhook status:

```
npm run telegram:webhook:info
```

Notes:

- Telegram webhooks require a public HTTPS URL.
- The webhook route is handled through `grammY` using its Hono webhook adapter.
- `TELEGRAM_WEBHOOK_SECRET` is validated in the Mastra route handler before the request reaches grammY. Do **not** also pass `secretToken` to grammY's `webhookCallback()` (see Known Gotchas below).
- The default Telegram agent and allowed update types now live in code for this POC.
- The bot includes best-effort in-memory duplicate update suppression to reduce retry spam if Telegram redelivers the same update.
- Normal Telegram messages are queued into a simple in-memory per-chat background worker, so the webhook can return quickly instead of waiting for the full Mastra generation.

### Webhook timeout strategy

For this POC, the safer implementation is:

- accept the webhook update quickly
- enqueue the work in memory
- process each chat sequentially in the background
- send the final answer back with the bot API

This is better than doing `agent.generate(...)` directly inside the webhook request because it reduces Telegram retry and timeout problems.

Limitations of this POC approach:

- the queue is in-memory only
- queued work is lost if the server restarts
- it is single-instance friendly, not multi-instance durable

If you later want a production-ready version, the next step would be a durable external queue.

For local development without public HTTPS, use a tunnel such as ngrok or Cloudflare Tunnel and set `TELEGRAM_WEBHOOK_URL` to the public tunnel URL.

## Railway deployment

For a basic Railway deployment, this is the prep I recommend.

### Recommended monorepo setting

Set the Railway service **Root Directory** to:

```text
apps/api
```

That keeps Railway focused on just the API service even after you add other apps like docs.

If you prefer leaving the Railway service at the repository root, change the service commands instead:

- Build command: `pnpm --filter @huginn/api build`
- Start command: `pnpm --filter @huginn/api start`

Using `apps/api` as the root directory is the simpler option.

### Use a separate hosted Telegram bot

To avoid clashes with local development, use a different bot token in Railway than the one in your local `.env`.

Recommended split:

- local bot token for ngrok/local testing
- hosted bot token for Railway

Also use a different `TELEGRAM_WEBHOOK_SECRET` in Railway.

### Minimal Railway secrets

For Railway, keep secrets minimal:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
TELEGRAM_BOT_TOKEN=your-hosted-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=your-random-secret
```

Optional:

```dotenv
TELEGRAM_WEBHOOK_URL=https://your-railway-domain/telegram/webhook
```

If `TELEGRAM_WEBHOOK_URL` is not set, the webhook setup script derives it automatically from Railway's `RAILWAY_PUBLIC_DOMAIN`.

### Railway service settings

- Root directory: `apps/api`
- Build command: `pnpm build`
- Start command: `pnpm start`
- Health check path: `/telegram/health`
- Public domain: enabled

### Register the hosted webhook

After Railway is deployed and has a public domain, run:

```text
pnpm telegram:webhook:set
```

with the Railway environment (or equivalent secrets) so Telegram points the hosted bot at the hosted service.

If Railway gives the service a new public domain after the migration, run the webhook setup step again so Telegram points at the new URL.

### What is hardcoded in code now

These POC defaults now live in code instead of env:

- model: `openrouter/openai/gpt-5-mini`
- Telegram agent: `genericAgent`
- Telegram allowed updates: `message`, `edited_message`

That keeps deployment config focused on actual secrets and host-specific settings only.

## Known gotchas

### Webhook secret must not be validated twice

The webhook secret is validated in the Mastra route handler (`apps/api/src/mastra/routes/telegram-routes.ts`) before the request reaches grammY. Do **not** also pass `secretToken` to grammY's `webhookCallback()` — the double validation causes grammY to silently reject requests when running behind Mastra's Hono context wrapper, resulting in webhooks that hit the app but produce no response and no error logs.

### `TELEGRAM_WEBHOOK_SECRET` is yours to define

This is an arbitrary string you create — Telegram does not generate or provide it. You pass it to Telegram when registering the webhook (`secret_token` in the `setWebhook` API call), and Telegram sends it back in the `X-Telegram-Bot-Api-Secret-Token` header on every webhook delivery. Your app checks the header to verify the request is authentic. The value in your deployment environment must match the value used when running `npm run telegram:webhook:set`.

### Webhook registration is manual

The webhook is **not** registered automatically on app startup. After every deploy where the URL or bot token changes, you must run `npm run telegram:webhook:set` with the correct environment variables pointing at the deployed URL.

### `getWebhookInfo` returns "Unauthorized"

This means the `TELEGRAM_BOT_TOKEN` is invalid — either copied incorrectly, regenerated since it was set, or belongs to a different bot. Fix the token first; nothing else will work until Telegram accepts it.

