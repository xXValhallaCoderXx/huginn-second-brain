import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });

import { PostgresStore } from "@mastra/pg";

export const storage = new PostgresStore({
    id: "huginn-storage",
    connectionString: process.env.APP_DATABASE_URL!,
    schemaName: "mastra",
});
