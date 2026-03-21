import { Agent } from "@mastra/core/agent";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { Memory } from "@mastra/memory";
import { PgVector } from "@mastra/pg";
import type { PersonalityStore } from "@huginn/shared";
import {
    BASE_INSTRUCTIONS,
    buildInstructions,
    WORKING_MEMORY_TEMPLATE,
} from "../../identity/instructions.js";
import { storage } from "../storage.js";

const vector = new PgVector({
    id: "huginn-vector",
    connectionString: process.env.APP_DATABASE_URL!,
});

const embedder = new ModelRouterEmbeddingModel({
    providerId: "openrouter",
    modelId: "openai/text-embedding-3-small",
});

export type HuginnContext = {
    "account-id": string;
    "personality-store": PersonalityStore;
};

export const huginnAgent = new Agent({
    id: "huginn",
    name: "Huginn",
    model: "openrouter/anthropic/claude-sonnet-4",

    instructions: async ({ requestContext }) => {
        const accountId = requestContext?.get("account-id") as string;
        const store = requestContext?.get(
            "personality-store",
        ) as PersonalityStore | undefined;
        if (!accountId || !store) return BASE_INSTRUCTIONS;
        return buildInstructions(accountId, store);
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
