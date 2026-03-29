import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { NoteStore } from "@huginn/shared";

export const deleteNoteTool = createTool({
  id: "delete-note",
  description:
    `Delete a specific note by ID. Use when the user asks to forget or
    remove something they previously saved. Always confirm the note title
    with the user before deleting.`,
  inputSchema: z.object({
    noteId: z.string().describe("The note ID to delete"),
  }),
  execute: async (input, context) => {
    const accountId = context?.requestContext?.get("account-id") as
      | string
      | undefined;
    const noteStore = context?.requestContext?.get("note-store") as
      | NoteStore
      | undefined;

    if (!accountId || !noteStore) {
      return { deleted: false, error: "Notes are not configured for this account." };
    }

    await noteStore.delete(input.noteId, accountId);
    return { deleted: true };
  },
});
