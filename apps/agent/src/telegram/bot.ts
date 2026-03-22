import { Bot } from "grammy";

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
    return bot;
}

export function getBot(): Bot | null {
    return bot;
}

export function getBotUsername(): string | null {
    return botUsername;
}
