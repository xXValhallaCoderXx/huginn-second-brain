/**
 * One-time script to backfill embeddings for all existing notes.
 *
 * Usage:
 *   cd apps/agent
 *   npx tsx src/scripts/backfill-embeddings.ts
 *
 * Requires DATABASE_URL and OPENROUTER_API_KEY in .env (monorepo root).
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { createDb, createNoteStore } from "@huginn/shared";

const BATCH_DELAY_MS = 200; // Rate-limit delay between notes

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const store = createNoteStore(db);

  // List all notes across all accounts (empty string accountId won't match,
  // so we query the db directly for all note IDs)
  const allNotes = await store.listAll();
  console.log(`Found ${allNotes.length} notes to embed.`);

  let success = 0;
  let failed = 0;

  for (const note of allNotes) {
    try {
      await store.upsertEmbedding(note.id, `${note.title}\n${note.content}`);
      success++;
      console.log(`  [${success + failed}/${allNotes.length}] ✓ ${note.title}`);
    } catch (err) {
      failed++;
      console.error(`  [${success + failed}/${allNotes.length}] ✗ ${note.title}:`, err);
    }

    // Rate limit
    if (success + failed < allNotes.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\nDone. ${success} embedded, ${failed} failed out of ${allNotes.length} total.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
