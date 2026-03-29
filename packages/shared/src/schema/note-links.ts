import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { notes, type NoteRelationship } from "./notes";

export const noteLinks = pgTable("note_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceNoteId: uuid("source_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  targetNoteId: uuid("target_note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  relationship: text("relationship").notNull().$type<NoteRelationship>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  uniqueLink: uniqueIndex("uq_note_links_source_target").on(table.sourceNoteId, table.targetNoteId),
  sourceIdx: index("note_links_source_idx").on(table.sourceNoteId),
  targetIdx: index("note_links_target_idx").on(table.targetNoteId),
}));
