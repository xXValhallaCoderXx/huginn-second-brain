import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { MastraServer } from "@mastra/hono";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import { RequestContext } from "@mastra/core/request-context";
import { createDb, createPersonalityStore } from "@huginn/shared";

import { mastra } from "./mastra/index.js";

const db = createDb(process.env.APP_DATABASE_URL!);
const personalityStore = createPersonalityStore(db);

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
const server = new MastraServer({ app, mastra });
await server.init();

// Custom /chat endpoint for M2 testing + future use
app.post("/chat", async (c) => {
    const body = await c.req.json<{
        accountId: string;
        threadId?: string;
        message: string;
    }>();

    if (!body.accountId || !body.message) {
        return c.json({ error: "accountId and message are required" }, 400);
    }

    const threadId = body.threadId ?? `test-${body.accountId}-${Date.now()}`;
    const agent = mastra.getAgent("huginn");

    const requestContext = new RequestContext();
    requestContext.set("account-id", body.accountId);
    requestContext.set("personality-store", personalityStore);

    const response = await agent.generate(body.message, {
        requestContext,
        memory: {
            resource: body.accountId,
            thread: threadId,
        },
    });

    return c.json({
        text: response.text,
        threadId,
    });
});

const port = Number(process.env.AGENT_PORT ?? 4111);
serve({ fetch: app.fetch, port }, () => {
    console.log(`Huginn agent service running on http://localhost:${port}`);
    console.log("Registered agents:", Object.keys(mastra.listAgents()));
});
