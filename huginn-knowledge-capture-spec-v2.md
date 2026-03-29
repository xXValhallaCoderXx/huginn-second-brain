# Huginn — Knowledge Capture

### Feature Specification v2

**Version**: 2.0
**Date**: 2026-03-29
**Status**: Ready to build
**Depends on**: Phase 1 (accounts), Phase 2 (OM for source context), pgvector extension on Railway Postgres

---

## Overview

Knowledge Capture gives Huginn a persistent, graph-structured knowledge base owned by the user. The agent captures knowledge from conversations — both explicitly on command and proactively when it detects facts worth preserving — and organises it into a connected graph of notes with typed relationships.

This is not a note-taking feature. It is the system that turns Huginn into a second brain.

### What makes this different from a flat notes list

The agent **searches before saving**. Every capture attempt starts with a semantic search of existing notes. If related knowledge already exists, the agent updates the existing note and creates links rather than appending a duplicate. Over time, this produces a connected knowledge graph — not a flat log of facts — where notes reference each other, evolve through revisions, and can be visualised as a mind map.

### Core behaviours

1. **Explicit capture**: User says "remember that X" → agent saves a note, linking to related existing notes if any
2. **Proactive capture**: Agent detects a decision, fact, or reference worth saving → searches first, then creates or updates
3. **Search-before-save**: Every capture starts with a semantic similarity search against existing notes
4. **Update over duplicate**: If a semantically similar note exists, the agent enriches it rather than creating a new one
5. **Link related notes**: When notes share context, the agent creates typed relationships between them
6. **Recall on demand**: User asks "what do I know about X?" → semantic search returns relevant notes with their connections
7. **Dashboard management**: All notes visible, editable, deletable, and explorable as a graph on the web UI

---

## Data Model

### `notes` table (public schema)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID, PK | Note identifier |
| `account_id` | UUID, FK → accounts.id | Owner |
| `title` | TEXT, not null | Short title (agent-generated or user-provided) |
| `content` | TEXT, not null | The current note body |
| `tags` | TEXT[] | Array of lowercase tags for filtering |
| `source` | JSONB | Where this note originated (see below) |
| `captured_by` | TEXT, not null | `'user'` or `'agent'` |
| `revisions` | JSONB, default '[]' | History of previous content versions (see below) |
| `search_vector` | TSVECTOR | Full-text search index, auto-updated via trigger |
| `created_at` | TIMESTAMPTZ | When the note was first created |
| `updated_at` | TIMESTAMPTZ | When the note was last modified |

### `note_embeddings` table (public schema)

| Column | Type | Description |
|--------|------|-------------|
| `note_id` | UUID, PK, FK → notes.id ON DELETE CASCADE | 1:1 with notes |
| `embedding` | VECTOR(1536) | text-embedding-3-small output |
| `embedded_at` | TIMESTAMPTZ | When the embedding was last generated |

Separate table because embeddings are large and only needed for semantic search, not for every note query. The 1:1 relationship with CASCADE delete keeps them in sync.

### `note_links` table (public schema)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID, PK | Link identifier |
| `source_note_id` | UUID, FK → notes.id ON DELETE CASCADE | The note that references |
| `target_note_id` | UUID, FK → notes.id ON DELETE CASCADE | The note being referenced |
| `relationship` | TEXT, not null | One of: `related`, `extends`, `contradicts`, `supersedes` |
| `created_at` | TIMESTAMPTZ | When the link was created |

**Unique constraint** on `(source_note_id, target_note_id)` — no duplicate edges.

