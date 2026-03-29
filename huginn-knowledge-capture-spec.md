# Huginn — Knowledge Capture

### Feature Specification

**Version**: 1.0
**Date**: 2026-03-29
**Status**: Ready to build
**Depends on**: Phase 1 (accounts), Phase 2 (OM for source context)

---

## Overview

Knowledge Capture gives Huginn a persistent, user-owned notes layer. The user can explicitly tell Huginn to remember things, and Huginn can proactively capture knowledge from conversations when it detects something worth preserving. Notes are structured, tagged, traceable to their source conversation, and visible on the web dashboard.

This is the feature that turns Huginn from "an AI that remembers conversations" into "an AI that builds a knowledge base for you."

### What this is

A notes system where:

- The user says "remember that the API rate limit is 100 req/min" and Huginn stores it reliably
- Huginn proactively captures important facts, decisions, and references during conversation
- The user can ask "what do I know about rate limits?" and Huginn retrieves matching notes
- All notes are visible, editable, and deletable on the web dashboard
- Notes are structured with tags, source tracking, and timestamps

### What this is not

- Not a replacement for OM (which captures conversation patterns, not discrete facts)
- Not a replacement for working memory (which is a scratchpad for active context)
- Not a document management system (no file uploads, no folders)
- Not a vector search system yet (keyword matching for now; semantic search comes in Phase 7)

### Where it lives in the architecture

Notes are **app-owned data** in the `public` schema, alongside accounts, channel_links, and personality_files. They are not Mastra-managed. The agent interacts with notes through Mastra tools that call into a `NoteStore` interface — the same pattern as PersonalityStore.

```
App Layer (public schema)          Agent Layer (mastra schema)
─────────────────────────          ─────────────────────────
accounts                           mastra_threads
channel_links                      mastra_messages
personality_files                  mastra_workflow_snapshot
notes  ← NEW                      (working memory, OM)
```

The bridge remains `accounts.id` = Mastra's `resourceId`. Tools call NoteStore with the accountId from runtimeContext.

---

## Data Model

### `notes` table (public schema)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID, PK | Note identifier |
| `account_id` | UUID, FK → accounts.id | Owner |
| `title` | TEXT, not null | Short title (agent-generated or user-provided) |
| `content` | TEXT, not null | The note body |
| `tags` | TEXT[] | Array of lowercase tags for filtering |
| `source` | JSONB | Where this note came from (see below) |
| `captured_by` | TEXT, not null | `'user'` (explicit command) or `'agent'` (proactive capture) |
| `created_at` | TIMESTAMPTZ | When the note was created |
| `updated_at` | TIMESTAMPTZ | When the note was last modified |

### Source field (JSONB)

```jsonc
{
  "channel": "telegram",         // which channel the conversation happened on
  "thread_id": "tg-928819460",   // Mastra thread ID
  "message_id": "msg_abc123",    // optional, the specific message that triggered capture
  "captured_at": "2026-03-29T10:30:00Z"
}
```

This gives every note a traceable origin. When displayed on the dashboard, the source resolves to something like "Captured from Telegram conversation, March 29." When semantic search arrives in Phase 7, the source field enables "show me notes from last week's Telegram conversations."

### Drizzle schema

```typescript
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { accounts } from './accounts';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').array().notNull().default([]),
  source: jsonb('source').$type<NoteSource>(),
  capturedBy: text('captured_by').notNull().$type<'user' | 'agent'>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

interface NoteSource {
  channel: string;
  threadId: string;
  messageId?: string;
  capturedAt: string;
}
```

---

## NoteStore Interface

Follows the same pattern as PersonalityStore — a stable interface that the agent tools and dashboard both call through.

