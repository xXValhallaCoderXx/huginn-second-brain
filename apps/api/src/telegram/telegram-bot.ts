import type { Mastra } from '@mastra/core/mastra';
import { RequestContext } from '@mastra/core/request-context';
import { Bot, GrammyError, HttpError, type Context, webhookCallback } from 'grammy';
import { ensureUserSeeded } from '../identity/seed.js';
import { getPersonalityStore } from '../identity/store.js';
import { getLearningDb } from '../learning/db.js';
import { runLearningLoop } from '../learning/loop.js';
import { splitTelegramMessage } from './telegram-client.js';

type TelegramBotConfig = {
    agentKey: string;
    mastra: Mastra;
};

type TelegramBotContext = Context & {
    botConfig: TelegramBotConfig;
};

type TelegramMessageJob = {
    chatId: number;
    telegramUserId?: number;
    chatType?: string;
    from?: {
        firstName?: string;
        lastName?: string;
        username?: string;
    };
    text: string;
    replyToMessageId?: number;
};

function resolveResourceId(telegramUserId: number): string {
    return `tg-user-${telegramUserId}`;
}

type TelegramWebhookHandler = (context: {
    req: {
        json: <T>() => Promise<T>;
        header: (header: string) => string | undefined;
    };
    body: (data: string | null, status?: 204) => Response;
    status: (status: any) => void;
    json: (json: string) => Response;
}) => Promise<Response>;

const TELEGRAM_UPDATE_TTL_MS = 5 * 60 * 1000;

let cachedWebhookHandler: TelegramWebhookHandler | undefined;
let cachedMastra: Mastra | undefined;

function getTelegramBotToken() {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }

    return token;
}

function getConfiguredTelegramAgentKey() {
    return 'sovereign';
}

function normalizeTelegramCommand(text: string) {
    return text.split('@')[0]?.trim().toLowerCase() || text.trim().toLowerCase();
}

function buildTelegramPrompt(job: TelegramMessageJob) {
    const senderName = [job.from?.firstName, job.from?.lastName].filter(Boolean).join(' ').trim();
    const username = job.from?.username ? `@${job.from.username}` : undefined;
    const sender = senderName || username;
    const chatType = job.chatType;

    if (chatType === 'private' || !sender || !chatType) {
        return job.text;
    }

    return `Message from ${sender} in a ${chatType} Telegram chat:\n\n${job.text}`;
}

function buildStartMessage() {
    return [
        '👋 Your Telegram bot is connected to Mastra via grammY.',
        '',
        'Send me a normal message and I will forward it to the configured Mastra agent.',
        'Right now the default agent is the generic brain assistant, so a great first test is:',
        '',
        '“Help me think through my priorities for today.”',
    ].join('\n');
}

function buildHelpMessage() {
    return [
        'Here is how to use this bot:',
        '',
        '• Send a text message to chat with your Mastra agent',
        '• /start shows the welcome message',
        '• /help shows this help message',
        '• /status shows server and agent health',
        '',
        'This POC is wired to the built-in generic brain agent by default.',
    ].join('\n');
}

function buildStatusMessage(activeChats: Set<number>, pendingQueueSize: number) {
    const agentStatus = activeChats.size > 0
        ? `🔄 Agent is processing ${activeChats.size} chat(s) right now`
        : '✅ Agent is idle — ready for messages';

    const queueStatus = pendingQueueSize > 0
        ? `📬 ${pendingQueueSize} message(s) queued`
        : '📭 Queue is empty';

    return [
        '🟢 Server: online',
        agentStatus,
        queueStatus,
        '',
        `⏱ ${new Date().toUTCString()}`,
    ].join('\n');
}

async function replyWithText(ctx: TelegramBotContext, text: string, replyToMessageId?: number) {
    const chunks = splitTelegramMessage(text);

    for (let index = 0; index < chunks.length; index += 1) {
        await ctx.reply(chunks[index], {
            link_preview_options: {
                is_disabled: true,
            },
            ...(replyToMessageId && index === 0
                ? {
                    reply_parameters: {
                        message_id: replyToMessageId,
                        allow_sending_without_reply: true,
                    },
                }
                : {}),
        });
    }

    return chunks.length;
}

