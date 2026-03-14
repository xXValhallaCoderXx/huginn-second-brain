import { Mastra } from "@mastra/core";
import { registerApiRoute } from "@mastra/core/server";
import { webhookCallback } from "grammy";
import { huginnAgent } from "./agents/huginn.js";
import { bot } from "../telegram/bot.js";
import { storage } from "./storage.js";

// Register the webhook with Telegram when the server starts, if configured.
// Set TELEGRAM_WEBHOOK_URL to your public deployment URL, e.g.:
//   https://<your-app>.up.railway.app/telegram/webhook
if (process.env.TELEGRAM_WEBHOOK_URL) {
  bot.api
    .setWebhook(process.env.TELEGRAM_WEBHOOK_URL)
    .then(() =>
      console.log(
        "[Telegram] Webhook registered:",
        process.env.TELEGRAM_WEBHOOK_URL
      )
    )
    .catch((err: unknown) =>
      console.error("[Telegram] Failed to register webhook:", err)
    );
}

const handleTelegramUpdate = webhookCallback(bot, "hono");

export const mastra = new Mastra({
  agents: { huginnAgent },
  storage,
  server: {
    apiRoutes: [
      registerApiRoute("/telegram/webhook", {
        method: "POST",
        // grammY's HonoAdapter is structurally compatible with Hono's Context;
        // the cast aligns the generic variables that Mastra adds to the context.
        handler: (c) =>
          handleTelegramUpdate(c as Parameters<typeof handleTelegramUpdate>[0]),
      }),
    ],
  },
});