```typescript
export interface NoteStore {
  /** Create a new note */
  create(accountId: string, note: CreateNoteInput): Promise<Note>;

  /** Update an existing note */
  update(noteId: string, accountId: string, updates: UpdateNoteInput): Promise<Note>;

  /** Delete a note */
  delete(noteId: string, accountId: string): Promise<void>;

  /** Get a single note by ID */
  get(noteId: string, accountId: string): Promise<Note | null>;

  /** Search notes by keyword (searches title and content) */
  search(accountId: string, query: string, limit?: number): Promise<Note[]>;

  /** List notes, optionally filtered by tags */
  list(accountId: string, options?: ListNotesOptions): Promise<Note[]>;

  /** Get all unique tags for an account */
  tags(accountId: string): Promise<string[]>;
}

interface CreateNoteInput {
  title: string;
  content: string;
  tags?: string[];
  source?: NoteSource;
  capturedBy: 'user' | 'agent';
}

interface UpdateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
}

interface ListNotesOptions {
  tags?: string[];
  capturedBy?: 'user' | 'agent';
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at';
}
```

### Search implementation (Phase 1: keyword)

For the initial implementation, `search()` uses PostgreSQL's `ILIKE` on title and content with `ts_vector` full-text search as an upgrade path. This is sufficient for hundreds of notes. When Phase 7 arrives with pgvector, the search method gains a semantic mode without changing the interface.

```typescript
// Initial implementation — simple but effective
async search(accountId: string, query: string, limit = 10): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.accountId, accountId),
        or(
          ilike(notes.title, `%${query}%`),
          ilike(notes.content, `%${query}%`),
        ),
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(limit);
}
```

---

## Agent Tools

Two Mastra tools registered on the Huginn agent. Both receive accountId from runtimeContext.

### `save-note`

Called when the user explicitly asks to remember something, or when the agent proactively captures knowledge.

