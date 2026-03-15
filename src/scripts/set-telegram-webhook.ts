import 'dotenv/config';

import { getTelegramWebhookUrl } from '../config/runtime.js';
import { getTelegramWebhookInfo, setTelegramWebhook } from '../telegram/telegram-client.js';

function getWebhookConfig() {
    return {
        url: getTelegramWebhookUrl(),
        secretToken: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined,
        allowedUpdates: [...['message', 'edited_message'] as const],
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