**Relationship types**:
- `related` — these notes share context or topic (e.g., two notes about the same project)
- `extends` — the source note builds on or adds detail to the target (e.g., a follow-up decision)
- `contradicts` — the source note conflicts with the target (e.g., updated information that hasn't been merged yet)
- `supersedes` — the source note replaces the target (the target is kept for history but the source is the current truth)

### Source field (JSONB)

```jsonc
{
  "channel": "telegram",
  "thread_id": "tg-928819460",
  "message_id": "msg_abc123",
  "captured_at": "2026-03-29T10:30:00Z"
}
```

### Revisions field (JSONB)

```jsonc
[
  {
    "content": "API rate limit is 100 req/min on the free tier.",
    "title": "API rate limit",
    "updated_at": "2026-03-29T10:30:00Z",
    "reason": "Initial capture from Telegram"
  },
  {
    "content": "API rate limit is 100 req/min on the free tier. Paid tier is 1000 req/min.",
    "title": "API rate limits by tier",
    "updated_at": "2026-04-05T14:20:00Z",
    "reason": "User mentioned paid tier upgrade"
  }
]
```

When the agent updates a note, the current title + content are pushed into revisions before the update is applied. This preserves the full evolution of every piece of knowledge.

### Drizzle schema

```typescript
import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './accounts';

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  source: jsonb('source').$type<NoteSource>(),
  capturedBy: text('captured_by').notNull().$type<'user' | 'agent'>(),
  revisions: jsonb('revisions').$type<NoteRevision[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountIdx: index('notes_account_id_idx').on(table.accountId),
  tagsIdx: index('notes_tags_idx').using('gin', table.tags),
}));

// The search_vector column and its trigger are created via raw SQL migration
// because Drizzle doesn't support generated tsvector columns natively.

export const noteEmbeddings = pgTable('note_embeddings', {
  noteId: uuid('note_id').primaryKey().references(() => notes.id, { onDelete: 'cascade' }),
  embedding: sql`vector(1536)`.notNull(),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteLinks = pgTable('note_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceNoteId: uuid('source_note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  targetNoteId: uuid('target_note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
  relationship: text('relationship').notNull().$type<NoteRelationship>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueLink: uniqueIndex('note_links_unique_idx').on(table.sourceNoteId, table.targetNoteId),
  sourceIdx: index('note_links_source_idx').on(table.sourceNoteId),
  targetIdx: index('note_links_target_idx').on(table.targetNoteId),
}));

// Types
interface NoteSource {
  channel: string;
  threadId: string;
  messageId?: string;
  capturedAt: string;
}

interface NoteRevision {
  title: string;
  content: string;
  updatedAt: string;
  reason: string;
}

type NoteRelationship = 'related' | 'extends' | 'contradicts' | 'supersedes';
```

### Migration: tsvector and trigger

```sql
-- Add tsvector column
ALTER TABLE notes ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

-- Index it
CREATE INDEX notes_search_idx ON notes USING GIN (search_vector);

-- Enable pgvector extension (if not already)
CREATE EXTENSION IF NOT EXISTS vector;
```

Title gets weight A (higher priority), content gets weight B. Searches that match the title rank higher than matches in content only.

---

## Search Architecture

Two search systems, each optimised for its use case.

### Full-text search (tsvector) — dashboard and quick lookups

Used for: the search bar on the web dashboard, the agent's `recall-notes` tool when the user asks "what do I know about X?"

Characteristics: instant (sub-millisecond), handles stemming and word forms, no external API call, good for queries where the user uses roughly the right words.

```typescript
async searchFullText(accountId: string, query: string, limit = 10): Promise<Note[]> {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .map(word => `${word}:*`)  // prefix matching
    .join(' & ');

  return db.execute(sql`
    SELECT *, ts_rank(search_vector, to_tsquery('english', ${tsQuery})) AS rank
    FROM notes
    WHERE account_id = ${accountId}
      AND search_vector @@ to_tsquery('english', ${tsQuery})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);
}
```

### Semantic search (pgvector) — agent search-before-save

Used for: the agent's search-before-save flow when deciding whether to create a new note or update an existing one.

Characteristics: catches conceptual similarity across different phrasings ("rate limit" vs "throttling"), requires one embedding API call per search (~200ms), returns a similarity score that the agent uses to decide create vs update vs link.

```typescript
async searchSemantic(
  accountId: string,
  text: string,
  limit = 5,
  minSimilarity = 0.7,
): Promise<(Note & { similarity: number })[]> {
  // Generate embedding for the query text
  const embedding = await this.embed(text);

  return db.execute(sql`
    SELECT n.*, 1 - (ne.embedding <=> ${embedding}::vector) AS similarity
    FROM notes n
    JOIN note_embeddings ne ON ne.note_id = n.id
    WHERE n.account_id = ${accountId}
      AND 1 - (ne.embedding <=> ${embedding}::vector) > ${minSimilarity}
    ORDER BY ne.embedding <=> ${embedding}::vector
    LIMIT ${limit}
  `);
}
```

### Embedding generation

```typescript
async embed(text: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}
```

The embedding is generated from `title + "\n" + content` concatenated. This gives the semantic search full context for matching.

### When each search is used

| Scenario | Search type | Why |
|----------|-------------|-----|
| Agent search-before-save | Semantic (pgvector) | Must catch conceptual similarity to avoid duplicates |
| Agent recall-notes tool | Semantic (pgvector) | User may use different words than the original note |
| Dashboard search bar | Full-text (tsvector) | Instant results as user types, no API latency |
| Dashboard tag filter | SQL WHERE on tags array | Exact match, no search needed |
| Dashboard "recent notes" | SQL ORDER BY updated_at | No search needed |

---

## NoteStore Interface

```typescript
export interface NoteStore {
  // ── CRUD ──
  create(accountId: string, input: CreateNoteInput): Promise<Note>;
  update(noteId: string, accountId: string, updates: UpdateNoteInput): Promise<Note>;
  delete(noteId: string, accountId: string): Promise<void>;
  get(noteId: string, accountId: string): Promise<Note | null>;

