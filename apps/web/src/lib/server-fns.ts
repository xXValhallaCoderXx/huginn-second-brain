import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createPersonalityStore, createAccountService, createCalendarConnectionService, createCalendarService } from "@huginn/shared";
import { auth } from "./auth";
import { db } from "./db";
import { resolveAccount } from "./account-resolution";

/** Resolve session → account, throw if unauthenticated. */
async function resolveAuthenticatedAccount() {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({
        headers: headers as unknown as Headers,
    });
    if (!session) throw new Error("Unauthorized");
    const account = await resolveAccount(db, session);
    if (!account) throw new Error("Account not found");
    return account;
}

/**
 * Server function: get session + resolve Huginn account.
 * Used by _authenticated layout's beforeLoad.
 */
export const getAuthenticatedAccount = createServerFn({ method: "GET" }).handler(
    async () => {
        const headers = getRequestHeaders();
        const session = await auth.api.getSession({
            headers: headers as unknown as Headers,
        });

        if (!session) {
            return null;
        }

        const account = await resolveAccount(db, session);
        return account;
    },
);

/**
 * Server function: load personality files for dashboard display.
 */
export const loadPersonalityFiles = createServerFn({ method: "GET" })
    .inputValidator((data: { accountId: string }) => data)
    .handler(async ({ data }) => {
        const store = createPersonalityStore(db);
        const [soul, identity] = await Promise.all([
            store.load(data.accountId, "SOUL"),
            store.load(data.accountId, "IDENTITY"),
        ]);
        return { soul, identity };
    });

/**
 * Server function: save a personality file (append-only versioning).
 */
export const savePersonalityFile = createServerFn({ method: "POST" })
    .inputValidator(
        (data: { accountId: string; fileType: "SOUL" | "IDENTITY"; content: string; reason: string }) => data,
    )
    .handler(async ({ data }) => {
        const store = createPersonalityStore(db);
        await store.save(data.accountId, data.fileType, data.content, data.reason);
        return { success: true };
    });

/**
 * Server function: load version history for a personality file.
 */
export const loadPersonalityHistory = createServerFn({ method: "GET" })
    .inputValidator((data: { accountId: string; fileType: "SOUL" | "IDENTITY" }) => data)
    .handler(async ({ data }) => {
        const store = createPersonalityStore(db);
        return store.history(data.accountId, data.fileType);
    });

/**
 * Server function: generate a one-time Telegram linking code + deep link URL.
 * Fetches bot username from the agent service to construct the deep link.
 */
export const generateLinkingCode = createServerFn({ method: "POST" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createAccountService(db);
        const code = await svc.createLinkingCode(account.id, "telegram");

        // Fetch bot username from agent service
        let botUsername: string | null = null;
        try {
            const agentUrl = process.env.AGENT_URL ?? "http://localhost:4111";
            const res = await fetch(`${agentUrl}/telegram/info`);
            if (res.ok) {
                const info = (await res.json()) as { username: string };
                botUsername = info.username;
            }
        } catch {
            // Agent unreachable — fall back to manual code display
        }

        const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
        return { code, deepLink, botUsername };
    });

/**
 * Server function: get all channel links for the authenticated account.
 */
export const getChannelLinks = createServerFn({ method: "GET" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createAccountService(db);
        return svc.getChannelLinks(account.id);
    });

/**
 * Server function: unlink Telegram channel from the authenticated account.
 */
export const unlinkTelegramChannel = createServerFn({ method: "POST" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createAccountService(db);
        await svc.unlinkChannel(account.id, "telegram");
        return { success: true };
    });

/**
 * Server function: check if Telegram is linked to the authenticated account.
 */
export const checkTelegramLinked = createServerFn({ method: "GET" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createAccountService(db);
        const links = await svc.getChannelLinks(account.id);
        const telegram = links.find((l) => l.provider === "telegram");
        return { linked: !!telegram };
    });

// ── Calendar OAuth helpers ──

