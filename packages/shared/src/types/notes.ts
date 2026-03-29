import type { NoteSource, NoteRevision, NoteRelationship } from "../schema/notes";

export type { NoteSource } from "../schema/notes";
export type { NoteRevision, NoteRelationship } from "../schema/notes";

export interface Note {
  id: string;
  accountId: string;
  title: string;
  content: string;
  tags: string[];
  source: NoteSource | null;
  capturedBy: "user" | "agent";
  revisions: NoteRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteLink {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  relationship: NoteRelationship;
  createdAt: string;
}

export interface ScoredNote extends Note {
  similarity: number;
}

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  capturedBy: "user" | "agent";
  revisionCount: number;
  linkCount: number;
  updatedAt: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: NoteRelationship;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface KnowledgeStats {
  noteCount: number;
  linkCount: number;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  tags?: string[];
  source?: NoteSource;
  capturedBy: "user" | "agent";
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  tags?: string[];
  reason: string;
}

export interface ListNotesOptions {
  tags?: string[];
  capturedBy?: "user" | "agent";
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "updated_at";
}

export interface NoteStore {
  // CRUD
  create(accountId: string, note: CreateNoteInput): Promise<Note>;
  update(noteId: string, accountId: string, updates: UpdateNoteInput): Promise<Note | null>;
  delete(noteId: string, accountId: string): Promise<void>;
  get(noteId: string, accountId: string): Promise<Note | null>;

  // Search
  search(accountId: string, query: string, limit?: number): Promise<Note[]>;
  searchFullText(accountId: string, query: string, limit?: number): Promise<Note[]>;
  searchSemantic(accountId: string, text: string, limit?: number, minSimilarity?: number): Promise<ScoredNote[]>;
  list(accountId: string, options?: ListNotesOptions): Promise<Note[]>;
  listAll(): Promise<Note[]>;
  tags(accountId: string): Promise<string[]>;

  // Links
  link(sourceNoteId: string, targetNoteId: string, relationship: NoteRelationship): Promise<NoteLink>;
  unlink(sourceNoteId: string, targetNoteId: string): Promise<void>;
  getLinks(noteId: string): Promise<NoteLink[]>;

  // Graph
  getGraph(accountId: string): Promise<KnowledgeGraph>;
  getStats(accountId: string): Promise<KnowledgeStats>;

  // Embeddings (internal)
  embed(text: string): Promise<number[]>;
  upsertEmbedding(noteId: string, content: string): Promise<void>;
}
