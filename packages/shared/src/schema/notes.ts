import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";

export interface NoteSource {
  channel: string;
  threadId: string;
  messageId?: string;
  capturedAt: string;
}

export interface NoteRevision {
  title: string;
  content: string;
  updatedAt: string;
  reason: string;
}

export type NoteRelationship = "related" | "extends" | "contradicts" | "supersedes";

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  source: jsonb("source").$type<NoteSource>(),
  capturedBy: text("captured_by").notNull().$type<"user" | "agent">(),
  revisions: jsonb("revisions").$type<NoteRevision[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  accountIdx: index("notes_account_id_idx").on(table.accountId),
  tagsIdx: index("notes_tags_idx").using("gin", table.tags),
}));
