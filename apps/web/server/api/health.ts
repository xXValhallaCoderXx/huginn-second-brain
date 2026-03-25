import { defineEventHandler } from "h3";

export default defineEventHandler(() => {
    const required = [
        "DATABASE_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "BETTER_AUTH_SECRET",
    ];
    const optional = [
        "AGENT_URL",
        "APP_URL",
        "RAILWAY_PUBLIC_DOMAIN",
        "CALENDAR_ENCRYPTION_KEY",
        "PORT",
    ];

    return {
        status: "ok",
        timestamp: new Date().toISOString(),
        env: {
            required: Object.fromEntries(
                required.map((k) => [k, !!process.env[k]]),
            ),
            optional: Object.fromEntries(
                optional.map((k) => [k, !!process.env[k]]),
            ),
        },
    };
});
