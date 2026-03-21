import { createStep, createWorkflow } from '@mastra/core/workflows';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { fetchCalendarEvents, type CalendarEvent } from '../tools/calendar-tool.js';
import { pushTelegramMessage, getBriefingChatId } from '../../telegram/telegram-push.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const briefingInputSchema = z.object({
    resourceId: z
        .string()
        .describe('Stable per-user ID used for memory and personality (e.g. "tg-user-123456789").'),
    telegramChatId: z
        .number()
        .optional()
        .describe('Override the default Telegram chat ID for this run. Falls back to TELEGRAM_BRIEFING_CHAT_ID env var.'),
    date: z
        .string()
        .optional()
        .describe('ISO 8601 date string for the briefing day (e.g. "2026-03-21"). Defaults to today.'),
});

const calendarResultSchema = z.object({
    resourceId: z.string(),
    telegramChatId: z.number().optional(),
    date: z.string(),
    eventCount: z.number(),
    events: z.array(
        z.object({
            id: z.string(),
            summary: z.string(),
            description: z.string().optional(),
            location: z.string().optional(),
            startTime: z.string(),
            endTime: z.string(),
            isAllDay: z.boolean(),
            attendees: z.array(z.string()),
            organizer: z.string().optional(),
            status: z.string(),
            htmlLink: z.string().optional(),
        }),
    ),
    calendarError: z.string().optional(),
});

const briefingOutputSchema = z.object({
    delivered: z.boolean(),
    briefingText: z.string(),
    chatId: z.number().optional(),
    error: z.string().optional(),
});

// ─── Step 1: Fetch calendar events ───────────────────────────────────────────

const fetchCalendarStep = createStep({
    id: 'fetch-calendar',
    description: 'Fetch Google Calendar events for the briefing date',
    inputSchema: briefingInputSchema,
    outputSchema: calendarResultSchema,
    execute: async ({ inputData }) => {
        const { resourceId, telegramChatId, date } = inputData;

        const targetDate = date ? new Date(date) : new Date();
        const dateLabel = targetDate.toISOString().split('T')[0] ?? 'unknown';

        let events: CalendarEvent[] = [];
        let calendarError: string | undefined;

        try {
            events = await fetchCalendarEvents(targetDate);
        } catch (error) {
            calendarError = error instanceof Error ? error.message : String(error);
            console.error('[daily-briefing] calendar fetch failed:', calendarError);
        }

        return {
            resourceId,
            telegramChatId,
            date: dateLabel,
            eventCount: events.length,
            events,
            calendarError,
        };
    },
});

// ─── Step 2: Generate briefing text via the sovereign agent ──────────────────

const generateBriefingStep = createStep({
    id: 'generate-briefing',
    description: 'Ask the sovereign agent to compose the daily briefing',
    inputSchema: calendarResultSchema,
    outputSchema: z.object({
        resourceId: z.string(),
        telegramChatId: z.number().optional(),
        briefingText: z.string(),
    }),
    execute: async ({ inputData, mastra }) => {
        const { resourceId, telegramChatId, date, eventCount, events, calendarError } = inputData;

        const agent = mastra?.getAgent('sovereign');
        if (!agent) {
            throw new Error('sovereign agent is not registered in Mastra');
        }

        const calendarSection = buildCalendarSection(events, calendarError);

        const prompt = buildBriefingPrompt(date, calendarSection, eventCount);

        const requestContext = new RequestContext<{ 'resource-id': string }>();
        requestContext.set('resource-id', resourceId);

        const result = await agent.generate(prompt, {
            requestContext,
            memory: {
                resource: resourceId,
                thread: `daily-briefing:${date}`,
            },
            modelSettings: {
                maxOutputTokens: 2000,
            },
        });

        const briefingText =
            result.text?.trim() ||
            `Good morning! Your daily briefing is ready. You have ${eventCount} event(s) today.`;

        return { resourceId, telegramChatId, briefingText };
    },
});

// ─── Step 3: Send briefing via Telegram ──────────────────────────────────────

const sendTelegramBriefingStep = createStep({
    id: 'send-telegram-briefing',
    description: 'Push the generated briefing to the configured Telegram chat',
    inputSchema: z.object({
        resourceId: z.string(),
        telegramChatId: z.number().optional(),
        briefingText: z.string(),
    }),
    outputSchema: briefingOutputSchema,
    execute: async ({ inputData }) => {
        const { telegramChatId, briefingText } = inputData;

        const chatId = telegramChatId ?? getBriefingChatId();

        if (!chatId) {
            console.warn(
                '[daily-briefing] No Telegram chat ID configured. ' +
                'Set TELEGRAM_BRIEFING_CHAT_ID or pass telegramChatId to the workflow.',
            );
            return {
                delivered: false,
                briefingText,
                error: 'No Telegram chat ID configured for briefing delivery',
            };
        }

        try {
            await pushTelegramMessage(chatId, briefingText);
            console.info(`[daily-briefing] Briefing delivered to chat ${chatId}`);

            return { delivered: true, briefingText, chatId };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[daily-briefing] Failed to deliver briefing to chat ${chatId}:`, message);

            return { delivered: false, briefingText, chatId, error: message };
        }
    },
});

// ─── Workflow composition ─────────────────────────────────────────────────────

export const dailyBriefingWorkflow = createWorkflow({
    id: 'daily-briefing',
    inputSchema: briefingInputSchema,
    outputSchema: briefingOutputSchema,
})
    .then(fetchCalendarStep)
    .then(generateBriefingStep)
    .then(sendTelegramBriefingStep);

dailyBriefingWorkflow.commit();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCalendarSection(events: CalendarEvent[], calendarError?: string): string {
    if (calendarError) {
        return `(Calendar unavailable: ${calendarError})`;
    }

    if (events.length === 0) {
        return 'No events scheduled for today.';
    }

    const lines = events.map(event => {
        if (event.isAllDay) {
            return `• [All Day] ${event.summary}${event.location ? ` — ${event.location}` : ''}`;
        }

        const startTime = formatTime(event.startTime);
        const endTime = formatTime(event.endTime);
        const attendeeCount = event.attendees.length;
        const attendeeSuffix = attendeeCount > 0 ? ` (${attendeeCount} attendee${attendeeCount === 1 ? '' : 's'})` : '';

        return `• ${startTime}–${endTime} ${event.summary}${event.location ? ` @ ${event.location}` : ''}${attendeeSuffix}`;
    });

    return lines.join('\n');
}

function buildBriefingPrompt(date: string, calendarSection: string, eventCount: number): string {
    return [
        `Please compose a concise morning briefing for ${date}.`,
        '',
        `## Today's Calendar (${eventCount} event${eventCount === 1 ? '' : 's'})`,
        calendarSection,
        '',
        '## Instructions',
        '- Open with a brief, friendly greeting.',
        '- Summarise the day ahead based on the calendar.',
        '- If there are no events, note it and offer an encouraging word.',
        '- Keep it short — this is a morning push notification, not an essay.',
        '- End with one focus suggestion for the day if appropriate.',
        '- Use your knowledge of me (from memory and personality) to personalise where you can.',
    ].join('\n');
}

function formatTime(isoString: string): string {
    try {
        return new Date(isoString).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: process.env.BRIEFING_TIMEZONE ?? 'UTC',
        });
    } catch {
        return isoString;
    }
}
