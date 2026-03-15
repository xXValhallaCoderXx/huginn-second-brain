import type { TelegramApiResponse, TelegramWebhookInfo } from './telegram-types.js';

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const TELEGRAM_MESSAGE_LIMIT = 4096;

function getTelegramBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }

    return token;
}

async function telegramApi<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const token = getTelegramBotToken();
    const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/${method}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
    });

    const data = (await response.json()) as TelegramApiResponse<T>;

    if (!response.ok || !data.ok) {
        const description = 'description' in data ? data.description : undefined;
        throw new Error(`Telegram API ${method} failed${description ? `: ${description}` : ''}`);
    }

    return data.result;
}

export function splitTelegramMessage(text: string, maxLength = TELEGRAM_MESSAGE_LIMIT): string[] {
    const normalized = text.trim();

    if (!normalized) {
        return [];
    }

    if (normalized.length <= maxLength) {
        return [normalized];
    }

    const chunks: string[] = [];
    const paragraphs = normalized.split(/\n{2,}/);
    let current = '';

    const flushCurrent = () => {
        if (current.trim()) {
            chunks.push(current.trim());
            current = '';
        }
    };

    for (const paragraph of paragraphs) {
        const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

        if (candidate.length <= maxLength) {
            current = candidate;
            continue;
        }

        flushCurrent();

        if (paragraph.length <= maxLength) {
            current = paragraph;
            continue;
        }

        const lines = paragraph.split('\n');
        let lineBuffer = '';

        for (const line of lines) {
            const lineCandidate = lineBuffer ? `${lineBuffer}\n${line}` : line;

            if (lineCandidate.length <= maxLength) {
                lineBuffer = lineCandidate;
                continue;
            }

            if (lineBuffer) {
                chunks.push(lineBuffer.trim());
                lineBuffer = '';
            }

            if (line.length <= maxLength) {
                lineBuffer = line;
                continue;
            }

            for (let index = 0; index < line.length; index += maxLength) {
                chunks.push(line.slice(index, index + maxLength).trim());
            }
        }

        if (lineBuffer.trim()) {
            current = lineBuffer.trim();
        }
    }

    flushCurrent();

    return chunks.filter(Boolean);
}

export async function sendTelegramMessage(params: {
    chatId: number;
    text: string;
    replyToMessageId?: number;
}) {
    return telegramApi('sendMessage', {
        chat_id: params.chatId,
        text: params.text,
        link_preview_options: {
            is_disabled: true,
        },
        ...(params.replyToMessageId
            ? {
                reply_parameters: {
                    message_id: params.replyToMessageId,
                    allow_sending_without_reply: true,
                },
            }
            : {}),
    });
}

export async function sendTelegramChatAction(params: {
    chatId: number;
    action: 'typing' | 'upload_photo' | 'record_voice' | 'upload_document';
}) {
    return telegramApi('sendChatAction', {
        chat_id: params.chatId,
        action: params.action,
    });
}

export async function setTelegramWebhook(params: {
    url: string;
    secretToken?: string;
    allowedUpdates?: string[];
    dropPendingUpdates?: boolean;
}) {
    return telegramApi<boolean>('setWebhook', {
        url: params.url,
        secret_token: params.secretToken,
        allowed_updates: params.allowedUpdates,
        drop_pending_updates: params.dropPendingUpdates,
    });
}

export async function getTelegramWebhookInfo() {
    return telegramApi<TelegramWebhookInfo>('getWebhookInfo');
}
