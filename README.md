## Getting started

```
npm install
npm run dev
```

Then open:

```
http://localhost:3000
```

## Telegram bot integration

This project now includes a Telegram webhook route at:

```
/telegram/webhook
```

Add these values to `.env`:

```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_URL=https://your-public-domain/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=replace-with-a-random-secret
TELEGRAM_AGENT=genericAgent
TELEGRAM_ALLOWED_UPDATES=message,edited_message
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
- `TELEGRAM_WEBHOOK_SECRET` is passed to `grammY` so it validates `X-Telegram-Bot-Api-Secret-Token` for you.
- `TELEGRAM_AGENT` now defaults to `genericAgent`, which is a simple base second-brain assistant for this POC.
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

