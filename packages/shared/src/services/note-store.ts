import { eq, and, desc, ilike, or, sql, count } from "drizzle-orm";
import type { Database } from "../db";
import { notes } from "../schema/notes";
import type { NoteRevision, NoteRelationship } from "../schema/notes";
import { noteEmbeddings } from "../schema/note-embeddings";
import { noteLinks } from "../schema/note-links";
import type {
  Note,
  NoteStore,
  NoteLink,
  ScoredNote,
  KnowledgeGraph,
  KnowledgeStats,
  CreateNoteInput,
  UpdateNoteInput,
  ListNotesOptions,
} from "../types/notes";

function toNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    accountId: row.accountId,
    title: row.title,
    content: row.content,
    tags: row.tags ?? [],
    source: row.source ?? null,
    capturedBy: row.capturedBy,
    revisions: (row.revisions as NoteRevision[]) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNoteLink(row: typeof noteLinks.$inferSelect): NoteLink {
  return {
    id: row.id,
    sourceNoteId: row.sourceNoteId,
    targetNoteId: row.targetNoteId,
    relationship: row.relationship,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createNoteStore(db: Database, openrouterApiKey?: string): NoteStore {
  async function embedText(text: string): Promise<number[]> {
    const apiKey = openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY required for embeddings");

    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  async function upsertEmbeddingInternal(noteId: string, content: string): Promise<void> {
    const embedding = await embedText(content);
    const vectorLiteral = `[${embedding.join(",")}]`;

    await db.execute(
      sql`INSERT INTO note_embeddings (note_id, embedding, embedded_at)
          VALUES (${noteId}, ${vectorLiteral}::vector, NOW())
          ON CONFLICT (note_id) DO UPDATE
          SET embedding = ${vectorLiteral}::vector, embedded_at = NOW()`,
    );
  }

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
      const note = toNote(row);

      // Fire-and-forget embedding generation
      upsertEmbeddingInternal(note.id, `${note.title}\n${note.content}`).catch((err) => {
        console.error(`[note-store] Failed to generate embedding for note ${note.id}:`, err);
      });

      return note;
    },

    async update(noteId, accountId, updates) {
      // Fetch current note to preserve in revisions
      const current = await db.query.notes.findFirst({
        where: and(eq(notes.id, noteId), eq(notes.accountId, accountId)),
      });
      if (!current) return null;

      // Push current state into revisions
      const currentRevisions = (current.revisions as NoteRevision[]) ?? [];
      const newRevision: NoteRevision = {
        title: current.title,
        content: current.content,
        updatedAt: current.updatedAt.toISOString(),
        reason: updates.reason,
      };

      const values: Record<string, unknown> = {
        updatedAt: new Date(),
        revisions: [...currentRevisions, newRevision],
      };
      if (updates.title !== undefined) values.title = updates.title;
      if (updates.content !== undefined) values.content = updates.content;
      if (updates.tags !== undefined) values.tags = updates.tags;

      const [row] = await db
        .update(notes)
        .set(values)
        .where(and(eq(notes.id, noteId), eq(notes.accountId, accountId)))
        .returning();

      if (!row) return null;
      const note = toNote(row);

      // Fire-and-forget embedding regeneration
      upsertEmbeddingInternal(note.id, `${note.title}\n${note.content}`).catch((err) => {
        console.error(`[note-store] Failed to regenerate embedding for note ${note.id}:`, err);
      });

      return note;
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

    async searchFullText(accountId, query, limit = 10) {
      // Convert user query to tsquery: split words and join with &
      const tsQuery = query
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.replace(/[^\w]/g, ""))
        .filter(Boolean)
        .join(" & ");

      if (!tsQuery) return [];

      const rows = await db.execute(
        sql`SELECT n.*, ts_rank_cd(n.search_vector, to_tsquery('english', ${tsQuery})) AS rank
            FROM notes n
            WHERE n.account_id = ${accountId}
              AND n.search_vector @@ to_tsquery('english', ${tsQuery})
            ORDER BY rank DESC
            LIMIT ${limit}`,
      );

      return rows.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        accountId: (row.account_id ?? row.accountId) as string,
        title: row.title as string,
        content: row.content as string,
        tags: (row.tags as string[]) ?? [],
        source: (row.source as Note["source"]) ?? null,
        capturedBy: (row.captured_by ?? row.capturedBy) as "user" | "agent",
        revisions: (row.revisions as NoteRevision[]) ?? [],
        createdAt: typeof row.created_at === "string" ? row.created_at as string : (row.created_at as Date)?.toISOString?.() ?? "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at as string : (row.updated_at as Date)?.toISOString?.() ?? "",
      } as Note));
    },

    async searchSemantic(accountId, text, limit = 5, minSimilarity = 0.7) {
      const embedding = await embedText(text);
      const vectorLiteral = `[${embedding.join(",")}]`;

      const rows = await db.execute(
        sql`SELECT n.*, 1 - (ne.embedding <=> ${vectorLiteral}::vector) AS similarity
            FROM notes n
            JOIN note_embeddings ne ON ne.note_id = n.id
            WHERE n.account_id = ${accountId}
              AND 1 - (ne.embedding <=> ${vectorLiteral}::vector) > ${minSimilarity}
            ORDER BY ne.embedding <=> ${vectorLiteral}::vector
            LIMIT ${limit}`,
      );

      return rows.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        accountId: (row.account_id ?? row.accountId) as string,
        title: row.title as string,
        content: row.content as string,
        tags: (row.tags as string[]) ?? [],
        source: (row.source as Note["source"]) ?? null,
        capturedBy: (row.captured_by ?? row.capturedBy) as "user" | "agent",
        revisions: (row.revisions as NoteRevision[]) ?? [],
        createdAt: typeof row.created_at === "string" ? row.created_at as string : (row.created_at as Date)?.toISOString?.() ?? "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at as string : (row.updated_at as Date)?.toISOString?.() ?? "",
        similarity: Number(row.similarity),
      } as ScoredNote));
    },

    async list(accountId, options?: ListNotesOptions) {
      const conditions = [eq(notes.accountId, accountId)];

      if (options?.capturedBy) {
        conditions.push(eq(notes.capturedBy, options.capturedBy));
      }
      if (options?.tags?.length) {
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

    async listAll() {
      const rows = await db
        .select()
        .from(notes)
        .orderBy(desc(notes.createdAt));
      return rows.map(toNote);
    },

    async tags(accountId) {
      const result = await db.execute<{ tag: string }>(
        sql`SELECT DISTINCT unnest(${notes.tags}) AS tag FROM ${notes} WHERE ${notes.accountId} = ${accountId} ORDER BY tag`,
      );
      return result.rows.map((r) => r.tag);
    },

    // ── Links ──

    async link(sourceNoteId, targetNoteId, relationship) {
      const [row] = await db
        .insert(noteLinks)
        .values({ sourceNoteId, targetNoteId, relationship })
        .onConflictDoUpdate({
          target: [noteLinks.sourceNoteId, noteLinks.targetNoteId],
          set: { relationship },
        })
        .returning();
      return toNoteLink(row);
    },

    async unlink(sourceNoteId, targetNoteId) {
      await db
        .delete(noteLinks)
        .where(
          and(
            eq(noteLinks.sourceNoteId, sourceNoteId),
            eq(noteLinks.targetNoteId, targetNoteId),
          ),
        );
    },

    async getLinks(noteId) {
      const rows = await db
        .select()
        .from(noteLinks)
        .where(
          or(
            eq(noteLinks.sourceNoteId, noteId),
            eq(noteLinks.targetNoteId, noteId),
          ),
        );
      return rows.map(toNoteLink);
    },

    // ── Graph ──

    async getGraph(accountId) {
      const [notesResult, linksResult] = await Promise.all([
        db
          .select({
            id: notes.id,
            title: notes.title,
            tags: notes.tags,
            capturedBy: notes.capturedBy,
            revisions: notes.revisions,
            updatedAt: notes.updatedAt,
          })
          .from(notes)
          .where(eq(notes.accountId, accountId)),

        db
          .select()
          .from(noteLinks)
          .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
          .where(eq(notes.accountId, accountId)),
      ]);

      // Count links per node
      const linkCounts = new Map<string, number>();
      for (const l of linksResult) {
        linkCounts.set(l.note_links.sourceNoteId, (linkCounts.get(l.note_links.sourceNoteId) ?? 0) + 1);
        linkCounts.set(l.note_links.targetNoteId, (linkCounts.get(l.note_links.targetNoteId) ?? 0) + 1);
      }

      return {
        nodes: notesResult.map((n) => ({
          id: n.id,
          title: n.title,
          tags: n.tags ?? [],
          capturedBy: n.capturedBy as "user" | "agent",
          revisionCount: ((n.revisions as NoteRevision[]) ?? []).length,
          linkCount: linkCounts.get(n.id) ?? 0,
          updatedAt: n.updatedAt.toISOString(),
        })),
        edges: linksResult.map((l) => ({
          source: l.note_links.sourceNoteId,
          target: l.note_links.targetNoteId,
          relationship: l.note_links.relationship as NoteRelationship,
        })),
      };
    },

    async getStats(accountId) {
      const [noteCountResult, linkCountResult] = await Promise.all([
        db
          .select({ value: count() })
          .from(notes)
          .where(eq(notes.accountId, accountId)),
        db
          .select({ value: count() })
          .from(noteLinks)
          .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
          .where(eq(notes.accountId, accountId)),
      ]);

      return {
        noteCount: noteCountResult[0]?.value ?? 0,
        linkCount: linkCountResult[0]?.value ?? 0,
      };
    },

    // ── Embeddings ──

    async embed(text) {
      return embedText(text);
    },

    async upsertEmbedding(noteId, content) {
      return upsertEmbeddingInternal(noteId, content);
    },
  };
}
