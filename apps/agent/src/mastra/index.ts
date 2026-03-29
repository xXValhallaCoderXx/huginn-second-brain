import { Mastra } from "@mastra/core";
import { Observability, DefaultExporter } from "@mastra/observability";
import { huginnAgent } from "./agents/huginn.js";
import { storage } from "./storage.js";
import { getCalendarTool } from "./tools/get-calendar.js";
import { captureKnowledgeTool } from "./tools/capture-knowledge.js";
import { recallNotesTool } from "./tools/recall-notes.js";
import { deleteNoteTool } from "./tools/delete-note.js";
import { dailyBriefingWorkflow } from "../workflows/daily-briefing.js";

export const mastra = new Mastra({
    agents: { huginn: huginnAgent },
    tools: {
        "get-calendar": getCalendarTool,
        "capture-knowledge": captureKnowledgeTool,
        "recall-notes": recallNotesTool,
        "delete-note": deleteNoteTool,
    },
    workflows: { "daily-briefing": dailyBriefingWorkflow },
    storage,
    observability: new Observability({
        configs: {
            default: {
                serviceName: "huginn",
                exporters: [new DefaultExporter()],
            },
        },
    }),
});
