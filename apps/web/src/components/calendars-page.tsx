import React from "react";
import { useRouter } from "@tanstack/react-router";
import type { CalendarConnectionInfo } from "@huginn/shared";
import {
    initiateCalendarOAuth,
    toggleCalendarConnection,
    updateCalendarDisplayName,
    deleteCalendarConnection,
} from "../lib/server-fns";

export function CalendarsPage({
    connections,
    connected,
}: {
    connections: CalendarConnectionInfo[];
    connected?: boolean;
}) {
    const router = useRouter();
    const [connecting, setConnecting] = React.useState(false);

    const handleConnectGoogle = async () => {
        setConnecting(true);
        try {
            const { url } = await initiateCalendarOAuth();
            window.location.href = url;
        } catch {
            setConnecting(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
            {/* Header */}
            <div className="mb-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
                    <svg className="h-6 w-6 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-text-heading">Connected Calendars</h1>
                    <p className="text-sm text-text-muted">
                        Connect your calendars so Huginn knows your schedule
                    </p>
                </div>
            </div>

            {/* Success toast */}
            {connected && (
                <div className="mb-6 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success-light">
                    Google Calendar connected successfully!
                </div>
            )}

            {/* Connection list */}
            <div className="space-y-4">
                {connections.map((conn) => (
                    <CalendarConnectionCard
                        key={conn.id}
                        connection={conn}
                        onUpdate={() => router.invalidate()}
                    />
                ))}

                {connections.length === 0 && (
                    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                            <svg className="h-7 w-7 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                            </svg>
                        </div>
                        <p className="text-sm text-text-muted mb-1">No calendars connected yet</p>
                        <p className="text-xs text-text-subtle">Connect a calendar to let Huginn know your schedule</p>
                    </div>
                )}
            </div>

            {/* Add connection */}
            <div className="mt-8 space-y-3">
                <h2 className="text-sm font-semibold text-text-heading">Add a calendar</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    {/* Google Calendar */}
                    <button
                        onClick={handleConnectGoogle}
                        disabled={connecting}
                        className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
                    >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4285F4]/10">
                            <svg className="h-5 w-5 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-text-heading">
                                {connecting ? "Redirecting…" : "Google Calendar"}
                            </p>
                            <p className="text-xs text-text-muted">Read-only access to your events</p>
                        </div>
                    </button>

                    {/* Outlook — coming soon */}
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 opacity-50">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0078D4]/10">
                            <svg className="h-5 w-5 text-[#0078D4]" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 0 1-.587.234h-8.88V6.576h8.88c.226 0 .42.08.582.237A.782.782 0 0 1 24 7.387zM13.616 2.27l-1.04.234V21.5l1.04.23 10.083-2.257V4.527L13.616 2.27zM7.997 10.043c-.66 0-1.22.39-1.528.936.308.546.867.936 1.528.936.66 0 1.22-.39 1.528-.936-.308-.546-.867-.936-1.528-.936z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-text-heading">Outlook Calendar</p>
                            <p className="text-xs text-text-muted">Coming soon</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function CalendarConnectionCard({
    connection,
    onUpdate,
}: {
    connection: CalendarConnectionInfo;
    onUpdate: () => void;
}) {
    const [toggling, setToggling] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [editingName, setEditingName] = React.useState(false);
    const [nameInput, setNameInput] = React.useState(connection.displayName ?? "");

    const handleToggle = async () => {
        setToggling(true);
        try {
            await toggleCalendarConnection({
                data: { connectionId: connection.id, enabled: !connection.enabled },
            });
            onUpdate();
        } finally {
            setToggling(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Remove this calendar connection? You'll need to reconnect to use it again.")) return;
        setDeleting(true);
        try {
            await deleteCalendarConnection({ data: { connectionId: connection.id } });
            onUpdate();
        } finally {
            setDeleting(false);
        }
    };

    const handleSaveName = async () => {
        if (nameInput.trim()) {
            await updateCalendarDisplayName({
                data: { connectionId: connection.id, displayName: nameInput.trim() },
            });
            onUpdate();
        }
        setEditingName(false);
    };

    return (
        <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-start gap-4">
                {/* Provider icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4285F4]/10">
                    <svg className="h-5 w-5 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                </div>

                {/* Connection details */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {editingName ? (
                            <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                onBlur={handleSaveName}
                                onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                                className="rounded border border-border bg-page px-2 py-0.5 text-sm text-text-heading focus:border-accent focus:outline-none"
                                autoFocus
                            />
                        ) : (
                            <button
                                onClick={() => setEditingName(true)}
                                className="text-sm font-medium text-text-heading hover:text-accent-light transition-colors"
                                title="Click to rename"
                            >
                                {connection.displayName || "Google Calendar"}
                            </button>
                        )}
                        {connection.enabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-light">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                                Active
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-text-subtle">
                                Paused
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{connection.providerEmail}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleToggle}
                        disabled={toggling}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                            connection.enabled
                                ? "border-border text-text-muted hover:bg-white/5"
                                : "border-accent/30 text-accent-lighter hover:bg-accent/10"
                        }`}
                    >
                        {toggling ? "…" : connection.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded-lg border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                    >
                        {deleting ? "…" : "Remove"}
                    </button>
                </div>
            </div>
        </div>
    );
}
