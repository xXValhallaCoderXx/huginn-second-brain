import { Bot, webhookCallback } from "grammy";

let bot: Bot | null = null;
let botUsername: string | null = null;

export async function createBot(): Promise<Bot | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log("[telegram] No TELEGRAM_BOT_TOKEN set, skipping bot setup");
        return null;
    }
    bot = new Bot(token);
    await bot.init();
    botUsername = bot.botInfo.username;
    console.log(`[telegram] Bot username: @${botUsername}`);

    // Auto-register bot commands on startup
    await bot.api.setMyCommands([
        { command: "start", description: "Link your account" },
        { command: "link", description: "Link with a code" },
        { command: "brief", description: "Get your daily briefing" },
    ]);
    console.log("[telegram] Bot commands registered");

    return bot;
}

export function getBot(): Bot | null {
    return bot;
}

export function getBotUsername(): string | null {
    return botUsername;
}

/**
 * Returns the webhook URL if running in production (Railway),
 * or null if we should use long polling (dev).
 */
export function getWebhookUrl(): string | null {
    if (process.env.WEBHOOK_URL) return process.env.WEBHOOK_URL;
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
        return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/telegram/webhook`;
    }
    return null;
}

/**
 * Register the webhook with Telegram's API.
 */
export async function setWebhook(url: string): Promise<void> {
    if (!bot) throw new Error("Bot not initialized");
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    await bot.api.setWebhook(url, {
        ...(secret ? { secret_token: secret } : {}),
    });
    console.log(`[telegram] Webhook set: ${url}`);
}

/**
 * Returns a Hono-compatible webhook handler for grammY.
 */
export function getWebhookCallback() {
    if (!bot) throw new Error("Bot not initialized");
    return webhookCallback(bot, "hono", {
        secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
    });
}
