# Issue: Hosted Telegram bot receives messages but Railway app does not respond

## Summary

The Telegram integration works locally via the ngrok webhook, but the hosted Railway deployment does not reply to Telegram messages.

The Railway service appears healthy and reachable, but Telegram messages sent to the hosted bot do not produce responses or visible webhook activity in Railway.

## Expected behavior

When a user sends a Telegram message to the hosted bot:

- Telegram should deliver a webhook request to the Railway app at `/telegram/webhook`
- the Railway app should log webhook activity
- the app should queue/process the message
- the bot should send a reply back to the Telegram chat

## Actual behavior

- the Railway app deploys successfully
- the Railway app reports itself as running
- the public health endpoint works:
  - `GET /telegram/health`
- sending a message to the hosted Telegram bot results in no reply
- Railway HTTP logs appear empty for the relevant time window
- Railway deploy logs only show startup, not webhook handling

## Hosted webhook URL under test

- `https://huginn-second-brain-production.up.railway.app/telegram/webhook`

This path is expected to be correct because the Telegram routes are registered as Mastra custom routes at root-level paths such as:

- `/telegram/webhook`
- `/telegram/health`

There should **not** be an `/api` prefix for these custom routes.

## Relevant environment setup

Hosted Railway variables include:

- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_URL`

A separate Telegram bot token is used for Railway versus local development to avoid clashes.

> Raw token values are intentionally omitted from this file.

## Runtime/deployment observations

- Railway starts the app successfully
- app logs show:
  - `Server is running on http://localhost:8080`
- this is expected on Railway because the app binds to the platform `PORT`
- the `punycode` deprecation warning is present but is not believed to be the cause of webhook failure

## Codebase observations

- server uses Railway-compatible port handling via runtime config
- app binds to `0.0.0.0`
- Telegram webhook route exists and is publicly reachable in principle
- route-level webhook logging was added to help detect:
  - webhook route hits
  - webhook secret mismatches
- background queue logging was added for Telegram processing flow

## Investigations already performed

### Confirmed working

- local Telegram flow via ngrok worked earlier
- hosted health endpoint responds successfully
- Railway app is online
- custom route path format appears correct
- `/api` prefix should not be used for the Telegram custom route

### Previously identified issue and fixed

- Telegram had previously been pointed at an old ngrok webhook URL
- webhook was re-registered for the current local tunnel during local debugging

### Current unresolved hosted issue

A direct Telegram Bot API call using the hosted bot context returned:

- `getWebhookInfo failed: Unauthorized`

This suggests that Telegram is rejecting the hosted bot credentials used for that API check.

## Current leading hypotheses

1. The hosted Telegram bot token being used by Railway is not the same as the intended BotFather token, or has been copied incorrectly
2. The hosted Telegram token may have been regenerated, making an older token invalid
3. The hosted bot webhook may not actually be registered successfully because Telegram rejects the token before webhook operations can succeed
4. Less likely but still possible: webhook secret mismatch after token issues are corrected

## Why `PORT` is unlikely to be the problem

The current runtime config already:

- reads `process.env.PORT`
- falls back to `3000` locally
- binds the server to `0.0.0.0`

The Railway startup log showing `localhost:8080` is expected and does not indicate a misconfiguration by itself.

## Recommended next steps

1. Re-copy or regenerate the hosted bot token from BotFather
2. Update `TELEGRAM_BOT_TOKEN` in Railway with the exact hosted token
3. Redeploy or restart the Railway service
4. Re-run webhook registration for the hosted bot against:
   - `https://huginn-second-brain-production.up.railway.app/telegram/webhook`
5. Check Telegram webhook info again
6. Send a test message and watch Railway HTTP logs and runtime logs

## Security note

Both local and hosted Telegram bot tokens were exposed during debugging and should be considered compromised.

Recommended action:

- regenerate both bot tokens in BotFather
- update local `.env`
- update Railway variables
- re-register the relevant webhooks
