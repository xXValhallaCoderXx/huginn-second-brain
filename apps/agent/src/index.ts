import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { MastraServer } from "@mastra/hono";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import { RequestContext } from "@mastra/core/request-context";
import { createDb, createPersonalityStore, createAccountService } from "@huginn/shared";

import { mastra } from "./mastra/index.js";
import { createBot, getBotUsername } from "./telegram/bot.js";
import { registerHandlers } from "./telegram/handlers.js";

const db = createDb(process.env.APP_DATABASE_URL!);
const personalityStore = createPersonalityStore(db);

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

// Allow web app (port 3000) to call agent APIs
app.use("/chat/*", cors({ origin: "*" }));
app.use("/chat", cors({ origin: "*" }));
app.use("/telegram/*", cors({ origin: "*" }));

const server = new MastraServer({ app, mastra });
await server.init();

// Non-streaming /chat endpoint (M2 tests + simple use)
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

// Streaming /chat/stream endpoint — returns SSE
app.post("/chat/stream", async (c) => {
    const body = await c.req.json<{
        accountId: string;
        threadId?: string;
        message: string;
    }>();

    if (!body.accountId || !body.message) {
        return c.json({ error: "accountId and message are required" }, 400);
    }

    const threadId = body.threadId ?? `chat-${body.accountId}-${Date.now()}`;
    const agent = mastra.getAgent("huginn");

    const requestContext = new RequestContext();
    requestContext.set("account-id", body.accountId);
    requestContext.set("personality-store", personalityStore);

    const output = await agent.stream(body.message, {
        requestContext,
        memory: {
            resource: body.accountId,
            thread: threadId,
        },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            // Send threadId so the client can continue the conversation
            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "start", threadId })}\n\n`),
            );

            for await (const text of output.textStream) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`),
                );
            }

            controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
            );
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
});

// --- Telegram bot info endpoint ---
app.get("/telegram/info", (c) => {
    const username = getBotUsername();
    if (!username) {
        return c.json({ error: "Telegram bot not configured" }, 404);
    }
    return c.json({ username });
});

const port = Number(process.env.AGENT_PORT ?? 4111);
serve({ fetch: app.fetch, port }, () => {
    console.log(`Huginn agent service running on http://localhost:${port}`);
    console.log("Registered agents:", Object.keys(mastra.listAgents()));
});

// --- Telegram bot (long polling) ---
const bot = await createBot();
if (bot) {
    const accountService = createAccountService(db);
    registerHandlers(bot, { mastra, accountService, personalityStore, db });
    bot.start({
        onStart: () => console.log("[telegram] Bot started (long polling)"),
    });

    const shutdown = () => {
        console.log("[telegram] Stopping bot...");
        bot.stop();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