async function signState(payload: string): Promise<string> {
    const { createHmac } = await import("node:crypto");
    const secret = process.env.BETTER_AUTH_SECRET!;
    return createHmac("sha256", secret).update(payload).digest("hex");
}

export async function verifyState(state: string): Promise<{ accountId: string } | null> {
    try {
        const [payloadB64, sig] = state.split(".");
        if (!payloadB64 || !sig) return null;
        const expected = await signState(payloadB64);
        if (sig !== expected) return null;
        const decoded = JSON.parse(
            Buffer.from(payloadB64, "base64url").toString("utf8"),
        ) as { accountId: string; ts: number };
        // 10 minute expiry
        if (Date.now() - decoded.ts > 10 * 60 * 1000) return null;
        return { accountId: decoded.accountId };
    } catch {
        return null;
    }
}

/**
 * Server function: initiate Google Calendar OAuth flow.
 * Returns the Google consent URL for the client to redirect to.
 */
export const initiateCalendarOAuth = createServerFn({ method: "POST" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();

        const payload = Buffer.from(
            JSON.stringify({ accountId: account.id, ts: Date.now() }),
        ).toString("base64url");
        const sig = await signState(payload);
        const state = `${payload}.${sig}`;

        const params = new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            redirect_uri: `${process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3000")}/api/calendar/callback`,
            response_type: "code",
            scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email",
            access_type: "offline",
            prompt: "consent",
            state,
        });

        return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
    });

/**
 * Server function: list calendar connections (tokens stripped) for authenticated account.
 */
export const getCalendarConnections = createServerFn({ method: "GET" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createCalendarConnectionService(db);
        return svc.getConnectionInfo(account.id);
    });

/**
 * Server function: toggle a calendar connection on/off.
 */
export const toggleCalendarConnection = createServerFn({ method: "POST" })
    .inputValidator((data: { connectionId: string; enabled: boolean }) => data)
    .handler(async ({ data }) => {
        const account = await resolveAuthenticatedAccount();
        const svc = createCalendarConnectionService(db);
        // Ownership check: load connection and verify it belongs to this account
        const connections = await svc.getConnectionInfo(account.id);
        const conn = connections.find((c) => c.id === data.connectionId);
        if (!conn) throw new Error("Connection not found");
        await svc.toggleEnabled(data.connectionId, data.enabled);
        return { success: true };
    });

/**
 * Server function: update display name for a calendar connection.
 */
export const updateCalendarDisplayName = createServerFn({ method: "POST" })
    .inputValidator((data: { connectionId: string; displayName: string }) => data)
    .handler(async ({ data }) => {
        const account = await resolveAuthenticatedAccount();
        const svc = createCalendarConnectionService(db);
        const connections = await svc.getConnectionInfo(account.id);
        const conn = connections.find((c) => c.id === data.connectionId);
        if (!conn) throw new Error("Connection not found");
        await svc.updateDisplayName(data.connectionId, data.displayName);
        return { success: true };
    });

/**
 * Server function: delete a calendar connection.
 */
export const deleteCalendarConnection = createServerFn({ method: "POST" })
    .inputValidator((data: { connectionId: string }) => data)
    .handler(async ({ data }) => {
        const account = await resolveAuthenticatedAccount();
        const svc = createCalendarConnectionService(db);
        const connections = await svc.getConnectionInfo(account.id);
        const conn = connections.find((c) => c.id === data.connectionId);
        if (!conn) throw new Error("Connection not found");
        await svc.deleteConnection(data.connectionId);
        return { success: true };
    });

/**
 * Server function: fetch today's calendar events for the authenticated account.
 */
export const getTodayCalendarEvents = createServerFn({ method: "GET" })
    .handler(async () => {
        const account = await resolveAuthenticatedAccount();
        const svc = createCalendarService(db);
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const events = await svc.getEvents(account.id, { start: startOfDay, end: endOfDay });
        return events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            start: e.start.toISOString(),
            end: e.end.toISOString(),
            location: e.location,
            isAllDay: e.isAllDay,
            source: e.source,
        }));
    });
