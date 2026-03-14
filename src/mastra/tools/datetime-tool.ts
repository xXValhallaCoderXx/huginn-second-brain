import { createTool } from "@mastra/core/tools";

export const datetimeTool = createTool({
  id: "get-current-datetime",
  description:
    "Get the current date, time, day of week, and timezone. Use this when the user asks about the current date or time.",
  execute: async () => {
    const now = new Date();
    return {
      date: now.toISOString().split("T")[0],
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }),
      dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long" }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});
