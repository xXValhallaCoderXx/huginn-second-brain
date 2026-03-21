export type CalendarProviderType = "google" | "outlook" | "caldav";

/** A calendar connection row with tokens decrypted. */
export interface CalendarConnection {
    id: string;
    accountId: string;
    provider: CalendarProviderType;
    providerEmail: string;
    displayName: string | null;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    scopes: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/** A connection as returned to the UI — tokens stripped. */
export interface CalendarConnectionInfo {
    id: string;
    accountId: string;
    provider: CalendarProviderType;
    providerEmail: string;
    displayName: string | null;
    enabled: boolean;
    createdAt: Date;
}

/** Unified calendar event shape — provider-agnostic. */
export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    isAllDay: boolean;
    source: {
        provider: CalendarProviderType;
        connectionLabel: string; // display_name or providerEmail
    };
}

/** Plugin interface — one implementation per calendar provider. */
export interface CalendarProvider {
    readonly provider: CalendarProviderType;
    getEvents(
        connection: CalendarConnection,
        range: { start: Date; end: Date },
    ): Promise<CalendarEvent[]>;
    refreshTokens(
        connection: CalendarConnection,
    ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }>;
}

/** Aggregation service the agent layer calls. */
export interface CalendarService {
    getEvents(
        accountId: string,
        range: { start: Date; end: Date },
    ): Promise<CalendarEvent[]>;
    formatForContext(events: CalendarEvent[]): string;
}

/** CRUD service for the calendar_connections table. */
export interface CalendarConnectionService {
    getConnections(accountId: string): Promise<CalendarConnection[]>;
    getEnabledConnections(accountId: string): Promise<CalendarConnection[]>;
    getConnectionInfo(accountId: string): Promise<CalendarConnectionInfo[]>;
    createConnection(data: {
        accountId: string;
        provider: CalendarProviderType;
        providerEmail: string;
        displayName?: string;
        accessToken: string;
        refreshToken: string;
        tokenExpiresAt: Date;
        scopes: string;
    }): Promise<CalendarConnection>;
    updateTokens(
        id: string,
        accessToken: string,
        refreshToken: string,
        expiresAt: Date,
    ): Promise<void>;
    toggleEnabled(id: string, enabled: boolean): Promise<void>;
    updateDisplayName(id: string, displayName: string): Promise<void>;
    deleteConnection(id: string): Promise<void>;
}
