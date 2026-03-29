import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { NoteStore } from "@huginn/shared";

export const recallNotesTool = createTool({
  id: "recall-notes",
  description: `Search the user's knowledge base. Use this:
- When the user asks "what do I know about X?"
- When the user asks "what did I save about X?"
- BEFORE using capture-knowledge, to check for existing related notes
- When you want relevant context to improve your answer

Returns notes with similarity scores. For the search-before-save flow:
- similarity > 0.85 = very likely the same topic, UPDATE the existing note
- similarity 0.70-0.85 = related but distinct, CREATE new + LINK
- similarity < 0.70 = not related, CREATE new without links

If the user asks for everything, pass an empty query to list recent notes.`,
  inputSchema: z.object({
    query: z
      .string()
      .describe("What to search for, or empty string for recent notes"),
    limit: z.number().optional().describe("Max results, default 5"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by tags (only used when listing recent)"),
  }),
  execute: async (input, context) => {
    const accountId = context?.requestContext?.get("account-id") as
      | string
      | undefined;
    const noteStore = context?.requestContext?.get("note-store") as
      | NoteStore
      | undefined;

    if (!accountId || !noteStore) {
      return { found: 0, notes: [] };
    }

    if (input.query) {
      // Semantic search — catches conceptual similarity
      const results = await noteStore.searchSemantic(
        accountId,
        input.query,
        input.limit ?? 5,
        0.5, // Low threshold — let the agent decide based on score
      );

      return {
        found: results.length,
        notes: results.map((n) => ({
          id: n.id,
          title: n.title,
          content: n.content,
          tags: n.tags,
          similarity: Math.round(n.similarity * 100) / 100,
          capturedBy: n.capturedBy,
          revisionCount: n.revisions.length,
          updatedAt: n.updatedAt,
        })),
      };
    }

    // No query — list recent notes
    const results = await noteStore.list(accountId, {
      tags: input.tags,
      limit: input.limit ?? 10,
      orderBy: "updated_at",
    });

    return {
      found: results.length,
      notes: results.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        capturedBy: n.capturedBy,
        revisionCount: n.revisions.length,
        updatedAt: n.updatedAt,
      })),
    };
  },
});