function installDuplicateUpdateGuard(bot: Bot<TelegramBotContext>) {
    const inFlightUpdates = new Set<number>();
    const processedUpdates = new Map<number, NodeJS.Timeout>();

    bot.use(async (ctx, next) => {
        const updateId = ctx.update.update_id;

        if (inFlightUpdates.has(updateId) || processedUpdates.has(updateId)) {
            return;
        }

        let completed = false;
        inFlightUpdates.add(updateId);

        try {
            await next();
            completed = true;
        } finally {
            inFlightUpdates.delete(updateId);

            if (completed) {
                const existingTimer = processedUpdates.get(updateId);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                const timer = setTimeout(() => {
                    processedUpdates.delete(updateId);
                }, TELEGRAM_UPDATE_TTL_MS);

                timer.unref?.();
                processedUpdates.set(updateId, timer);
            }
        }
    });
}

function createTelegramMessageQueue(bot: Bot<TelegramBotContext>, mastra: Mastra) {
    const jobsByChat = new Map<number, TelegramMessageJob[]>();
    const activeChats = new Set<number>();

    const runChatWorker = async (chatId: number) => {
        if (activeChats.has(chatId)) {
            return;
        }

        activeChats.add(chatId);

        try {
            while (true) {
                const queue = jobsByChat.get(chatId);
                const job = queue?.shift();

                if (!job) {
                    jobsByChat.delete(chatId);
                    break;
                }

                const agentKey = getConfiguredTelegramAgentKey();
                const agent = mastra.getAgent(agentKey);

                if (!agent) {
                    throw new Error(`Telegram agent "${agentKey}" is not registered in Mastra`);
                }

                try {
                    console.info(`[telegram] processing queued message for chat ${chatId} with agent ${agentKey}`);
                    await bot.api.sendChatAction(chatId, 'typing');

                    // Resolve stable per-user identity (falls back to chat ID for anonymous messages)
                    const resourceId = job.telegramUserId
                        ? resolveResourceId(job.telegramUserId)
                        : `telegram-chat:${chatId}`;

                    await ensureUserSeeded(getPersonalityStore(), resourceId);

                    const requestContext = new RequestContext<{ 'resource-id': string }>();
                    requestContext.set('resource-id', resourceId);

                    const result = await agent.generate(buildTelegramPrompt(job), {
                        requestContext,
                        memory: {
                            resource: resourceId,
                            thread: `tg-chat:${chatId}`,
                        },
                        modelSettings: {
                            maxOutputTokens: 4000,
                        },
                    });

                    const responseText = result.text?.trim() || 'I had trouble generating a response just now. Please try again.';
                    const chunks = splitTelegramMessage(responseText);

                    for (let index = 0; index < chunks.length; index += 1) {
                        await bot.api.sendMessage(chatId, chunks[index], {
                            link_preview_options: {
                                is_disabled: true,
                            },
                            ...(job.replyToMessageId && index === 0
                                ? {
                                    reply_parameters: {
                                        message_id: job.replyToMessageId,
                                        allow_sending_without_reply: true,
                                    },
                                }
                                : {}),
                        });
                    }

                    console.info(`[telegram] sent response to chat ${chatId} in ${chunks.length} chunk(s)`);
                } catch (error) {
                    console.error(`Telegram background job failed for chat ${chatId}:`, error);

                    await bot.api.sendMessage(chatId, 'Sorry — I hit a problem while thinking about that. Please try again in a moment.', {
                        ...(job.replyToMessageId
                            ? {
                                reply_parameters: {
                                    message_id: job.replyToMessageId,
                                    allow_sending_without_reply: true,
                                },
                            }
                            : {}),
                    });
                }
            }
        } finally {
            activeChats.delete(chatId);

            if ((jobsByChat.get(chatId)?.length || 0) > 0) {
                void runChatWorker(chatId);
            }
        }
    };

    return {
        enqueue(job: TelegramMessageJob) {
            const existingQueue = jobsByChat.get(job.chatId);

            if (existingQueue) {
                existingQueue.push(job);
            } else {
                jobsByChat.set(job.chatId, [job]);
            }

            console.info(`[telegram] queued message for chat ${job.chatId}; queue length is ${jobsByChat.get(job.chatId)?.length ?? 0}`);

            void runChatWorker(job.chatId);
        },
        getStats() {
            let pendingQueueSize = 0;
            for (const queue of jobsByChat.values()) {
                pendingQueueSize += queue.length;
            }
            return { activeChats, pendingQueueSize };
        },
    };
}

