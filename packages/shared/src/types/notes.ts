import type { NoteSource } from "../schema/notes";

export type { NoteSource } from "../schema/notes";

export interface Note {
  id: string;
  accountId: string;
  title: string;
  content: string;
  tags: string[];
  source: NoteSource | null;
  capturedBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
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
}

export interface ListNotesOptions {
  tags?: string[];
  capturedBy?: "user" | "agent";
  limit?: number;
  offset?: number;
  orderBy?: "created_at" | "updated_at";
}

export interface NoteStore {
  create(accountId: string, note: CreateNoteInput): Promise<Note>;
  update(noteId: string, accountId: string, updates: UpdateNoteInput): Promise<Note | null>;
  delete(noteId: string, accountId: string): Promise<void>;
  get(noteId: string, accountId: string): Promise<Note | null>;
  search(accountId: string, query: string, limit?: number): Promise<Note[]>;
  list(accountId: string, options?: ListNotesOptions): Promise<Note[]>;
  tags(accountId: string): Promise<string[]>;
}
