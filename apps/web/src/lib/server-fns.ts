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
