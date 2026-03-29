import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { NoteStore } from "@huginn/shared";

export const saveNoteTool = createTool({
  id: "save-note",
  description:
    `Save a piece of knowledge to the user's notes. Use this when:
    - The user explicitly asks you to remember, save, or note something
    - You detect an important fact, decision, deadline, or reference in conversation
      that the user would want to recall later
    Do NOT save:
    - Casual conversation or small talk
    - Things already in working memory (active tasks, current priorities)
    - Opinions or speculation (only save facts and decisions)
    Generate a short, descriptive title. Choose 1-3 tags from common categories
    (work, personal, technical, reference, decision, deadline, contact, idea).`,
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title for the note"),
    content: z.string().describe("The knowledge to save"),
    tags: z.array(z.string()).describe("1-3 lowercase tags"),
    isExplicit: z
      .boolean()
      .describe(
        "true if the user explicitly asked to save/remember this, false if you are proactively capturing",
      ),
  }),
  execute: async (input, context) => {
    const accountId = context?.requestContext?.get("account-id") as
      | string
      | undefined;
    const noteStore = context?.requestContext?.get("note-store") as
      | NoteStore
      | undefined;
    const threadId = context?.requestContext?.get("thread-id") as
      | string
      | undefined;
    const channel = context?.requestContext?.get("channel") as
      | string
      | undefined;

    if (!accountId || !noteStore) {
      return { saved: false, error: "Notes are not configured for this account." };
    }

    const note = await noteStore.create(accountId, {
      title: input.title,
      content: input.content,
      tags: input.tags,
      capturedBy: input.isExplicit ? "user" : "agent",
      source: threadId
        ? {
            channel: channel ?? "unknown",
            threadId,
            capturedAt: new Date().toISOString(),
          }
        : undefined,
    });

    return { saved: true, noteId: note.id, title: note.title };
  },
});
