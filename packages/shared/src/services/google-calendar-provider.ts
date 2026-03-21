import type {
    CalendarEvent,
    CalendarProvider,
    CalendarProviderType,
} from "../types/calendar";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

interface GoogleEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    status?: string;
}

interface GoogleEventsResponse {
    items?: GoogleEvent[];
    nextPageToken?: string;
}

function toCalendarEvent(
    event: GoogleEvent,
    connectionLabel: string,
): CalendarEvent | null {
    if (event.status === "cancelled") return null;
    if (!event.start) return null;

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

export const googleCalendarProvider: CalendarProvider = {
    provider: "google",

    async getEvents(connection, range) {
        const label = connection.displayName ?? connection.providerEmail;
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
            if (pageToken) params.set("pageToken", pageToken);

            const res = await fetch(
                `${CALENDAR_API}/calendars/primary/events?${params}`,
                {
                    headers: {
                        Authorization: `Bearer ${connection.accessToken}`,
                    },
                },
            );

            if (!res.ok) {
                const body = await res.text();
                throw new Error(
                    `Google Calendar API error ${res.status}: ${body}`,
                );
            }

            const data = (await res.json()) as GoogleEventsResponse;
            if (data.items) {
                for (const item of data.items) {
                    const mapped = toCalendarEvent(item, label);
                    if (mapped) events.push(mapped);
                }
            }
            pageToken = data.nextPageToken;
        } while (pageToken);

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
