import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";

export const mastra = new Mastra({
    storage: new LibSQLStore({
        id: "huginn-storage",
        url: process.env.MASTRA_DATABASE_URL ?? "file:./mastra.db",
    }),
});
