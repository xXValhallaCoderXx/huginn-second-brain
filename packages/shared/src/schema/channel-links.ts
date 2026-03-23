import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const channelLinks = pgTable(
    "channel_links",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        provider: text("provider").notNull(),
        providerUserId: text("provider_user_id").notNull(),
        linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        uniqueProviderUser: uniqueIndex("uq_provider_user").on(table.provider, table.providerUserId),
        uniqueAccountProvider: uniqueIndex("uq_account_provider").on(table.accountId, table.provider),
    }),
);
