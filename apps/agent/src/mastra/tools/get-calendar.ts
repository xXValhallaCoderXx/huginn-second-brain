import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CalendarService } from "@huginn/shared";

/**
 * Mastra tool that lets the agent query the user's calendar for a specific date range.
 * CalendarService is injected via requestContext at runtime.
 */
export const getCalendarTool = createTool({
    id: "get-calendar",
    description:
        "Look up the user's calendar events for a date range. " +
        "Use this when the user asks about their schedule, upcoming meetings, " +
        "or availability on specific days.",
    inputSchema: z.object({
        startDate: z
            .string()
            .describe("Start date in ISO 8601 format (e.g. 2025-03-15T00:00:00Z)"),
        endDate: z
            .string()
            .describe("End date in ISO 8601 format (e.g. 2025-03-16T00:00:00Z)"),
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

        const events = await calendarService.getEvents(accountId, {
            start: new Date(input.startDate),
            end: new Date(input.endDate),
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
    },
});
