import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import type { PersonalityStore } from "@huginn/shared";
import {
    buildInstructions,
    WORKING_MEMORY_TEMPLATE,
} from "../../identity/instructions.js";

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
        ) as PersonalityStore;
        return buildInstructions(accountId, store);
    },

    memory: new Memory({
        options: {
            lastMessages: 15,
            workingMemory: {
                enabled: true,
                scope: "resource",
                template: WORKING_MEMORY_TEMPLATE,
            },
        },
    }),
});
