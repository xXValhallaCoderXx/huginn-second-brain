export const DEFAULT_PORT = 3000;

export function getServerPort() {
    const port = Number.parseInt(process.env.PORT?.trim() || `${DEFAULT_PORT}`, 10);
    return Number.isFinite(port) ? port : DEFAULT_PORT;
}

export function getTelegramWebhookUrl() {
    const explicitWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL?.trim();

    if (explicitWebhookUrl) {
        return explicitWebhookUrl;
    }

    const railwayPublicDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

    if (railwayPublicDomain) {
        return `https://${railwayPublicDomain}/telegram/webhook`;
    }

    throw new Error('TELEGRAM_WEBHOOK_URL is not set and RAILWAY_PUBLIC_DOMAIN is unavailable');
}
