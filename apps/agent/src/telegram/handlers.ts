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
            const response = await agent.generate(ctx.message.text, {
                requestContext,
                memory: {
                    resource: account.id,
                    thread: threadId,
                },
            });
            await ctx.reply(response.text);
        } catch (err) {
            console.error("[telegram] Error generating response:", err);
            await ctx.reply("Sorry, I had trouble processing that. Please try again.");
        }
    });
}
