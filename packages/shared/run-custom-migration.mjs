// Run custom SQL migrations that Drizzle can't manage (e.g. GENERATED columns).
// Usage: pnpm db:migrate-custom (from packages/shared or monorepo root)
import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import pg from "pg";

const rootEnv = resolve(import.meta.dirname, "../../.env");
config({ path: rootEnv });

const sqlFile = resolve(import.meta.dirname, "migrations/add-search-vector.sql");
const sql = readFileSync(sqlFile, "utf-8");

const client = new pg.Client(process.env.DATABASE_URL);

async function main() {
  await client.connect();
  console.log("Running custom migration:", sqlFile);
  await client.query(sql);
  console.log("Done.");
  await client.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
