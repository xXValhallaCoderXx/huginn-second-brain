import { registerApiRoute } from '@mastra/core/server';
import { getTelegramWebhookHandler } from '../../telegram/telegram-bot.js';



export const telegramRoutes = [
    registerApiRoute('/telegram/webhook', {
        method: 'POST',
        requiresAuth: false,
        openapi: {
            summary: 'Telegram webhook receiver',
            description: 'Receives Telegram Bot API updates through grammY and forwards supported text messages to a configured Mastra agent.',
            tags: ['Telegram'],
            responses: {
                200: {
                    description: 'Telegram update processed',
                },
                401: {
                    description: 'Invalid Telegram secret token',
                },
            },
        },
        handler: async c => {
            const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
            const receivedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');

            console.info('[telegram] webhook route hit');

            if (expectedSecret && receivedSecret !== expectedSecret) {
                console.warn('[telegram] webhook secret mismatch');
                return c.json({ ok: false, error: 'invalid telegram webhook secret' }, 401);
            }

            const mastra = c.get('mastra');
            const webhookHandler = getTelegramWebhookHandler(mastra);
            return webhookHandler(c);
        },
    }),
    registerApiRoute('/telegram/health', {
        method: 'GET',
        requiresAuth: false,
        openapi: {
            summary: 'Telegram integration status',
            description: 'Returns non-secret Telegram integration status information for this Mastra server.',
            tags: ['Telegram'],
            responses: {
                200: {
                    description: 'Telegram integration status returned',
                },
            },
        },
        handler: async c => {
            return c.json({
                ok: true,
                telegram: {
                    botTokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
                    webhookUrlConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL?.trim()),
                    webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
                    agent: "genericAgent",
                },
            });
        },
    }),
];
