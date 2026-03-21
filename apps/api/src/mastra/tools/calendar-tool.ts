import { createTool } from '@mastra/core/tools';
import { google } from 'googleapis';
import { z } from 'zod';

const calendarEventSchema = z.object({
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
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

function createOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            'Google Calendar credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.',
        );
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return auth;
}

export async function fetchCalendarEvents(
    targetDate: Date,
    calendarId = 'primary',
): Promise<CalendarEvent[]> {
    const auth = createOAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.events.list({
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
    });

    const items = response.data.items ?? [];

    return items.map(event => {
        const startRaw = event.start?.dateTime ?? event.start?.date ?? '';
        const endRaw = event.end?.dateTime ?? event.end?.date ?? '';
        const isAllDay = !event.start?.dateTime;

        return {
            id: event.id ?? '',
            summary: event.summary ?? '(No title)',
            description: event.description ?? undefined,
            location: event.location ?? undefined,
            startTime: startRaw,
            endTime: endRaw,
            isAllDay,
            attendees: (event.attendees ?? [])
                .map(a => a.email ?? '')
                .filter(Boolean),
            organizer: event.organizer?.email ?? undefined,
            status: event.status ?? 'confirmed',
            htmlLink: event.htmlLink ?? undefined,
        };
    });
}

export const calendarTool = createTool({
    id: 'get-calendar-events',
    description:
        'Fetch Google Calendar events for a specific date (defaults to today). Returns a list of events with their times, titles, locations, and attendees.',
    inputSchema: z.object({
        date: z
            .string()
            .optional()
            .describe(
                'ISO 8601 date string (e.g. "2026-03-21"). Defaults to today if not provided.',
            ),
        calendarId: z
            .string()
            .optional()
            .describe('Google Calendar ID. Defaults to "primary".'),
    }),
    outputSchema: z.object({
        date: z.string(),
        eventCount: z.number(),
        events: z.array(calendarEventSchema),
        error: z.string().optional(),
    }),
    execute: async ({ date, calendarId }) => {
        const targetDate = date ? new Date(date) : new Date();

        const dateLabel = targetDate.toISOString().split('T')[0] ?? 'unknown';

        try {
            const events = await fetchCalendarEvents(targetDate, calendarId ?? 'primary');

            return {
                date: dateLabel,
                eventCount: events.length,
                events,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[calendar] failed to fetch events:', message);

            return {
                date: dateLabel,
                eventCount: 0,
                events: [],
                error: message,
            };
        }
    },
});
