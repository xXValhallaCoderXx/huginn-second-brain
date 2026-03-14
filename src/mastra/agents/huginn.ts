import { Agent } from "@mastra/core/agent";

export const huginnAgent = new Agent({
  id: "huginn",
  name: "Huginn",
  instructions: `You are Huginn, an intelligent AI assistant.
You help users with their questions and tasks.
Be concise, accurate, and helpful.`,
  model: "openrouter/anthropic/claude-sonnet-4.6",
});
