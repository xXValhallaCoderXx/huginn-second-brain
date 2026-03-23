import { defineEventHandler, readBody, createError } from "h3";
import { auth } from "~/lib/auth";
import { db } from "~/lib/db";
import { resolveAccount } from "~/lib/account-resolution";

export default defineEventHandler(async (event) => {
    // Resolve authenticated account from session
    const session = await auth.api.getSession({
        headers: event.headers as unknown as Headers,
    });
    if (!session) {
        throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
    }

    const account = await resolveAccount(db, session);
    if (!account) {
        throw createError({ statusCode: 401, statusMessage: "Account not found" });
    }

    const body = await readBody(event) as { message?: string; threadId?: string };
    const { message, threadId } = body;

    if (!message) {
        throw createError({ statusCode: 400, statusMessage: "Missing message" });
    }

    const agentUrl = process.env.AGENT_URL ?? "http://localhost:4111";
    const agentRes = await fetch(`${agentUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            accountId: account.id,
            message,
            threadId,
        }),
    });

    if (!agentRes.ok) {
        const text = await agentRes.text();
        throw createError({ statusCode: agentRes.status, statusMessage: text });
    }

    return new Response(agentRes.body, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
});
