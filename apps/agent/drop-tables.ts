import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname, "../../.env") });

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  await db.execute(sql`
    DROP TABLE IF EXISTS memory_messages CASCADE;
    DROP TABLE IF EXISTS note_links CASCADE;
    DROP TABLE IF EXISTS note_embeddings CASCADE;
    DROP TABLE IF EXISTS notes CASCADE;
  `);
  console.log("Tables dropped");
}

main().catch((e) => { console.error(e); process.exit(1); });
