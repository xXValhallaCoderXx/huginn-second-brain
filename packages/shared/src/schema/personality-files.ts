import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts.js";

export const personalityFiles = pgTable("personality_files", {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
        .notNull()
        .references(() => accounts.id, { onDelete: "cascade" }),
    fileType: text("file_type").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
