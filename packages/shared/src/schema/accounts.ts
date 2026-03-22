import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", {
    id: uuid("id").primaryKey().defaultRandom(),
    googleSub: text("google_sub").notNull().unique(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
