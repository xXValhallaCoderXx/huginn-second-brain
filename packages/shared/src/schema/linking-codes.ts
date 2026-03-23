import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const linkingCodes = pgTable("linking_codes", {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    provider: text("provider").notNull().default("telegram"),
    used: boolean("used").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
