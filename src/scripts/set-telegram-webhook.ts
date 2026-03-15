import 'dotenv/config';

import { getTelegramWebhookInfo, setTelegramWebhook } from '../telegram/telegram-client.js';

function getWebhookConfig() {
    const url = process.env.TELEGRAM_WEBHOOK_URL?.trim();

    if (!url) {
        throw new Error('TELEGRAM_WEBHOOK_URL is not set');
    }

    return {
        url,
        secretToken: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
        allowedUpdates: process.env.TELEGRAM_ALLOWED_UPDATES?.split(',').map(value => value.trim()).filter(Boolean) || [
            'message',
            'edited_message',
        ],
    };
}

const config = getWebhookConfig();

await setTelegramWebhook({
    url: config.url,
    secretToken: config.secretToken,
    allowedUpdates: config.allowedUpdates,
});

const info = await getTelegramWebhookInfo();

console.log('Telegram webhook configured successfully.');
console.log(JSON.stringify(info, null, 2));
