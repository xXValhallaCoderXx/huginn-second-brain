export interface TelegramUser {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
}

export interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
    first_name?: string;
    last_name?: string;
}

export interface TelegramMessage {
    message_id: number;
    chat: TelegramChat;
    from?: TelegramUser;
    text?: string;
    caption?: string;
}

export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    data?: string;
}

export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface TelegramApiSuccess<T> {
    ok: true;
    result: T;
}

export interface TelegramApiFailure {
    ok: false;
    description?: string;
    error_code?: number;
}

export type TelegramApiResponse<T> = TelegramApiSuccess<T> | TelegramApiFailure;

export interface TelegramWebhookInfo {
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    allowed_updates?: string[];
}
