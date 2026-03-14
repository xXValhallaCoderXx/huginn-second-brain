import { LibSQLStore } from "@mastra/libsql";

export const storage = new LibSQLStore({
  id: "huginn-storage",
  url: process.env.LIBSQL_URL || "file:./mastra.db",
});
