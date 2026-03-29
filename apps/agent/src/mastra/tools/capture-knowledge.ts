import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { NoteStore, NoteRelationship } from "@huginn/shared";

export const captureKnowledgeTool = createTool({
  id: "capture-knowledge",
  description: `Save or update knowledge in the user's knowledge base.

ALWAYS search before saving. Call recall-notes first to check if related
knowledge already exists. Then decide:

- If a note about the same category/topic exists: UPDATE it by setting
  existingNoteId. Merge the new info into the existing content and
  broaden the title if needed. DO NOT create a second note about the
  same category. Example: if "Favorite language is Rust" exists and the
  user mentions TypeScript, UPDATE the existing note — don't create
  "Programming Language Preference - TypeScript" separately.
- If no related notes exist: CREATE a new note.
- If a loosely related note exists (different topic/category): CREATE
  a new note and use relatedNoteIds to link them.

Use this when:
- The user explicitly asks to remember, save, or note something
- You detect a decision, deadline, fact, reference, or contact worth saving

Do NOT capture:
- Casual conversation, questions, speculation, or emotional expressions
- Things already captured (search-before-save prevents duplicates)`,
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title"),
    content: z.string().describe("The knowledge to save"),
    tags: z.array(z.string()).describe("1-3 lowercase tags"),
    isExplicit: z
      .boolean()
      .describe(
        "true if the user explicitly asked to save/remember this, false if proactive capture",
      ),
    existingNoteId: z
      .string()
      .optional()
      .describe("If updating an existing note, its ID"),
    relatedNoteIds: z
      .array(z.string())
      .optional()
      .describe("IDs of related notes to link to"),
    relationship: z
      .enum(["related", "extends", "contradicts", "supersedes"])
      .optional()
      .describe("Relationship type for links. Default: related"),
    reason: z
      .string()
      .optional()
      .describe("What changed (required when updating an existing note)"),
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
      return { action: "error", error: "Notes are not configured for this account." };
    }

    const capturedBy = input.isExplicit ? "user" : "agent";
    const relationship: NoteRelationship = input.relationship ?? "related";
    let noteId: string;
    let title: string;
    let action: "created" | "updated";

    if (input.existingNoteId) {
      // UPDATE existing note
      const updated = await noteStore.update(input.existingNoteId, accountId, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        reason: input.reason ?? "Updated with new information",
      });
      if (!updated) {
        return { action: "error", error: "Note not found or not owned by this account." };
      }
      noteId = updated.id;
      title = updated.title;
      action = "updated";
    } else {
      // CREATE new note
      const created = await noteStore.create(accountId, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        capturedBy,
        source: threadId
          ? {
              channel: channel ?? "unknown",
              threadId,
              capturedAt: new Date().toISOString(),
            }
          : undefined,
      });
      noteId = created.id;
      title = created.title;
      action = "created";
    }

    // Create links to related notes
    let linksCreated = 0;
    if (input.relatedNoteIds?.length) {
      for (const relatedId of input.relatedNoteIds) {
        try {
          await noteStore.link(noteId, relatedId, relationship);
          linksCreated++;
        } catch (err) {
          console.error(`[capture-knowledge] Failed to link ${noteId} → ${relatedId}:`, err);
        }
      }
    }

    return { action, noteId, title, linksCreated };
  },
});
