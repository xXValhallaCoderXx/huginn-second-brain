import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getTodayCalendarEvents, loadPersonalityFiles, getNotes, getKnowledgeStats } from "../../lib/server-fns";

export interface SerializedCalendarEvent {
    id: string;
    title: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
    isAllDay: boolean;
    source: { provider: string; connectionLabel: string };
}

export const Route = createFileRoute("/_authenticated/dashboard")({
    component: Dashboard,
    loader: async ({ context }) => {
        const [personality, calendarEvents, recentNotes, knowledgeStats] = await Promise.all([
            loadPersonalityFiles({ data: { accountId: context.account.id } }),
            getTodayCalendarEvents().catch(() => [] as SerializedCalendarEvent[]),
            getNotes({ data: { limit: 5 } }).catch(() => []),
            getKnowledgeStats().catch(() => ({ noteCount: 0, linkCount: 0, tagCount: 0 })),
        ]);
        return { personality, calendarEvents, recentNotes, knowledgeStats };
    },
});

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/** Render text with URLs converted to clickable links, truncated to maxLen chars. */
function FormattedDescription({ text, maxLen = 120 }: { text: string; maxLen?: number }) {
    const truncated = text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
    const parts = truncated.split(URL_REGEX);
    return (
        <p className="text-sm text-text-secondary mt-1 break-words">
            {parts.map((part, i) =>
                URL_REGEX.test(part) ? (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-light hover:text-accent underline underline-offset-2"
                    >
                        {(() => { try { return new URL(part).hostname; } catch { return "Link"; } })()}
                    </a>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </p>
    );
}

function Dashboard() {
    const { account } = Route.useRouteContext();
    const { personality, calendarEvents, recentNotes, knowledgeStats } = Route.useLoaderData();
    const [accountOpen, setAccountOpen] = useState(false);

    const soulSnippet = personality.soul
        ? personality.soul.slice(0, 200) + (personality.soul.length > 200 ? "..." : "")
        : null;

    const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                {/* ── Left Column ── */}
                <aside className="lg:col-span-4 space-y-6">
                    {/* Greeting Card */}
                    <div className="bg-gradient-to-br from-accent/10 via-accent/5 to-transparent rounded-2xl border border-accent/20 p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-sm text-text-muted">{getGreeting()}</p>
                                <h2 className="text-2xl font-semibold text-text-heading mt-1">
                                    {account.displayName ?? "there"}
                                </h2>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center text-white shadow-lg shadow-accent/30">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                            <span className="text-text-secondary">Huginn is online</span>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                        <div className="p-5 border-b border-border">
                            <h3 className="text-base font-semibold text-text-heading">Quick Actions</h3>
                        </div>
                        <div className="p-5 space-y-3">
                            <Link
                                to="/chat"
                                className="w-full bg-accent hover:bg-accent/90 text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-sm shadow-accent/20 flex items-center justify-center gap-2"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                                Chat with Huginn
                            </Link>
                            <Link
                                to="/settings"
                                search={{ tab: "personality" }}
                                className="w-full bg-white/[0.04] hover:bg-white/[0.07] text-text-heading font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-border"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                </svg>
                                Edit Personality
                            </Link>
                            <Link
                                to="/settings"
                                search={{ tab: "channels" }}
                                className="w-full bg-white/[0.04] hover:bg-white/[0.07] text-text-heading font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-border"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.875a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 9.69" />
                                </svg>
                                Manage Channels
                            </Link>
                        </div>
                    </div>

                    {/* Personality Snapshot */}
                    {soulSnippet && (
                        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                            <div className="p-5 border-b border-border">
                                <h3 className="text-base font-semibold text-text-heading flex items-center gap-2">
                                    <svg className="h-4 w-4 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                    </svg>
                                    Personality Snapshot
                                </h3>
                            </div>
                            <div className="p-5">
                                <div className="bg-page rounded-xl p-4 border border-border">
                                    <p className="text-sm text-text-secondary leading-relaxed">{soulSnippet}</p>
                                </div>
                                <Link
                                    to="/settings"
                                    search={{ tab: "personality" }}
                                    className="mt-4 text-sm text-accent-light hover:text-accent font-medium flex items-center gap-1"
                                >
                                    View full personality file
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Account Details (Collapsible) */}
                    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                        <button
                            onClick={() => setAccountOpen((o) => !o)}
                            className="w-full p-4 flex justify-between items-center hover:bg-white/[0.02] transition-colors"
                        >
                            <h3 className="text-sm font-semibold text-text-heading">Account Details</h3>
                            <svg
                                className={`h-4 w-4 text-text-muted transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                        </button>
                        {accountOpen && (
                            <div className="px-4 pb-4 space-y-3">
                                <div>
                                    <p className="text-xs text-text-muted mb-1.5">Account ID</p>
                                    <div className="flex items-center justify-between bg-page p-2.5 rounded-lg border border-border">
                                        <span className="font-mono text-xs text-text-secondary truncate">{account.id}</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-text-muted mb-1.5">Email</p>
                                    <p className="text-sm text-text-secondary">{account.email}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── Right Column ── */}
                <div className="lg:col-span-8 space-y-6">
                    {/* Today's Agenda */}
                    <section className="rounded-2xl border border-border bg-surface overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-lg font-semibold text-text-heading flex items-center gap-2">
                                <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                                </svg>
                                Today&apos;s Agenda
                            </h2>
                            <p className="text-sm text-text-muted mt-1">{today}</p>
                        </div>
                        <div className="p-6">
                            {calendarEvents.length === 0 ? (
                                <div className="text-center py-8">
                                    <svg className="h-10 w-10 mx-auto text-text-muted/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                                    </svg>
                                    <p className="text-sm text-text-muted">No events scheduled for today</p>
                                    <Link
                                        to="/settings"
                                        search={{ tab: "calendars" }}
                                        className="mt-2 inline-block text-sm text-accent-light hover:text-accent font-medium"
                                    >
                                        Connect a calendar
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {calendarEvents.map((event, i) => (
                                        <div key={event.id} className="flex items-start gap-3 relative">
                                            {/* Timeline connector */}
                                            {i < calendarEvents.length - 1 && (
                                                <div
                                                    className="absolute left-4 top-10 bottom-[-0.75rem] w-0.5"
                                                    style={{ background: "linear-gradient(to bottom, var(--color-accent) 0%, rgba(67, 59, 255, 0.3) 100%)" }}
                                                />
                                            )}
                                            {/* Timeline dot */}
                                            <div className="relative z-10 w-8 h-8 rounded-full bg-white/[0.06] border border-border flex items-center justify-center text-text-muted flex-shrink-0">
                                                <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                            </div>
                                            {/* Event content */}
                                            <div className="flex-1 pb-1">
                                                <p className="text-xs text-text-muted mb-1">
                                                    {event.isAllDay
                                                        ? "All day"
                                                        : `${formatTime(event.start)} – ${formatTime(event.end)}`}
                                                </p>
                                                <h4 className="text-base font-semibold text-text-heading">{event.title}</h4>
                                                {event.description && (
                                                    <FormattedDescription text={event.description} />
                                                )}
                                                {event.location && (
                                                    <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                                                        </svg>
                                                        {event.location}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Saved Knowledge Preview */}
                    <section className="rounded-2xl border border-border bg-surface overflow-hidden">
                        <div className="p-6 border-b border-border">
                            <h2 className="text-lg font-semibold text-text-heading flex items-center gap-2">
                                <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                </svg>
                                Saved Knowledge
                            </h2>
                            <p className="text-xs text-text-muted mt-1">
                                {knowledgeStats.noteCount} notes · {knowledgeStats.linkCount} connections
                            </p>
                        </div>
                        <div className="p-6">
                            {recentNotes.length === 0 ? (
                                <div className="text-center py-6">
                                    <p className="text-sm text-text-muted">No notes yet</p>
                                    <p className="text-xs text-text-subtle mt-1">
                                        Chat with Huginn and it will start capturing knowledge.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {recentNotes.map((note) => (
                                        <div key={note.id} className="flex items-start gap-2.5">
                                            {note.capturedBy === "agent" ? (
                                                <svg className="h-3.5 w-3.5 text-accent-light mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                                </svg>
                                            ) : (
                                                <svg className="h-3.5 w-3.5 text-text-muted mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                                                </svg>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-text-heading truncate">{note.title}</p>
                                                <p className="text-xs text-text-muted line-clamp-1">{note.content}</p>
                                                {note.tags.length > 0 && (
                                                    <div className="flex gap-1 mt-1">
                                                        {note.tags.slice(0, 3).map((tag) => (
                                                            <span key={tag} className="text-[10px] text-text-subtle">#{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <Link
                                        to="/knowledge-base"
                                        className="mt-2 text-sm text-accent-light hover:text-accent font-medium flex items-center gap-1"
                                    >
                                        View all
                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                                        </svg>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
