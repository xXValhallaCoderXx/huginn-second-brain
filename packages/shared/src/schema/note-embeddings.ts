import { pgTable, uuid, timestamp, customType } from "drizzle-orm/pg-core";
import { notes } from "./notes";

const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
});

export const noteEmbeddings = pgTable("note_embeddings", {
  noteId: uuid("note_id")
    .primaryKey()
    .references(() => notes.id, { onDelete: "cascade" }),
  embedding: vector("embedding").notNull(),
  embeddedAt: timestamp("embedded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
