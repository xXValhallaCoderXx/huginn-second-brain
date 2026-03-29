import { Agent } from "@mastra/core/agent";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { Memory } from "@mastra/memory";
import { PgVector } from "@mastra/pg";
import type { PersonalityStore, CalendarService, NoteStore } from "@huginn/shared";
import {
    BASE_INSTRUCTIONS,
    buildInstructions,
    WORKING_MEMORY_TEMPLATE,
} from "../../identity/instructions.js";
import { storage } from "../storage.js";
import { getCalendarTool } from "../tools/get-calendar.js";
import { captureKnowledgeTool } from "../tools/capture-knowledge.js";
import { recallNotesTool } from "../tools/recall-notes.js";
import { deleteNoteTool } from "../tools/delete-note.js";

const vector = new PgVector({
    id: "huginn-vector",
    connectionString: process.env.DATABASE_URL!,
});

const embedder = new ModelRouterEmbeddingModel({
    providerId: "openrouter",
    modelId: "openai/text-embedding-3-small",
});

export type HuginnContext = {
    "account-id": string;
    "personality-store": PersonalityStore;
    "calendar-service"?: CalendarService;
    "note-store"?: NoteStore;
    "thread-id"?: string;
    "channel"?: string;
};

export const huginnAgent = new Agent({
    id: "huginn",
    name: "Huginn",
    model: "openrouter/anthropic/claude-sonnet-4",
    tools: {
        "get-calendar": getCalendarTool,
        "capture-knowledge": captureKnowledgeTool,
        "recall-notes": recallNotesTool,
        "delete-note": deleteNoteTool,
    },

    instructions: async ({ requestContext }) => {
        const accountId = requestContext?.get("account-id") as string;
        const store = requestContext?.get(
            "personality-store",
        ) as PersonalityStore | undefined;
        if (!accountId || !store) return BASE_INSTRUCTIONS;
        const calendarService = requestContext?.get(
            "calendar-service",
        ) as CalendarService | undefined;
        return buildInstructions(accountId, store, calendarService);
    },

    memory: new Memory({
        storage,
        vector,
        embedder,
        options: {
            lastMessages: 15,
            semanticRecall: {
                topK: 3,
                messageRange: 2,
                scope: "resource",
            },
            workingMemory: {
                enabled: true,
                scope: "resource",
                template: WORKING_MEMORY_TEMPLATE,
            },
            observationalMemory: {
                model: "openrouter/google/gemini-2.5-flash",
                scope: "thread",
                observation: {
                    messageTokens: 30_000,
                    previousObserverTokens: 2_000,
                },
                reflection: {
                    observationTokens: 40_000,
                },
            },
        },
    }),
});
