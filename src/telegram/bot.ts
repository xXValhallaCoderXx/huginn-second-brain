import { Bot } from "grammy";
import { huginnAgent } from "../mastra/agents/huginn.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error(
    "TELEGRAM_BOT_TOKEN environment variable is not set. " +
      "Create a bot with @BotFather on Telegram and set the token."
  );
}

export const bot = new Bot(token);

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const userMessage = ctx.message.text;

  try {
    const result = await huginnAgent.generate(userMessage, {
      memory: {
        resource: "nate",
        thread: chatId,
      },
    });
    await ctx.reply(result.text);
  } catch (error) {
    console.error(
      `[Telegram] Error processing message from chat ${chatId}:`,
      error
    );
    await ctx.reply(
      "Sorry, I ran into an issue processing your message. Please try again."
    );
  }
});

bot.catch((err) => {
  console.error("[Telegram] Unhandled bot error:", err);
});
