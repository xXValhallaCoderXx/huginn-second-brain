import { PostgresStore } from "@mastra/pg";

export const storage = new PostgresStore({
    id: "huginn-storage",
    connectionString: process.env.DATABASE_URL!,
    schemaName: "mastra",
});
