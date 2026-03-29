import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export interface NoteSource {
  channel: string;
  threadId: string;
  messageId?: string;
  capturedAt: string;
}

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default([]),
  source: jsonb("source").$type<NoteSource>(),
  capturedBy: text("captured_by").notNull().$type<"user" | "agent">(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
