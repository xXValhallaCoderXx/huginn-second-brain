import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createPersonalityStore, createAccountService } from "@huginn/shared";
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
