import { createWorkflow, createStep } from "@mastra/core/workflows";
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { getBot } from "../telegram/bot.js";
import type { CalendarService, CalendarEvent, PersonalityStore } from "@huginn/shared";

// --- Schemas ---

const accountInputSchema = z.object({
    accountId: z.string(),
    telegramChatId: z.string(),
});

const calendarOutputSchema = z.object({
    accountId: z.string(),
    telegramChatId: z.string(),
    events: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            start: z.string(),
            end: z.string(),
            description: z.string().optional(),
            location: z.string().optional(),
            isAllDay: z.boolean(),
            source: z.object({
                provider: z.string(),
                connectionLabel: z.string(),
            }),
        }),
    ),
    hasEvents: z.boolean(),
});

const memoryOutputSchema = calendarOutputSchema.extend({
    memoryContext: z.array(z.string()),
});

const briefingOutputSchema = z.object({
    accountId: z.string(),
    telegramChatId: z.string(),
    briefingText: z.string(),
});

const deliveryOutputSchema = z.object({
    sent: z.boolean(),
    reason: z.string(),
});

// --- Helpers ---

function serializeEvents(events: CalendarEvent[]) {
    return events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString(),
        description: e.description,
        location: e.location,
        isAllDay: e.isAllDay,
        source: e.source,
    }));
}

function startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

// --- Steps ---

const fetchCalendar = createStep({
    id: "fetch-calendar",
    inputSchema: accountInputSchema,
    outputSchema: calendarOutputSchema,
    execute: async ({ inputData, requestContext }) => {
        const { accountId, telegramChatId } = inputData;
        const calendarService = requestContext!.get("calendar-service") as CalendarService;

        const now = new Date();
        const events = await calendarService.getEvents(accountId, {
            start: startOfDay(now),
            end: endOfDay(now),
        });

        return {
            accountId,
            telegramChatId,
            events: serializeEvents(events),
            hasEvents: events.length > 0,
        };
    },
});

const queryMemory = createStep({
    id: "query-memory",
    inputSchema: calendarOutputSchema,
    outputSchema: memoryOutputSchema,
    execute: async ({ inputData, mastra }) => {
        const { events, hasEvents } = inputData;

        if (!hasEvents) {
            return { ...inputData, memoryContext: [] };
        }

        const agent = mastra!.getAgent("huginn");
        const memory = await agent.getMemory();

        if (!memory) {
            console.warn("[daily-briefing] No memory configured — skipping memory query");
            return { ...inputData, memoryContext: [] };
        }

        const contextSnippets: string[] = [];
        for (const event of events) {
            try {
                const { messages } = await memory.recall({
                    threadId: `briefing-lookup-${inputData.accountId}`,
                    resourceId: inputData.accountId,
                    vectorSearchString: event.title,
                    threadConfig: {
                        semanticRecall: {
                            topK: 2,
                            messageRange: 1,
                            scope: "resource",
                        },
                    },
                });

                if (messages.length > 0) {
                    const snippets = messages
                        .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
                        .map((m: { content: unknown }) =>
                            typeof m.content === "string" ? m.content : JSON.stringify(m.content),
                        )
                        .slice(0, 2)
                        .join(" ... ");
                    if (snippets) {
                        contextSnippets.push(`Re: "${event.title}" — ${snippets}`);
                    }
                }
            } catch (error) {
                console.warn(
                    `[daily-briefing] Memory query failed for "${event.title}":`,
                    error,
                );
            }
        }

        return { ...inputData, memoryContext: contextSnippets };
    },
});

const generateBriefing = createStep({
    id: "generate-briefing",
    inputSchema: memoryOutputSchema,
    outputSchema: briefingOutputSchema,
    execute: async ({ inputData, mastra, requestContext }) => {
        const { accountId, telegramChatId, events, hasEvents, memoryContext } = inputData;
        const agent = mastra!.getAgent("huginn");

        const today = new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });

        let formattedCalendar: string;
        if (!hasEvents) {
            formattedCalendar = "No meetings scheduled today — your calendar is clear.";
        } else {
            formattedCalendar = events
                .map((e) => {
                    const start = new Date(e.start);
                    const end = new Date(e.end);
                    const timeStr = e.isAllDay
                        ? "All day"
                        : `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
                    const loc = e.location ? ` (${e.location})` : "";
                    return `- ${timeStr}: ${e.title}${loc} [${e.source.connectionLabel}]`;
                })
                .join("\n");
        }

        const contextSection =
            memoryContext.length > 0 ? memoryContext.join("\n") : "No relevant context found.";

        const prompt = `Generate a morning briefing for today, ${today}.

## Today's Calendar
${formattedCalendar}

## Relevant Context from Past Conversations
${contextSection}

## Instructions
- Keep it concise — this is a Telegram message
- Lead with the calendar overview
- Weave in any relevant memory context naturally (e.g., "You mentioned wanting to follow up with X about Y — your meeting with them is at 2pm")
- End with a brief motivational note in your personality voice
- Use Markdown formatting compatible with Telegram (bold, bullet points)
- Do NOT use headers or horizontal rules`;

        const agentRequestContext = new RequestContext();
        agentRequestContext.set("account-id", accountId);
        agentRequestContext.set(
            "personality-store",
            requestContext!.get("personality-store") as PersonalityStore,
        );
        agentRequestContext.set(
            "calendar-service",
            requestContext!.get("calendar-service") as CalendarService,
        );

        const dateStr = today.replace(/\s+/g, "-").toLowerCase();
        const response = await agent.generate([{ role: "user" as const, content: prompt }], {
            requestContext: agentRequestContext,
            memory: {
                resource: accountId,
                thread: `briefing-${accountId}-${dateStr}`,
            },
        });

        return { accountId, telegramChatId, briefingText: response.text };
    },
});

const sendTelegram = createStep({
    id: "send-telegram",
    inputSchema: briefingOutputSchema,
    outputSchema: deliveryOutputSchema,
    execute: async ({ inputData }) => {
        const { accountId, telegramChatId, briefingText } = inputData;

        const dryRun = process.env.DAILY_BRIEF_DRY_RUN === "true";
        if (dryRun) {
            console.log(`[daily-briefing] DRY RUN for account ${accountId}:\n${briefingText}`);
            return { sent: false, reason: "dry-run" };
        }

        const bot = getBot();
        if (!bot) {
            return { sent: false, reason: "bot-not-configured" };
        }

        try {
            await bot.api.sendMessage(telegramChatId, briefingText, {
                parse_mode: "Markdown",
            });
            return { sent: true, reason: "delivered" };
        } catch (error) {
            console.error(
                `[daily-briefing] Telegram send failed for account ${accountId}:`,
                error,
            );

            // Retry without Markdown if formatting was the issue
            if (error instanceof Error && error.message.includes("can't parse")) {
                try {
                    await bot.api.sendMessage(telegramChatId, briefingText);
                    return { sent: true, reason: "delivered-plain-text" };
                } catch (retryError) {
                    console.error(`[daily-briefing] Plain text retry also failed:`, retryError);
                }
            }

            return {
                sent: false,
                reason: error instanceof Error ? error.message : "Unknown error",
            };
        }
    },
});

// --- Workflow ---

export const dailyBriefingWorkflow = createWorkflow({
    id: "daily-briefing",
    inputSchema: accountInputSchema,
    outputSchema: deliveryOutputSchema,
})
    .then(fetchCalendar)
    .then(queryMemory)
    .then(generateBriefing)
    .then(sendTelegram)
    .commit();
