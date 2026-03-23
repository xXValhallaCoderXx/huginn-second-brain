import { eq, and } from "drizzle-orm";
import type { Database } from "../db.js";
import { calendarConnections } from "../schema/calendar-connections.js";
import { encryptToken, decryptToken } from "./crypto.js";
import type {
    CalendarConnection,
    CalendarConnectionInfo,
    CalendarConnectionService,
    CalendarProviderType,
} from "../types/calendar.js";

function toConnection(
    row: typeof calendarConnections.$inferSelect,
): CalendarConnection {
    return {
        id: row.id,
        accountId: row.accountId,
        provider: row.provider as CalendarProviderType,
        providerEmail: row.providerEmail,
        displayName: row.displayName,
        accessToken: decryptToken(row.accessToken),
        refreshToken: decryptToken(row.refreshToken),
        tokenExpiresAt: row.tokenExpiresAt,
        scopes: row.scopes,
        enabled: row.enabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function toConnectionInfo(
    row: typeof calendarConnections.$inferSelect,
): CalendarConnectionInfo {
    return {
        id: row.id,
        accountId: row.accountId,
        provider: row.provider as CalendarProviderType,
        providerEmail: row.providerEmail,
        displayName: row.displayName,
        enabled: row.enabled,
        createdAt: row.createdAt,
    };
}

export function createCalendarConnectionService(
    db: Database,
): CalendarConnectionService {
    return {
        async getConnections(accountId) {
            const rows = await db.query.calendarConnections.findMany({
                where: eq(calendarConnections.accountId, accountId),
            });
            return rows.map(toConnection);
        },

        async getEnabledConnections(accountId) {
            const rows = await db.query.calendarConnections.findMany({
                where: and(
                    eq(calendarConnections.accountId, accountId),
                    eq(calendarConnections.enabled, true),
                ),
            });
            return rows.map(toConnection);
        },

        async getConnectionInfo(accountId) {
            const rows = await db.query.calendarConnections.findMany({
                where: eq(calendarConnections.accountId, accountId),
            });
            return rows.map(toConnectionInfo);
        },

        async createConnection(data) {
            const [row] = await db
                .insert(calendarConnections)
                .values({
                    accountId: data.accountId,
                    provider: data.provider,
                    providerEmail: data.providerEmail,
                    displayName: data.displayName ?? null,
                    accessToken: encryptToken(data.accessToken),
                    refreshToken: encryptToken(data.refreshToken),
                    tokenExpiresAt: data.tokenExpiresAt,
                    scopes: data.scopes,
                })
                .returning();
            return toConnection(row);
        },

        async updateTokens(id, accessToken, refreshToken, expiresAt) {
            await db
                .update(calendarConnections)
                .set({
                    accessToken: encryptToken(accessToken),
                    refreshToken: encryptToken(refreshToken),
                    tokenExpiresAt: expiresAt,
                    updatedAt: new Date(),
                })
                .where(eq(calendarConnections.id, id));
        },

        async toggleEnabled(id, enabled) {
            await db
                .update(calendarConnections)
                .set({ enabled, updatedAt: new Date() })
                .where(eq(calendarConnections.id, id));
        },

        async updateDisplayName(id, displayName) {
            await db
                .update(calendarConnections)
                .set({ displayName, updatedAt: new Date() })
                .where(eq(calendarConnections.id, id));
        },

        async deleteConnection(id) {
            await db
                .delete(calendarConnections)
                .where(eq(calendarConnections.id, id));
        },
    };
}
