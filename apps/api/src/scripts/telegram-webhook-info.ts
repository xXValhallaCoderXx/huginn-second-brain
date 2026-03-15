import { loadEnvironment } from '../config/load-env.js';
import { getTelegramWebhookInfo } from '../telegram/telegram-client.js';

loadEnvironment(import.meta.url);

const info = await getTelegramWebhookInfo();

console.log(JSON.stringify(info, null, 2));