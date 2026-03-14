import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { storage } from "../storage.js";
import { personality } from "../../personality/load.js";
import { datetimeTool } from "../tools/datetime-tool.js";

const memory = new Memory({
  storage,
  options: {
    lastMessages: 20,
    observationalMemory: {
      model: "openrouter/google/gemini-2.5-flash",
    },
  },
});

export const huginnAgent = new Agent({
  id: "huginn",
  name: "Huginn",
  instructions: `${personality}

---

## Tools

You have access to the following tools:
- **get-current-datetime**: Returns the current date, time, day of week, and timezone. Use it when the user asks what time or date it is.`,
  model: "openrouter/anthropic/claude-sonnet-4.6",
  memory,
  tools: {
    "get-current-datetime": datetimeTool,
  },
});
