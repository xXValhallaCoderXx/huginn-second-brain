import { Bot } from 'grammy';
import { splitTelegramMessage } from './telegram-client.js';

let _pushBot: Bot | undefined;

function getPushBot(): Bot {
    if (!_pushBot) {
        const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not set');
        }
        _pushBot = new Bot(token);
    }
    return _pushBot;
}

/**
 * Proactively push a text message to a Telegram chat without waiting for a user message.
 * Used by scheduled workflows (e.g. the daily briefing) to deliver content on a schedule.
 */
export async function pushTelegramMessage(chatId: number | string, text: string): Promise<void> {
    const bot = getPushBot();
    const chunks = splitTelegramMessage(text);

    for (const chunk of chunks) {
        await bot.api.sendMessage(chatId, chunk, {
            link_preview_options: { is_disabled: true },
        });
    }
}

/**
 * Return the configured default briefing chat ID from env.
 * Returns undefined if not configured.
 */
export function getBriefingChatId(): number | undefined {
    const raw = process.env.TELEGRAM_BRIEFING_CHAT_ID?.trim();
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}
