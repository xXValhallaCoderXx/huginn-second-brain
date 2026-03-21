import type { CalendarEvent } from "@huginn/shared";

interface CacheEntry {
    events: CalendarEvent[];
    expiresAt: number;
}

const TTL_MS = 5 * 60 * 1_000; // 5 minutes
const cache = new Map<string, CacheEntry>();

export function getCachedEvents(accountId: string): CalendarEvent[] | null {
    const entry = cache.get(accountId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(accountId);
        return null;
    }
    return entry.events;
}

export function setCachedEvents(
    accountId: string,
    events: CalendarEvent[],
): void {
    cache.set(accountId, { events, expiresAt: Date.now() + TTL_MS });
}
