import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(import.meta.dirname, "../../../../.env"), quiet: true });

import { createDb, type Database } from "@huginn/shared";

// Server-only database connection — used in server functions and API routes
export const db: Database = createDb(process.env.DATABASE_URL!);
