import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { NoteStore } from "@huginn/shared";

export const recallNotesTool = createTool({
  id: "recall-notes",
  description:
    `Search the user's saved notes. Use this when:
    - The user asks "what do I know about X?"
    - The user asks "what did I ask you to remember?"
    - The user references something that might be in their notes
    - You want to check for relevant context before answering a question
    Use a short, specific search query. If the user asks for everything,
    pass an empty query to list recent notes.`,
  inputSchema: z.object({
    query: z
      .string()
      .describe("Search keywords, or empty string for recent notes"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Filter by tags"),
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

    let results;
    if (input.query) {
      results = await noteStore.search(accountId, input.query, 10);
    } else {
      results = await noteStore.list(accountId, {
        tags: input.tags,
        limit: 10,
        orderBy: "updated_at",
      });
    }

    return {
      found: results.length,
      notes: results.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        capturedBy: n.capturedBy,
        createdAt: n.createdAt,
      })),
    };
  },
});
