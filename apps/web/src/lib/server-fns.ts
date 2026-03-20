import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createPersonalityStore } from "@huginn/shared";
import { auth } from "./auth";
import { db } from "./db";
import { resolveAccount } from "./account-resolution";

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