function createTelegramBot(mastra: Mastra) {
    const bot = new Bot<TelegramBotContext>(getTelegramBotToken());
    const messageQueue = createTelegramMessageQueue(bot, mastra);

    bot.use(async (ctx, next) => {
        ctx.botConfig = {
            mastra,
            agentKey: getConfiguredTelegramAgentKey(),
        };

        await next();
    });

    installDuplicateUpdateGuard(bot);

    bot.command('start', async ctx => {
        await replyWithText(ctx, buildStartMessage(), ctx.msg?.message_id);
    });

    bot.command('help', async ctx => {
        await replyWithText(ctx, buildHelpMessage(), ctx.msg?.message_id);
    });

    bot.command('status', async ctx => {
        const { activeChats, pendingQueueSize } = messageQueue.getStats();
        await replyWithText(ctx, buildStatusMessage(activeChats, pendingQueueSize), ctx.msg?.message_id);
    });

    bot.command('learn', async ctx => {
        if (!ctx.from?.id) return;

        const resourceId = resolveResourceId(ctx.from.id);
        await replyWithText(ctx, '🧠 Starting personality learning loop...', ctx.msg?.message_id);

        try {
            const db = getLearningDb();
            const store = getPersonalityStore();
            const result = await runLearningLoop({ db, store, resourceId });

            const statusEmoji = result.outcome === 'COMMITTED' ? '✅' : '⚠️';
            const summary = [
                `${statusEmoji} Learning ${result.outcome.toLowerCase()}`,
                `Iterations: ${result.iterations}`,
                result.finalScore != null ? `Score: ${result.finalScore.toFixed(2)}` : null,
                `Time: ${(result.durationMs / 1000).toFixed(1)}s`,
                result.changeSummary,
            ].filter(Boolean).join('\n');

            await replyWithText(ctx, summary);
        } catch (error) {
            console.error('[learning] /learn command failed:', error);
            await replyWithText(ctx, '❌ Learning loop failed. Check server logs.');
        }
    });

    bot.on(['message', 'edited_message'], async ctx => {
        if (ctx.from?.is_bot) {
            return;
        }

        const userText = ctx.msg?.text?.trim() || ctx.msg?.caption?.trim();

        if (!userText) {
            await replyWithText(ctx, 'I can currently respond to text messages only.', ctx.msg?.message_id);
            return;
        }

        const normalizedCommand = normalizeTelegramCommand(userText);

        if (normalizedCommand === '/start' || normalizedCommand === '/help' || normalizedCommand === '/status' || normalizedCommand === '/learn') {
            return;
        }

        if (!ctx.chatId) {
            return;
        }

        console.info(`[telegram] received update ${ctx.update.update_id} for chat ${ctx.chatId}`);

        messageQueue.enqueue({
            chatId: ctx.chatId,
            telegramUserId: ctx.from?.id,
            chatType: ctx.chat?.type,
            from: {
                firstName: ctx.from?.first_name,
                lastName: ctx.from?.last_name,
                username: ctx.from?.username,
            },
            text: userText,
            replyToMessageId: ctx.msg?.message_id,
        });
    });

    bot.catch(error => {
        const { ctx } = error;
        console.error(`Telegram bot error while handling update ${ctx.update.update_id}:`);

        if (error.error instanceof GrammyError) {
            console.error('grammY error:', error.error.description);
            return;
        }

        if (error.error instanceof HttpError) {
            console.error('Telegram HTTP error:', error.error);
            return;
        }

        console.error(error.error);
    });

    return bot;
}

export function getTelegramWebhookHandler(mastra: Mastra) {
    if (!cachedWebhookHandler || cachedMastra !== mastra) {
        const bot = createTelegramBot(mastra);
        console.info('[telegram] initializing webhook handler');
        cachedWebhookHandler = webhookCallback(bot, 'hono') as TelegramWebhookHandler;
        cachedMastra = mastra;
    }

    return cachedWebhookHandler;
}