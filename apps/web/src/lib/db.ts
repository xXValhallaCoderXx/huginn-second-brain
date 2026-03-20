import { createDb } from "@huginn/shared";

// Server-only database connection — used in server functions and API routes
export const db = createDb(process.env.APP_DATABASE_URL!);