  // ── Search ──
  searchFullText(accountId: string, query: string, limit?: number): Promise<Note[]>;
  searchSemantic(accountId: string, text: string, limit?: number, minSimilarity?: number): Promise<ScoredNote[]>;
  list(accountId: string, options?: ListNotesOptions): Promise<Note[]>;
  tags(accountId: string): Promise<string[]>;

  // ── Links ──
  link(sourceNoteId: string, targetNoteId: string, relationship: NoteRelationship): Promise<NoteLink>;
  unlink(sourceNoteId: string, targetNoteId: string): Promise<void>;
  getLinks(noteId: string): Promise<NoteLink[]>;

  // ── Graph ──
  getGraph(accountId: string): Promise<KnowledgeGraph>;

  // ── Embeddings (internal) ──
  embed(text: string): Promise<number[]>;
  upsertEmbedding(noteId: string, content: string): Promise<void>;
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
  reason: string;  // required — explains what changed
}

interface ScoredNote extends Note {
  similarity: number;
}

interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  capturedBy: 'user' | 'agent';
  revisionCount: number;
  linkCount: number;
  updatedAt: string;
}

interface GraphEdge {
  source: string;  // note ID
  target: string;  // note ID
  relationship: NoteRelationship;
}
```

### Key implementation details

**create()** — After inserting the note, asynchronously generates and stores the embedding. The create call returns immediately; the embedding is upserted in the background. This keeps the conversation snappy.

**update()** — Before applying the update, pushes the current title + content into the revisions array. Then updates the note, and asynchronously regenerates the embedding.

**getGraph()** — Single query that returns all notes (as lightweight GraphNode objects without full content) and all links for an account. This is what the d3 visualisation calls. One API request, one render.

```typescript
async getGraph(accountId: string): Promise<KnowledgeGraph> {
  const [notesResult, linksResult] = await Promise.all([
    db.select({
      id: notes.id,
      title: notes.title,
      tags: notes.tags,
      capturedBy: notes.capturedBy,
      revisions: notes.revisions,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.accountId, accountId)),

    db.select()
    .from(noteLinks)
    .innerJoin(notes, eq(noteLinks.sourceNoteId, notes.id))
    .where(eq(notes.accountId, accountId)),
  ]);

  return {
    nodes: notesResult.map(n => ({
      id: n.id,
      title: n.title,
      tags: n.tags,
      capturedBy: n.capturedBy,
      revisionCount: (n.revisions as NoteRevision[]).length,
      linkCount: 0,  // computed client-side from edges
      updatedAt: n.updatedAt.toISOString(),
    })),
    edges: linksResult.map(l => ({
      source: l.note_links.sourceNoteId,
      target: l.note_links.targetNoteId,
      relationship: l.note_links.relationship,
    })),
  };
}
```

---

## Agent Tools

### `capture-knowledge` (replaces `save-note`)

This is the primary tool. It handles the full search-before-save flow.

```typescript
const captureKnowledgeTool = createTool({
  id: 'capture-knowledge',
  description: `Save or update knowledge in the user's knowledge base.

ALWAYS search before saving. Call recall-notes first to check if related
knowledge already exists. Then decide:

- If a very similar note exists (same topic, same facts): UPDATE it
  with the new information. Use this tool with existingNoteId set.
- If a partially related note exists (overlapping topic): CREATE a new
  note and specify relatedNoteIds to link them.
- If no related notes exist: CREATE a new note with no links.

Use this when:
- The user explicitly asks to remember, save, or note something
- You detect a decision, deadline, fact, reference, or contact in conversation
  that the user would want to recall later

Do NOT capture:
- Casual conversation or small talk
- Questions or speculation
- Things already in working memory (active tasks in progress)
- Emotional expressions

When updating an existing note, provide a reason describing what changed.`,
  inputSchema: z.object({
    title: z.string().describe('Short descriptive title'),
    content: z.string().describe('The knowledge to save'),
    tags: z.array(z.string()).describe('1-3 lowercase tags'),
    existingNoteId: z.string().optional().describe('If updating an existing note, its ID'),
    relatedNoteIds: z.array(z.string()).optional().describe('IDs of related notes to link to'),
    relationship: z.enum(['related', 'extends', 'contradicts', 'supersedes']).optional()
      .describe('Relationship type for links. Default: related'),
    reason: z.string().optional().describe('What changed (required when updating)'),
  }),
  execute: async ({ context, ...input }) => {
    const accountId = context.runtimeContext.get('account-id');
    const threadId = context.runtimeContext.get('thread-id');
    const channel = context.runtimeContext.get('channel');

    const source: NoteSource = {
      channel,
      threadId,
      capturedAt: new Date().toISOString(),
    };

    // Determine if user-initiated or proactive
    const capturedBy = context.runtimeContext.get('explicit-capture')
      ? 'user' : 'agent';

    let note: Note;
    let action: 'created' | 'updated';

    if (input.existingNoteId) {
      // UPDATE existing note
      note = await noteStore.update(input.existingNoteId, accountId, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        reason: input.reason || 'Updated with new information',
      });
      action = 'updated';
    } else {
      // CREATE new note
      note = await noteStore.create(accountId, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        source,
        capturedBy,
      });
      action = 'created';
    }

    // Create links to related notes
    const relationship = input.relationship || 'related';
    if (input.relatedNoteIds?.length) {
      for (const relatedId of input.relatedNoteIds) {
        await noteStore.link(note.id, relatedId, relationship);
      }
    }

    return {
      action,
      noteId: note.id,
      title: note.title,
      linksCreated: input.relatedNoteIds?.length || 0,
    };
  },
});
```

### `recall-notes`

Used both by the user ("what do I know about X?") and internally by the agent before capture.

```typescript
const recallNotesTool = createTool({
  id: 'recall-notes',
  description: `Search the user's knowledge base. Use this:
- When the user asks "what do I know about X?"
- When the user asks "what did I save about X?"
- BEFORE using capture-knowledge, to check for existing related notes
- When you want relevant context to improve your answer

Returns notes with similarity scores. For the search-before-save flow:
- similarity > 0.85 = very likely the same topic, UPDATE the existing note
- similarity 0.70-0.85 = related but distinct, CREATE new + LINK
- similarity < 0.70 = not related, CREATE new without links`,
  inputSchema: z.object({
    query: z.string().describe('What to search for'),
    limit: z.number().optional().describe('Max results, default 5'),
  }),
  execute: async ({ context, ...input }) => {
    const accountId = context.runtimeContext.get('account-id');

    const results = await noteStore.searchSemantic(
      accountId,
      input.query,
      input.limit || 5,
      0.5,  // low threshold — let the agent decide based on score
    );

    return {
      found: results.length,
      notes: results.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        similarity: Math.round(n.similarity * 100) / 100,
        capturedBy: n.capturedBy,
        updatedAt: n.updatedAt,
        revisionCount: (n.revisions as NoteRevision[]).length,
      })),
    };
  },
});
```

### `delete-note`

Unchanged from v1 spec. Simple wrapper for deletion with confirmation.

```typescript
const deleteNoteTool = createTool({
  id: 'delete-note',
  description: `Delete a note from the knowledge base. Always confirm
    the note title with the user before deleting. Associated links
    are automatically removed.`,
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

## Agent System Prompt Addition

Added to BASE_INSTRUCTIONS:

```markdown
## Knowledge Capture

You have a knowledge base — a graph of notes that you maintain for the user.
This is their second brain. Treat it with care.

### The search-before-save rule

NEVER create a note without searching first. Always call recall-notes before
capture-knowledge. This is the most important rule. Duplicates destroy the
knowledge graph.

Decision flow:
1. Detect knowledge worth saving (or receive explicit instruction)
2. Call recall-notes with a query describing the knowledge
3. Examine the results:
   - Similarity > 0.85: This note already exists. Call capture-knowledge
     with existingNoteId to UPDATE it. Merge new information into the
     existing content. Set a reason explaining what was added.
   - Similarity 0.70-0.85: Related but distinct. Call capture-knowledge
     to CREATE a new note, and include the related note IDs in
     relatedNoteIds to link them.
   - Similarity < 0.70 or no results: New knowledge. Call
     capture-knowledge to CREATE with no links.

### When to capture

**Explicit capture** (user says "remember", "save", "note"):
Always capture. This is a direct instruction. Set capturedBy to 'user'.

**Proactive capture** (you detect something worth saving):
Capture when you detect:
- Decisions ("we decided to go with Postgres")
- Deadlines ("the proposal is due Friday")
- Stated facts ("the API limit is 100/min")
- Names and contacts ("Sarah from the design team handles this")
- Technical references ("use pgvector 0.5+ for HNSW indexes")
- Project milestones ("Phase 2 shipped on March 20")

Do NOT capture:
- Questions or speculation ("I wonder if we should...")
- Emotional expressions ("I'm frustrated with this")
- Casual conversation or greetings
- Things you have already captured (this is what search-before-save prevents)

### Acknowledgment

When you capture or update, acknowledge briefly:
- Created: "Noted — saved [title] to your knowledge base."
- Updated: "Updated your note on [title] with the new information."
- Linked: "Saved [title] and linked it to [related title]."

One sentence. Do not interrupt the conversation flow.

### Guardrails

- Maximum 3 proactive captures per conversation
- Proactive captures should be 1-3 sentences, not paragraphs
- Always search before saving (this bears repeating)
- When in doubt about whether to create or update, lean toward update
- When in doubt about whether to capture at all, don't
```

---

## Web Dashboard

### Home page: Knowledge preview card

A compact card titled "Knowledge Base" in the right column of Home, below Recent Conversations. Shows:

- Total note count and total link count as subtle stats ("42 notes, 67 connections")
- The 3 most recently updated notes (title + first line + tags)
- A "View graph" link that navigates to the full knowledge view
- A "View all" link to the notes list in Settings

If no notes exist: "Your knowledge base is empty. Tell Huginn to remember something, or it will start capturing on its own."

### Settings: Knowledge section

A new section in the Settings sidebar, between Personality and Channels.

**Three sub-views**, toggled by pills at the top of the section:

#### List view (default)

Same as v1 spec: searchable, filterable list of all notes. Search uses tsvector for instant results. Each note card shows title, content preview, tags, source, capturedBy indicator, revision count badge, and linked note count.

Additions from v1:
- Revision count badge: "3 revisions" in small Mist text, clickable to expand revision history inline
- Linked notes: "2 linked notes" in small Mist text, clickable to show linked note titles with relationship type
- When editing a note inline, a "reason" field is required (same as personality editor)

#### Graph view

A `react-force-graph-2d` visualisation of the entire knowledge base.

**Node rendering**:
- Size encodes richness: base size + (revisionCount * 2) + (linkCount * 3)
- Colour encodes primary tag: each unique tag gets a consistent colour from the Huginn palette (Iris, Teal, Coral, Amber, etc.)
- User-saved notes have a solid fill; agent-captured notes have a subtle ring outline
- Label shows the note title, truncated to 30 characters
- Hover shows full title + tag list + "3 revisions, 5 links"

**Edge rendering**:
- `related`: solid line, Mist colour
- `extends`: solid line with arrow, Iris colour
- `contradicts`: dashed line, Ember colour
- `supersedes`: dotted line, Mist colour at 50% opacity

**Interactions**:
- Click a node: opens a detail panel on the right showing the full note with edit capability
- Click an edge: shows the relationship type and the two connected note titles
- Drag nodes: force-graph handles layout; user can reposition nodes
- Zoom and pan: standard force-graph controls
- Search: typing in the search bar highlights matching nodes and dims others

**Data source**: `GET /api/knowledge-graph` → calls `noteStore.getGraph(accountId)`

#### Timeline view (stretch goal — not in first build)

A chronological view showing when notes were created and updated, visualised as a vertical timeline. Useful for "what did I learn this week?" reviews.

---

## Obsidian Compatibility (Design For, Don't Build Yet)

The data model supports Obsidian export with no migration:

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: API rate limits by tier
tags:
  - technical
  - reference
captured_by: user
source_channel: telegram
created: 2026-03-29T10:30:00Z
updated: 2026-04-05T14:20:00Z
links:
  - target: "OpenRouter pricing"
    relationship: related
  - target: "Rate limit error handling"
    relationship: extends
---

API rate limit on the free tier is 100 req/min.
Paid tier is 1000 req/min. Upgraded on April 5.

## Revision history

- **2026-03-29**: Initial capture — "API rate limit is 100 req/min on the free tier."
- **2026-04-05**: Updated — "User mentioned paid tier upgrade"
```

Wikilinks between notes: `[[API rate limits by tier]]` can be generated by scanning content and titles for cross-references. Tags become `#technical #reference` in Obsidian format.

---

## Implementation Sequence

### Milestone 1: Data layer + search infrastructure (1 day)

- [ ] Add `notes`, `note_embeddings`, `note_links` tables to Drizzle schema
- [ ] Run migration including tsvector column, GIN index, and pgvector extension
- [ ] Implement NoteStore with all CRUD methods
- [ ] Implement `searchFullText()` using tsvector
- [ ] Implement `searchSemantic()` using pgvector + OpenRouter embeddings
- [ ] Implement `embed()` and `upsertEmbedding()` helper
- [ ] Implement `link()`, `unlink()`, `getLinks()`, `getGraph()`
- [ ] Implement revision tracking in `update()` (push current to revisions before applying)
- [ ] Tests: CRUD, full-text search, semantic search, linking, graph query

**Done when**: All NoteStore methods pass tests. Semantic search returns relevant results for paraphrased queries. Links create bidirectional graph edges. Graph query returns the complete node-edge structure for an account.

### Milestone 2: Agent tools + system prompt (half day)

- [ ] Register `capture-knowledge`, `recall-notes`, `delete-note` on the Huginn agent
- [ ] Wire runtimeContext to pass accountId, threadId, channel to tools
- [ ] Add Knowledge Capture section to BASE_INSTRUCTIONS
- [ ] Test explicit capture: "Remember that X" → recall → capture → note created
- [ ] Test search-before-save: create a note, then mention the same topic differently → agent updates instead of duplicating
- [ ] Test linking: create two related notes → agent links them
- [ ] Test recall: "What do I know about X?" → semantic search returns results
- [ ] Test cross-channel: save in Telegram, recall from Web Chat

**Done when**: Agent correctly searches before saving, updates existing notes when appropriate, creates links between related notes, and never creates obvious duplicates.

### Milestone 3: Proactive capture tuning (half day)

- [ ] Tune system prompt for proactive capture sensitivity
- [ ] Test: 10-message conversation with 2 clear facts → agent captures exactly those 2
- [ ] Test: agent does not capture casual conversation
- [ ] Test: agent acknowledges captures briefly without derailing conversation
- [ ] Test: agent respects 3-capture-per-conversation guardrail
- [ ] Test: proactive capture correctly searches before saving

**Done when**: Proactive capture feels natural — captures the right things, ignores noise, acknowledges without interrupting.

### Milestone 4: Dashboard — list view (1 day)

- [ ] Add Knowledge section to Settings sidebar
- [ ] Implement notes list with tsvector search bar
- [ ] Implement tag filtering (populated from user's actual tags)
- [ ] Implement capturedBy filter toggle
- [ ] Implement inline editing with reason field
- [ ] Implement revision history expansion
- [ ] Implement linked notes display
- [ ] Implement delete with inline confirmation
- [ ] Add Knowledge preview card to Home page
- [ ] Test end-to-end: capture via Telegram → view, edit, delete on dashboard

**Done when**: Full CRUD from the dashboard. Search returns instant results. Revision history is visible. Linked notes are displayed.

### Milestone 5: Dashboard — graph view (1 day)

- [ ] Install and configure `react-force-graph-2d`
- [ ] Implement graph view with node rendering (size, colour, labels)
- [ ] Implement edge rendering (style by relationship type)
- [ ] Implement node click → detail panel
- [ ] Implement search highlighting in graph
- [ ] Wire to `GET /api/knowledge-graph` endpoint
- [ ] Test with 20+ notes and 30+ links

**Done when**: The knowledge graph renders, nodes are interactive, edges show relationship types, and the visualisation updates when notes are added or linked.

### Total estimate: 4 days

---

## Acceptance Criteria

### Core capture
- [ ] User says "remember that X" → agent searches, then creates or updates note appropriately
- [ ] Agent proactively captures a decision mentioned in conversation, with brief acknowledgment
- [ ] Agent never creates a duplicate when a semantically similar note exists (similarity > 0.85)
- [ ] Agent creates links between related notes (similarity 0.70-0.85)
- [ ] Notes saved in Telegram are recallable from Web Chat (same account)

### Search
- [ ] Semantic search finds notes even when the query uses different words than the original
- [ ] Full-text search returns instant results on the dashboard
- [ ] "What do I know about X?" returns relevant notes ranked by similarity

### Graph
- [ ] Notes accumulate connections over time — after 2 weeks, the graph has meaningful structure
- [ ] Updating a note preserves revision history
- [ ] Deleting a note cascades to its links and embedding
- [ ] Graph view renders all notes and links for the account

### Dashboard
- [ ] All notes visible with search, tag filter, and capturedBy filter
- [ ] Notes editable inline with reason required
- [ ] Revision history viewable per note
- [ ] Linked notes visible per note
- [ ] Graph view renders with interactive nodes and edges

### Isolation
- [ ] No notes or links leak between accounts
- [ ] No embeddings accessible across accounts
