import 'dotenv/config';

import { getTelegramWebhookInfo } from '../telegram/telegram-client.js';

const info = await getTelegramWebhookInfo();

console.log(JSON.stringify(info, null, 2));