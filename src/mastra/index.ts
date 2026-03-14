import { Mastra } from "@mastra/core";
import { huginnAgent } from "./agents/huginn";

export const mastra = new Mastra({
  agents: { huginnAgent },
});