```typescript
const saveNoteTool = createTool({
  id: 'save-note',
  description: `Save a piece of knowledge to the user's notes. Use this when:
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
    title: z.string().describe('Short descriptive title for the note'),
    content: z.string().describe('The knowledge to save'),
    tags: z.array(z.string()).describe('1-3 lowercase tags'),
  }),
  execute: async ({ context, ...input }) => {
    const accountId = context.runtimeContext.get('account-id');
    const threadId = context.runtimeContext.get('thread-id');
    const channel = context.runtimeContext.get('channel');

    const note = await noteStore.create(accountId, {
      title: input.title,
      content: input.content,
      tags: input.tags,
      capturedBy: /* determine from context — see proactive capture section */,
      source: {
        channel,
        threadId,
        capturedAt: new Date().toISOString(),
      },
    });

    return { saved: true, noteId: note.id, title: note.title };
  },
});
```

### `recall-notes`

Called when the user asks about something they saved, or when the agent wants to check for relevant prior knowledge.

```typescript
const recallNotesTool = createTool({
  id: 'recall-notes',
  description: `Search the user's saved notes. Use this when:
    - The user asks "what do I know about X?"
    - The user asks "what did I ask you to remember?"
    - The user references something that might be in their notes
    - You want to check for relevant context before answering a question
    Use a short, specific search query. If the user asks for everything,
    pass an empty query to list recent notes.`,
  inputSchema: z.object({
    query: z.string().describe('Search keywords, or empty for recent notes'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
  }),
  execute: async ({ context, ...input }) => {
    const accountId = context.runtimeContext.get('account-id');

    let results;
    if (input.query) {
      results = await noteStore.search(accountId, input.query, 10);
    } else {
      results = await noteStore.list(accountId, {
        tags: input.tags,
        limit: 10,
        orderBy: 'updated_at',
      });
    }

    return {
      found: results.length,
      notes: results.map(n => ({
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
```

### `delete-note`

A third tool for removing notes from conversation. Simple wrapper.

```typescript
const deleteNoteTool = createTool({
  id: 'delete-note',
  description: `Delete a specific note by ID. Use when the user asks to
    forget or remove something they previously saved. Always confirm
    the note title with the user before deleting.`,
  inputSchema: z.object({
    noteId: z.string().describe('The note ID to delete'),
  }),
  execute: async ({ context, ...input }) => {
    const accountId = context.runtimeContext.get('account-id');
    await noteStore.delete(input.noteId, accountId);
    return { deleted: true };
  },
});
```

---

## Proactive Capture

This is the hardest design problem. The agent needs to distinguish between "this is worth saving" and "this is just conversation." Getting this wrong in either direction is bad: too aggressive and the notes fill with noise, too conservative and the user doesn't trust the proactive feature.

### How it works

The save-note tool description includes guidance for when to proactively save. But the real control comes from the system prompt (BASE_INSTRUCTIONS). A section is added:

```markdown
## Knowledge Capture

You have the ability to save notes on behalf of the user. There are two modes:

**Explicit capture**: When the user says "remember this," "save this," "note that,"
or any variation, always use the save-note tool. This is a direct instruction.
Set capturedBy to 'user'.

**Proactive capture**: When you detect information in conversation that the user
would likely want to recall later, save it without being asked. Set capturedBy
to 'agent'. Proactively capture:
- Decisions ("we decided to go with Postgres")
- Deadlines ("the proposal is due Friday")
- Facts the user states with confidence ("the API limit is 100/min")
- Names and contacts ("Sarah from the design team")
- Technical references ("use pgvector 0.5+ for HNSW indexes")
- Project milestones ("Phase 2 shipped on March 20")

Do NOT proactively capture:
- Questions or speculation ("I wonder if we should...")
- Emotional expressions ("I'm frustrated with this")
- Casual conversation ("how's the weather")
- Things you've already captured (check with recall-notes if unsure)

When you proactively capture, briefly acknowledge it: "I've saved a note about
[title]." Keep the acknowledgment to one short sentence — don't interrupt the
conversation flow.
```

### The capturedBy distinction matters

Notes marked `agent` can be surfaced differently on the dashboard — a subtle badge or indicator showing "Huginn captured this" vs "You saved this." This builds trust: the user can audit what the agent decided was worth saving and delete anything it got wrong. Over time, this feedback loop (agent captures, user reviews) teaches the user to trust (or correct) the proactive capture.

### Guardrails

- The agent should not save more than 3 proactive notes per conversation. If it's capturing more, it's being too aggressive.
- Proactive captures should be brief — the content field for agent-captured notes should be 1-3 sentences, not paragraphs.
- The agent should use recall-notes before saving to avoid duplicates.

---

## Web Dashboard: Notes View

### Where it lives

Notes gets its own section on the Home page (right column, below Recent Conversations) and is also accessible as a section within Settings for full management.

### Home page: Notes preview

A compact card titled "Saved Knowledge" showing the 5 most recent notes. Each note displays:

- Title (Frost, 14px semibold)
- First line of content, truncated (Mist, 13px)
- Tags as small pills (Iris at 10% opacity background, Iris text, 11px)
- A subtle icon indicating source: user-saved (bookmark icon) or agent-captured (sparkle icon)
- Relative timestamp

A "View all" link at the bottom navigates to the full notes view in Settings.

If no notes exist yet, the section displays: "No saved knowledge yet. Tell Huginn to remember something, or it will start capturing on its own." One line, one concept.

### Settings: Full notes management

A dedicated section within Settings (added to the sidebar navigation between Personality and Channels). Contains:

**Search and filter bar**: A text input for keyword search, plus a row of tag pills for filtering. Tags are dynamically populated from the user's existing notes. "All" is the default filter. A toggle for "Captured by: All / Me / Huginn" lets the user filter by source.

**Notes list**: Each note is a card containing:

- Title (editable inline — click to edit, press Enter to save)
- Content (editable inline — same pattern)
- Tags (shown as pills, with an "add tag" action)
- Source line: "Saved from Telegram, March 29" or "Captured by Huginn from Web Chat, March 28"
- Captured-by indicator: bookmark icon for user, sparkle icon for agent
- Timestamp
- Delete button (destructive style, inline confirmation)

**Sort options**: By date (newest first, default), or by tag group.

**Bulk actions**: Not in the first version. Keep it simple. One note at a time.

---

## Obsidian Compatibility (Design For, Don't Build Yet)

The data model is designed so that Obsidian-compatible export is a straightforward addition later. Here's what that looks like when the time comes:

Each note maps to a markdown file:

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: API rate limit on free tier
tags:
  - technical
  - reference
captured_by: user
source_channel: telegram
created: 2026-03-29T10:30:00Z
updated: 2026-03-29T10:30:00Z
---

The API rate limit on the free tier is 100 requests per minute.
Upgrade to the paid tier for 1000 req/min.
```

Tags map to Obsidian tags. The title becomes the filename. Wikilinks between notes can be generated by scanning content for references to other note titles. The export is a folder of `.md` files that drops into an Obsidian vault.

This is not built now. But because the data model has title, content, tags, and metadata as separate fields (not a single markdown blob), the export is a simple serialisation step whenever it's needed.

---

## Phase 7 Upgrade Path: Semantic Search

When pgvector arrives in Phase 7, the NoteStore.search() method gains a semantic mode:

1. On `create()` and `update()`, the note content is embedded (via OpenAI embeddings or a local model) and stored in a `note_embeddings` table
2. `search()` accepts a flag: `{ semantic: true }`
3. Semantic search embeds the query, runs a cosine similarity search against note embeddings, and returns ranked results
4. The interface does not change — `search()` still returns `Note[]`

This means "what did I save about that thing from last week" works even when the user doesn't remember the exact keywords. The keyword search remains as a fallback and for exact-match queries.

---

## Implementation Sequence

### Milestone 1: Data layer (half day)

- [ ] Add `notes` table to Drizzle schema
- [ ] Run migration
- [ ] Implement `NoteStore` with Drizzle (create, update, delete, get, search, list, tags)
- [ ] Basic tests for CRUD and search

**Done when**: NoteStore functions pass tests against the database.

### Milestone 2: Agent tools (half day)

- [ ] Register `save-note`, `recall-notes`, and `delete-note` tools on the Huginn agent
- [ ] Wire runtimeContext to pass accountId, threadId, and channel to tools
- [ ] Add Knowledge Capture section to BASE_INSTRUCTIONS
- [ ] Test explicit capture: "Remember that X" → note created
- [ ] Test recall: "What do I know about X?" → notes returned
- [ ] Test delete: "Forget the note about X" → note deleted

**Done when**: All three tools work end-to-end in a Telegram conversation. A note saved in Telegram is recallable from Web Chat (same account, same NoteStore).

### Milestone 3: Proactive capture (half day)

- [ ] Tune the system prompt for proactive capture
- [ ] Test with real conversation: agent captures a fact without being asked
- [ ] Verify capturedBy is set correctly ('user' vs 'agent')
- [ ] Verify acknowledgment is brief and non-intrusive
- [ ] Test guardrails: agent does not over-capture

**Done when**: In a 10-message conversation containing 2 clear facts and 8 messages of discussion, the agent captures the 2 facts and ignores the rest.

### Milestone 4: Dashboard (1 day)

- [ ] Add notes preview card to Home page
- [ ] Add Notes section to Settings with full CRUD
- [ ] Implement search and tag filtering
- [ ] Implement captured-by filter
- [ ] Implement inline editing for title and content
- [ ] Add delete with inline confirmation
- [ ] Test end-to-end: save via Telegram, view and edit on dashboard

**Done when**: A note captured by the agent in Telegram is visible, editable, and deletable on the web dashboard.

### Total estimate: 2-3 days

---

## Acceptance Criteria

- User says "remember that X" → note is created with title, content, and tags
- User says "what do I know about X?" → relevant notes are returned
- Agent proactively captures a decision mentioned in conversation, with acknowledgment
- Notes saved in Telegram are visible on the web dashboard
- Notes saved in Web Chat are recallable from Telegram (same account)
- Dashboard shows all notes with search, tag filter, and source
- User can edit title, content, and tags from the dashboard
- User can delete notes from the dashboard
- Agent-captured notes are visually distinguishable from user-saved notes
- No notes leak between accounts
