import { eq, and } from "drizzle-orm";
import type { Database } from "../db";
import { accounts } from "../schema/accounts";
import { authAccount } from "../schema/auth";
import type { Account, AccountService, ChannelLink } from "../types/accounts";

function toAccount(row: typeof accounts.$inferSelect): Account {
    return {
        id: row.id,
        googleSub: row.googleSub,
        email: row.email,
        displayName: row.displayName ?? undefined,
        createdAt: row.createdAt,
    };
}

/**
 * Queries Better Auth's `account` table to find the Google sub ID
 * for a given BA user ID. Used during account resolution.
 */
export async function getGoogleSubForBaUser(
    db: Database,
    baUserId: string,
): Promise<string | null> {
    const row = await db.query.authAccount.findFirst({
        where: and(
            eq(authAccount.userId, baUserId),
            eq(authAccount.providerId, "google"),
        ),
    });
    return row?.accountId ?? null;
}

export function createAccountService(db: Database): AccountService {
    return {
        async createAccount(googleSub, email, displayName) {
            const [row] = await db
                .insert(accounts)
                .values({ googleSub, email, displayName: displayName ?? null })
                .returning();
            return toAccount(row);
        },

        async getAccountByGoogleSub(googleSub) {
            const row = await db.query.accounts.findFirst({
                where: eq(accounts.googleSub, googleSub),
            });
            return row ? toAccount(row) : null;
        },

        async getAccountById(id) {
            const row = await db.query.accounts.findFirst({
                where: eq(accounts.id, id),
            });
            return row ? toAccount(row) : null;
        },

        // --- Channel linking (M3) ---

        async linkChannel(
            _accountId: string,
            _provider: "telegram",
            _providerUserId: string,
        ): Promise<ChannelLink> {
            throw new Error("Not implemented — M3");
        },

        async unlinkChannel(_accountId: string, _provider: "telegram"): Promise<void> {
            throw new Error("Not implemented — M3");
        },

        async resolveAccountFromChannel(
            _provider: "telegram",
            _providerUserId: string,
        ): Promise<Account | null> {
            throw new Error("Not implemented — M3");
        },

        async getChannelLinks(_accountId: string): Promise<ChannelLink[]> {
            throw new Error("Not implemented — M3");
        },

        // --- Linking codes (M3) ---

        async createLinkingCode(
            _accountId: string,
            _provider: "telegram",
        ): Promise<string> {
            throw new Error("Not implemented — M3");
        },

        async verifyLinkingCode(
            _code: string,
        ): Promise<{ accountId: string; provider: string } | null> {
            throw new Error("Not implemented — M3");
        },
    };
}
