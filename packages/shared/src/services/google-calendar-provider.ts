import type {
    CalendarEvent,
    CalendarProvider,
    CalendarProviderType,
} from "../types/calendar.js";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface GoogleEventAttendee {
    email?: string;
    self?: boolean;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
}

interface GoogleEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
    attendees?: GoogleEventAttendee[];
}

interface GoogleEventsResponse {
    items?: GoogleEvent[];
    nextPageToken?: string;
}

interface GoogleCalendarListEntry {
    id: string;
    summary?: string;
    selected?: boolean;
    deleted?: boolean;
    hidden?: boolean;
    accessRole?: string;
}

interface GoogleCalendarListResponse {
    items?: GoogleCalendarListEntry[];
    nextPageToken?: string;
}

function toCalendarEvent(
    event: GoogleEvent,
    connectionLabel: string,
): CalendarEvent | null {
    if (event.status === "cancelled") return null;
    if (!event.start) return null;

    // Filter out events the user has explicitly declined
    if (event.attendees) {
        const self = event.attendees.find((a) => a.self);
        if (self?.responseStatus === "declined") return null;
    }

    const isAllDay = !event.start.dateTime;
    const startStr = event.start.dateTime ?? event.start.date;
    const endStr = event.end?.dateTime ?? event.end?.date;

    if (!startStr) return null;

    return {
        id: event.id,
        title: event.summary ?? "(No title)",
        description: event.description,
        start: new Date(startStr),
        end: endStr ? new Date(endStr) : new Date(startStr),
        location: event.location,
        isAllDay,
        source: {
            provider: "google" as CalendarProviderType,
            connectionLabel,
        },
    };
}

/**
 * List all non-hidden, non-deleted calendar IDs visible to the user.
 */
async function listCalendarIds(
    headers: Record<string, string>,
): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
        const params = new URLSearchParams();
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(
            `${CALENDAR_API}/users/me/calendarList?${params}`,
            { headers },
        );
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Google calendarList error ${res.status}: ${body}`);
        }

        const data = (await res.json()) as GoogleCalendarListResponse;
        if (data.items) {
            for (const cal of data.items) {
                // Only include calendars the user owns or can write to.
                // This excludes subscribed/shared calendars (role "reader" / "freeBusyReader")
                // whose events the user isn't actually participating in.
                const isWritable =
                    cal.accessRole === "owner" || cal.accessRole === "writer";
                if (!cal.deleted && !cal.hidden && cal.id && isWritable) {
                    ids.push(cal.id);
                }
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return ids;
}

/**
 * Fetch all events from a single calendar within the given range.
 */
async function fetchEventsForCalendar(
    calendarId: string,
    range: { start: Date; end: Date },
    headers: Record<string, string>,
    connectionLabel: string,
): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;

    do {
        const params = new URLSearchParams({
            timeMin: range.start.toISOString(),
            timeMax: range.end.toISOString(),
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
        });
        // Ensure attendees are included so we can filter by self-attendance
        params.set("fields", "items(id,summary,description,location,start,end,status,attendees(email,self,responseStatus)),nextPageToken");
        if (pageToken) params.set("pageToken", pageToken);

        const res = await fetch(
            `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
            { headers },
        );

        if (!res.ok) {
            const body = await res.text();
            throw new Error(
                `Google Calendar API error ${res.status} for ${calendarId}: ${body}`,
            );
        }

        const data = (await res.json()) as GoogleEventsResponse;
        if (data.items) {
            for (const item of data.items) {
                const mapped = toCalendarEvent(item, connectionLabel);
                if (mapped) events.push(mapped);
            }
        }
        pageToken = data.nextPageToken;
    } while (pageToken);

    return events;
}

export const googleCalendarProvider: CalendarProvider = {
    provider: "google",

    async getEvents(connection, range) {
        const label = connection.displayName ?? connection.providerEmail;
        const authHeader = { Authorization: `Bearer ${connection.accessToken}` };

        // 1) List all visible calendars
        const calendarIds = await listCalendarIds(authHeader);

        // 2) Fetch events from each calendar in parallel
        const results = await Promise.allSettled(
            calendarIds.map((calId) =>
                fetchEventsForCalendar(calId, range, authHeader, label),
            ),
        );

        const events: CalendarEvent[] = [];
        for (const result of results) {
            if (result.status === "fulfilled") {
                events.push(...result.value);
            } else {
                console.warn("[GoogleCalendar] Failed to fetch calendar:", result.reason);
            }
        }

        return events;
    },

    async refreshTokens(connection) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for token refresh");
        }

        const res = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: connection.refreshToken,
                grant_type: "refresh_token",
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Google token refresh error ${res.status}: ${body}`);
        }

        const data = (await res.json()) as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
        };

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? connection.refreshToken,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
        };
    },
};
