-- Knowledge Capture v2: tsvector full-text search + pgvector extension
-- Run AFTER `pnpm db:push` to add the generated tsvector column.
-- Drizzle doesn't support GENERATED ALWAYS AS columns natively.

-- Enable pgvector extension (required for note_embeddings.embedding column)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add generated tsvector column for full-text search
-- Title gets weight A (higher ranking), content gets weight B
ALTER TABLE notes ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS notes_search_idx ON notes USING GIN (search_vector);
