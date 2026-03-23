import "./env.js";

import { createDb, type Database } from "@huginn/shared";

// Server-only database connection — used in server functions and API routes
export const db: Database = createDb(process.env.DATABASE_URL!);
