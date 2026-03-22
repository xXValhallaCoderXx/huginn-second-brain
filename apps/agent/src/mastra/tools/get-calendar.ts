import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CalendarService } from "@huginn/shared";

/**
 * Mastra tool that lets the agent query the user's calendar for a specific date range.
 * CalendarService is injected via requestContext at runtime.
 */
/**
 * Resolve a relative period ("today", "this week", "next week") into
 * a concrete { start, end } date range based on the current date.
 */
function resolveRelativePeriod(period: string): { start: Date; end: Date } {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
        case "tomorrow": {
            const start = new Date(startOfDay.getTime() + 86_400_000);
            return { start, end: new Date(start.getTime() + 86_400_000) };
        }
        case "this week": {
            const day = startOfDay.getDay(); // 0=Sun
            const monday = new Date(startOfDay.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000);
            return { start: monday, end: new Date(monday.getTime() + 7 * 86_400_000) };
        }
        case "next week": {
            const day = startOfDay.getDay();
            const monday = new Date(startOfDay.getTime() - (day === 0 ? 6 : day - 1) * 86_400_000);
            const nextMon = new Date(monday.getTime() + 7 * 86_400_000);
            return { start: nextMon, end: new Date(nextMon.getTime() + 7 * 86_400_000) };
        }
        case "today":
        default:
            return { start: startOfDay, end: new Date(startOfDay.getTime() + 86_400_000) };
    }
}

export const getCalendarTool = createTool({
    id: "get-calendar",
    description:
        "Look up the user's calendar events for a specific date range. " +
        "ONLY use this tool when the user EXPLICITLY asks about their schedule, " +
        "meetings, or availability. Do NOT call this for general conversation. " +
        "Prefer using the 'period' parameter with values like 'today', 'tomorrow', " +
        "'this week', or 'next week' instead of computing dates yourself.",
    inputSchema: z.object({
        period: z
            .enum(["today", "tomorrow", "this week", "next week"])
            .optional()
            .describe(
                "A relative time period. Use this instead of startDate/endDate " +
                "when the user says 'today', 'tomorrow', 'this week', or 'next week'.",
            ),
        startDate: z
            .string()
            .optional()
            .describe(
                "Start date in ISO 8601 format. Only needed for specific date ranges " +
                "that don't match a relative period.",
            ),
        endDate: z
            .string()
            .optional()
            .describe(
                "End date in ISO 8601 format. Only needed for specific date ranges " +
                "that don't match a relative period.",
            ),
    }),
    outputSchema: z.object({
        events: z.array(
            z.object({
                title: z.string(),
                start: z.string(),
                end: z.string(),
                isAllDay: z.boolean(),
                location: z.string().optional(),
                calendar: z.string(),
            }),
        ),
        summary: z.string(),
    }),
    execute: async (input, context) => {
        const accountId = context?.requestContext?.get("account-id") as
            | string
            | undefined;
        const calendarService = context?.requestContext?.get(
            "calendar-service",
        ) as CalendarService | undefined;

        if (!accountId || !calendarService) {
            return {
                events: [],
                summary: "Calendar is not configured for this account.",
            };
        }

        try {
            let start: Date;
            let end: Date;
            if (input.period) {
                const range = resolveRelativePeriod(input.period);
                start = range.start;
                end = range.end;
            } else if (input.startDate && input.endDate) {
                start = new Date(input.startDate);
                end = new Date(input.endDate);
            } else {
                // Default to today if nothing provided
                const range = resolveRelativePeriod("today");
                start = range.start;
                end = range.end;
            }

            const events = await calendarService.getEvents(accountId, {
                start,
                end,
            });

            const mapped = events.map((e) => ({
                title: e.title,
                start: e.start.toISOString(),
                end: e.end.toISOString(),
                isAllDay: e.isAllDay,
                location: e.location,
                calendar: e.source.connectionLabel,
            }));

            const summary = calendarService.formatForContext(events);

            return {
                events: mapped,
                summary: summary || "No events found for the requested date range.",
            };
        } catch (err) {
            console.error("[get-calendar] Failed to fetch events:", err);
            return {
                events: [],
                summary:
                    "Sorry, I wasn't able to reach your calendar right now — " +
                    "there was a server-side error connecting to Google Calendar. " +
                    "Please try again in a moment.",
            };
        }
    },
});
