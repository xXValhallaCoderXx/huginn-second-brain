import type { Bot } from "grammy";
import { RequestContext } from "@mastra/core/request-context";
import type { Mastra } from "@mastra/core";
import type { AccountService, PersonalityStore, CalendarService, Database } from "@huginn/shared";
import { verifyAndConsumeLinkingCode } from "@huginn/shared";

interface HandlerDeps {
    mastra: Mastra;
    accountService: AccountService;
    personalityStore: PersonalityStore;
    calendarService: CalendarService;
    db: Database;
}

export function registerHandlers(bot: Bot, deps: HandlerDeps): void {
    const { mastra, accountService, personalityStore, calendarService, db } = deps;

    async function handleLinkCode(ctx: { from?: { id: number }; reply: (text: string) => Promise<unknown> }, code: string) {
        const telegramUserId = String(ctx.from?.id);
        if (!telegramUserId || telegramUserId === "undefined") {
            await ctx.reply("Could not identify your Telegram account.");
            return;
        }

        const result = await verifyAndConsumeLinkingCode(db, code);
        if (!result) {
            await ctx.reply(
                "❌ That code didn't work or has expired.\n" +
                "Generate a new one from your dashboard.",
            );
            return;
        }

        try {
            await accountService.linkChannel(result.accountId, "telegram", telegramUserId);
            await ctx.reply("✅ Linked! I'm ready to chat. Send me anything.");
        } catch (err) {
            console.error("[telegram] Error linking channel:", err);
            await ctx.reply("Something went wrong linking your account. Please try again.");
        }
    }

    // /start command — handles deep link payloads (LINK-XXXX) or shows welcome
    bot.command("start", async (ctx) => {
        const payload = ctx.match?.trim();

        if (payload && payload.startsWith("LINK-")) {
            await handleLinkCode(ctx, payload);
            return;
        }

        await ctx.reply(
            "👋 I'm Huginn, your personal AI assistant.\n\n" +
            "To get started, link your Telegram account:\n" +
            "1. Go to your Huginn dashboard\n" +
            "2. Click \"Connect Telegram\"\n" +
            "3. Click the link or scan the QR code\n\n" +
            "Once linked, just send me any message!",
        );
    });

    // /link CODE command (fallback for users already in chat)
    bot.command("link", async (ctx) => {
        const code = ctx.match?.trim();
        if (!code) {
            await ctx.reply("Please provide a linking code: /link YOUR-CODE");
            return;
        }
        await handleLinkCode(ctx, code);
    });

    // /brief command — on-demand daily briefing
    bot.command("brief", async (ctx) => {
        const telegramUserId = String(ctx.from?.id);
        const account = await accountService.resolveAccountFromChannel("telegram", telegramUserId);

        if (!account) {
            await ctx.reply(
                "I don't recognise this Telegram account yet.\n" +
                "Link your account first, then try /brief again.",
            );
            return;
        }

        await ctx.replyWithChatAction("typing");
        const typingInterval = setInterval(() => {
            ctx.replyWithChatAction("typing").catch(() => {});
        }, 4000);

        try {
            const workflow = mastra.getWorkflow("daily-briefing");
            const run = await workflow.createRun();

            const requestContext = new RequestContext();
            requestContext.set("db", db);
            requestContext.set("calendar-service", calendarService);
            requestContext.set("personality-store", personalityStore);
            requestContext.set("account-service", accountService);

            const result = await run.start({
                inputData: {
                    accountId: account.id,
                    telegramChatId: String(ctx.chat.id),
                },
                requestContext,
            });

            if (result.status !== "success") {
                console.error("[brief] Workflow failed:", result.status);
                await ctx.reply("Sorry, I couldn't generate your briefing right now. Try again in a moment.");
            }
        } catch (error) {
            console.error("[brief] Error running briefing workflow:", error);
            await ctx.reply("Something went wrong generating your briefing. Please try again.");
        } finally {
            clearInterval(typingInterval);
        }
    });

    // Regular messages — route to Huginn agent
    bot.on("message:text", async (ctx) => {
        const telegramUserId = String(ctx.from?.id);
        const account = await accountService.resolveAccountFromChannel("telegram", telegramUserId);

        if (!account) {
            await ctx.reply(
                "I don't recognise this Telegram account yet.\n" +
                "Sign up at your Huginn dashboard and link your Telegram to get started.",
            );
            return;
        }

        const chatId = ctx.chat.id;
        const threadId = `tg-chat-${chatId}`;
        const agent = mastra.getAgent("huginn");

        const requestContext = new RequestContext();
        requestContext.set("account-id", account.id);
        requestContext.set("personality-store", personalityStore);
        requestContext.set("calendar-service", calendarService);

        try {
            const result = await agent.stream(ctx.message.text, {
                requestContext,
                memory: {
                    resource: account.id,
                    thread: threadId,
                },
            });

            // Show native "typing..." indicator while buffering initial tokens
            await ctx.replyWithChatAction("typing");
            const typingInterval = setInterval(() => {
                ctx.replyWithChatAction("typing").catch(() => { });
            }, 4000);

            let buffer = "";
            let msgId: number | null = null;
            let lastEdit = 0;
            const THROTTLE_MS = 1500;
            const FIRST_CHUNK_MIN = 50; // chars before sending first visible message

            const reader = result.textStream.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += value;

                // Phase 1: Still showing typing indicator, buffer until we have enough text
                if (msgId === null) {
                    if (buffer.trim().length >= FIRST_CHUNK_MIN) {
                        clearInterval(typingInterval);
                        const sent = await ctx.reply(buffer);
                        msgId = sent.message_id;
                        lastEdit = Date.now();
                    }
                    continue;
                }

                // Phase 2: Edit-in-place with throttled updates
                const now = Date.now();
                if (now - lastEdit >= THROTTLE_MS) {
                    try {
                        await ctx.api.editMessageText(ctx.chat.id, msgId, buffer);
                        lastEdit = now;
                    } catch {
                        // Telegram rejects edits if text hasn't changed — safe to ignore
                    }
                }
            }

            clearInterval(typingInterval);

            // Final message: either edit existing or send what we have
            if (msgId !== null && buffer.trim()) {
                try {
                    await ctx.api.editMessageText(ctx.chat.id, msgId, buffer);
                } catch {
                    // Already up to date
                }
            } else if (buffer.trim()) {
                // Stream ended before hitting FIRST_CHUNK_MIN (short reply)
                await ctx.reply(buffer);
            } else {
                await ctx.reply("I had nothing to say — try again?");
            }
        } catch (err) {
            console.error("[telegram] Error generating response:", err);
            await ctx.reply("Sorry, I had trouble processing that. Please try again.");
        }
    });
}
