import { eq, and, gt } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Database } from "../db";
import { accounts } from "../schema/accounts";
import { authAccount } from "../schema/auth";
import { channelLinks } from "../schema/channel-links";
import { linkingCodes } from "../schema/linking-codes";
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

function toChannelLink(row: typeof channelLinks.$inferSelect): ChannelLink {
    return {
        accountId: row.accountId,
        provider: row.provider as "telegram",
        providerUserId: row.providerUserId,
        linkedAt: row.linkedAt,
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

/**
 * Create an account with a specific ID (useful for tests/seeding).
 * Skips if account with that ID already exists.
 */
export async function ensureAccount(
    db: Database,
    id: string,
    googleSub: string,
    email: string,
    displayName?: string,
): Promise<Account> {
    const existing = await db.query.accounts.findFirst({
        where: eq(accounts.id, id),
    });
    if (existing) return toAccount(existing);

    const [row] = await db
        .insert(accounts)
        .values({ id, googleSub, email, displayName: displayName ?? null })
        .returning();
    return toAccount(row);
}

/**
 * Delete an account by ID (cascades to personality_files, channel_links, etc).
 */
export async function deleteAccount(db: Database, id: string): Promise<void> {
    await db.delete(accounts).where(eq(accounts.id, id));
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

        // --- Channel linking ---

        async linkChannel(accountId, provider, providerUserId) {
            const [row] = await db
                .insert(channelLinks)
                .values({ accountId, provider, providerUserId })
                .onConflictDoUpdate({
                    target: [channelLinks.accountId, channelLinks.provider],
                    set: { providerUserId },
                })
                .returning();
            return toChannelLink(row);
        },

        async unlinkChannel(accountId, provider) {
            await db
                .delete(channelLinks)
                .where(
                    and(
                        eq(channelLinks.accountId, accountId),
                        eq(channelLinks.provider, provider),
                    ),
                );
        },

        async resolveAccountFromChannel(provider, providerUserId) {
            const link = await db.query.channelLinks.findFirst({
                where: and(
                    eq(channelLinks.provider, provider),
                    eq(channelLinks.providerUserId, providerUserId),
                ),
            });
            if (!link) return null;

            const account = await db.query.accounts.findFirst({
                where: eq(accounts.id, link.accountId),
            });
            return account ? toAccount(account) : null;
        },

        async getChannelLinks(accountId) {
            const rows = await db.query.channelLinks.findMany({
                where: eq(channelLinks.accountId, accountId),
            });
            return rows.map(toChannelLink);
        },

        // --- Linking codes ---

        async createLinkingCode(accountId, provider) {
            const code = `LINK-${randomBytes(2).toString("hex").toUpperCase()}`;
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            await db.insert(linkingCodes).values({
                accountId,
                code,
                provider,
                expiresAt,
            });
            return code;
        },

        async verifyLinkingCode(code) {
            const row = await db.query.linkingCodes.findFirst({
                where: and(
                    eq(linkingCodes.code, code),
                    eq(linkingCodes.used, false),
                    gt(linkingCodes.expiresAt, new Date()),
                ),
            });
            if (!row) return null;
            return { accountId: row.accountId, provider: row.provider };
        },
    };
}

/**
 * Mark a linking code as used. Called after successful linkChannel().
 * Separate from verifyLinkingCode so verification is idempotent (safe for polling).
 */
export async function consumeLinkingCode(
    db: Database,
    code: string,
): Promise<void> {
    await db
        .update(linkingCodes)
        .set({ used: true })
        .where(eq(linkingCodes.code, code));
}

/**
 * Atomically verify AND consume a linking code in a single UPDATE.
 * Only one concurrent caller can succeed — prevents race conditions.
 * Used by the Telegram bot's /link handler.
 */
export async function verifyAndConsumeLinkingCode(
    db: Database,
    code: string,
): Promise<{ accountId: string; provider: string } | null> {
    const [row] = await db
        .update(linkingCodes)
        .set({ used: true })
        .where(
            and(
                eq(linkingCodes.code, code),
                eq(linkingCodes.used, false),
                gt(linkingCodes.expiresAt, new Date()),
            ),
        )
        .returning();
    if (!row) return null;
    return { accountId: row.accountId, provider: row.provider };
}
