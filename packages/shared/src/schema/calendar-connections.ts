import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const calendarConnections = pgTable(
    "calendar_connections",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        provider: text("provider").notNull(), // 'google' | 'outlook' | 'caldav'
        providerEmail: text("provider_email").notNull(),
        displayName: text("display_name"),
        accessToken: text("access_token").notNull(), // AES-256-GCM encrypted
        refreshToken: text("refresh_token").notNull(), // AES-256-GCM encrypted
        tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
        scopes: text("scopes").notNull(),
        enabled: boolean("enabled").notNull().default(true),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        uniqueAccountProviderEmail: uniqueIndex("uq_cal_account_provider_email").on(
            table.accountId,
            table.provider,
            table.providerEmail,
        ),
    }),
);
