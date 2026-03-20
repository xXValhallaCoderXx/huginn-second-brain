import { Mastra } from "@mastra/core";
import { huginnAgent } from "./agents/huginn.js";
import { storage } from "./storage.js";

export const mastra = new Mastra({
    agents: { huginn: huginnAgent },
    storage,
});
