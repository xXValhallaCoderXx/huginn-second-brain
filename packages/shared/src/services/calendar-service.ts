import type { Database } from "../db";
import type {
    CalendarConnection,
    CalendarEvent,
    CalendarProvider,
    CalendarService,
} from "../types/calendar";
import { createCalendarConnectionService } from "./calendar-connection-service";
import { googleCalendarProvider } from "./google-calendar-provider";

const providers: Record<string, CalendarProvider> = {
    google: googleCalendarProvider,
};

/**
 * Ensure the connection's access token is fresh. If expired,
 * refresh via the provider and persist new tokens.
 */
async function ensureFreshToken(
    connection: CalendarConnection,
    db: Database,
): Promise<CalendarConnection> {
    // 60s buffer before actual expiry
    if (connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
        return connection;
    }

    const provider = providers[connection.provider];
    if (!provider) return connection;

    const fresh = await provider.refreshTokens(connection);
    const svc = createCalendarConnectionService(db);
    await svc.updateTokens(
        connection.id,
        fresh.accessToken,
        fresh.refreshToken,
        fresh.expiresAt,
    );

    return {
        ...connection,
        accessToken: fresh.accessToken,
        refreshToken: fresh.refreshToken,
        tokenExpiresAt: fresh.expiresAt,
    };
}

export function createCalendarService(db: Database): CalendarService {
    const connSvc = createCalendarConnectionService(db);

    return {
        async getEvents(accountId, range) {
            const connections = await connSvc.getEnabledConnections(accountId);
            if (connections.length === 0) return [];

            const results = await Promise.allSettled(
                connections.map(async (conn) => {
                    const provider = providers[conn.provider];
                    if (!provider) return [];

                    const fresh = await ensureFreshToken(conn, db);
                    return provider.getEvents(fresh, range);
                }),
            );

            const events: CalendarEvent[] = [];
            const seen = new Set<string>();
            const errors: Error[] = [];

            for (const result of results) {
                if (result.status === "fulfilled") {
                    for (const event of result.value) {
                        const key = `${event.source.provider}:${event.id}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            events.push(event);
                        }
                    }
                } else {
                    console.warn(
                        "[CalendarService] Provider fetch failed:",
                        result.reason,
                    );
                    errors.push(
                        result.reason instanceof Error
                            ? result.reason
                            : new Error(String(result.reason)),
                    );
                }
            }

            // If every connection failed, throw so callers can distinguish
            // "empty calendar" from "all providers errored"
            if (errors.length > 0 && errors.length === connections.length) {
                throw new Error(
                    `All calendar providers failed: ${errors[0].message}`,
                );
            }

            events.sort((a, b) => a.start.getTime() - b.start.getTime());
            return events;
        },

        formatForContext(events) {
            if (events.length === 0) return "";

            const allDay = events.filter((e) => e.isAllDay);
            const timed = events.filter((e) => !e.isAllDay);

            const lines: string[] = ["── Today's Calendar ──"];

            if (allDay.length > 0) {
                for (const e of allDay) {
                    const label = e.source.connectionLabel;
                    lines.push(`  All day: ${e.title} (${label})`);
                }
            }

            for (const e of timed) {
                const start = formatTime(e.start);
                const end = formatTime(e.end);
                const label = e.source.connectionLabel;
                lines.push(`  ${start}–${end}  ${e.title} (${label})`);
            }

            return lines.join("\n");
        },
    };
}

function formatTime(d: Date): string {
    return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}
