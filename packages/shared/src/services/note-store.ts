import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../db";
import { notes } from "../schema/notes";
import type { Note, NoteStore, CreateNoteInput, UpdateNoteInput, ListNotesOptions } from "../types/notes";

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    content: row.content,
    tags: row.tags ?? [],
    source: row.source ?? null,
    capturedBy: row.capturedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createNoteStore(db: Database): NoteStore {
  return {
    async create(accountId, input) {
      const [row] = await db
        .insert(notes)
        .values({
          accountId,
          title: input.title,
          content: input.content,
          tags: input.tags ?? [],
          source: input.source ?? null,
          capturedBy: input.capturedBy,
        })
        .returning();
      return toNote(row);
    },

    async update(noteId, accountId, updates) {
      const values: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (updates.title !== undefined) values.title = updates.title;
      if (updates.content !== undefined) values.content = updates.content;
      if (updates.tags !== undefined) values.tags = updates.tags;

      const [row] = await db
        .update(notes)
        .set(values)
        .where(and(eq(notes.id, noteId), eq(notes.accountId, accountId)))
        .returning();
      return row ? toNote(row) : null;
    },

    async delete(noteId, accountId) {
      await db
        .delete(notes)
        .where(and(eq(notes.id, noteId), eq(notes.accountId, accountId)));
    },

    async get(noteId, accountId) {
      const row = await db.query.notes.findFirst({
        where: and(eq(notes.id, noteId), eq(notes.accountId, accountId)),
      });
      return row ? toNote(row) : null;
    },

    async search(accountId, query, limit = 10) {
      const pattern = `%${query}%`;
      const rows = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.accountId, accountId),
            or(
              ilike(notes.title, pattern),
              ilike(notes.content, pattern),
            ),
          ),
        )
        .orderBy(desc(notes.updatedAt))
        .limit(limit);
      return rows.map(toNote);
    },

    async list(accountId, options?: ListNotesOptions) {
      const conditions = [eq(notes.accountId, accountId)];

      if (options?.capturedBy) {
        conditions.push(eq(notes.capturedBy, options.capturedBy));
      }
      if (options?.tags?.length) {
        // Filter notes that contain ANY of the requested tags
        conditions.push(
          sql`${notes.tags} && ARRAY[${sql.join(options.tags.map(t => sql`${t}`), sql`, `)}]::text[]`,
        );
      }

      const orderCol =
        options?.orderBy === "created_at" ? notes.createdAt : notes.updatedAt;

      const rows = await db
        .select()
        .from(notes)
        .where(and(...conditions))
        .orderBy(desc(orderCol))
        .limit(options?.limit ?? 50)
        .offset(options?.offset ?? 0);

      return rows.map(toNote);
    },

    async tags(accountId) {
      const result = await db.execute<{ tag: string }>(
        sql`SELECT DISTINCT unnest(${notes.tags}) AS tag FROM ${notes} WHERE ${notes.accountId} = ${accountId} ORDER BY tag`,
      );
      return result.rows.map((r) => r.tag);
    },
  };
}
