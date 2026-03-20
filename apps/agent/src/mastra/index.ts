import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { huginnAgent } from "./agents/huginn.js";

export const mastra = new Mastra({
    agents: { huginn: huginnAgent },
    storage: new LibSQLStore({
        id: "huginn-storage",
        url: process.env.MASTRA_DATABASE_URL ?? "file:./mastra.db",
    }),
});
