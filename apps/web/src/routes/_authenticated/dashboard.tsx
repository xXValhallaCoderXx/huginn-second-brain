import React from "react";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { loadPersonalityFiles, getChannelLinks, unlinkTelegramChannel } from "../../lib/server-fns";
import { signOut } from "../../lib/auth-client";
import type { ChannelLink } from "@huginn/shared";

export const Route = createFileRoute("/_authenticated/dashboard")({
    loader: async ({ context }) => {
        const [personality, channels] = await Promise.all([
            loadPersonalityFiles({ data: { accountId: context.account.id } }),
            getChannelLinks(),
        ]);
        return { personality, channels };
    },
    component: Dashboard,
});

function Dashboard() {
    const { account } = Route.useRouteContext();
    const { personality, channels } = Route.useLoaderData();

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row">
                {/* ── Left Sidebar ── */}
                <aside className="w-full space-y-6 lg:w-80 lg:shrink-0">
                    {/* Account Details Card */}
                    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-heading">
                            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                            </svg>
                            Account Details
                        </h3>
                        <dl className="space-y-3 text-sm">
                            <div>
                                <dt className="text-text-muted">Email</dt>
                                <dd className="mt-0.5 text-text-emphasis">{account.email}</dd>
                            </div>
                            <div>
                                <dt className="text-text-muted">Display Name</dt>
                                <dd className="mt-0.5 text-text-emphasis">{account.displayName ?? "—"}</dd>
                            </div>
                            <div>
                                <dt className="text-text-muted">Instance ID</dt>
                                <dd className="mt-0.5">
                                    <CopyableId value={account.id} />
                                </dd>
                            </div>
                            <div>
                                <dt className="text-text-muted">Status</dt>
                                <dd className="mt-0.5 flex items-center gap-1.5 text-success-light">
                                    <span className="h-2 w-2 rounded-full bg-success" />
                                    Online
                                </dd>
                            </div>
                        </dl>
                    </div>

                    {/* Quick Actions Card */}
                    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
                        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-heading">
                            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                            </svg>
                            Quick Actions
                        </h3>
                        <div className="space-y-2">
                            <Link
                                to="/chat"
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-body transition-colors hover:bg-white/5"
                            >
                                <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                </svg>
                                Open Chat
                            </Link>
                            <Link
                                to="/channels"
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-body transition-colors hover:bg-white/5"
                            >
                                <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                Add Channel
                            </Link>
                            <button
                                onClick={() =>
                                    signOut().then(() => window.location.assign("/"))
                                }
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-error transition-colors hover:bg-white/5"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                                </svg>
                                Sign Out
                            </button>
                        </div>
                    </div>
                </aside>

                {/* ── Main Content ── */}
                <div className="flex-1 space-y-6">
                    {/* Personality Editor Card */}
                    <div className="rounded-xl border border-border bg-surface shadow-card">
                        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
                                    <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-text-heading">
                                        Personality Editor
                                    </h2>
                                    <p className="text-sm text-text-muted">
                                        Manage your AI's personality and behavior
                                    </p>
                                </div>
                            </div>
                            <Link
                                to="/edit-identity"
                                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-white/5 hover:text-text-body"
                            >
                                Edit
                            </Link>
                        </div>
                        <div className="p-5">
                            <div className="space-y-4">
                                <PersonalityViewBlock
                                    title="SOUL.md"
                                    content={personality.soul}
                                />
                                <PersonalityViewBlock
                                    title="IDENTITY.md"
                                    content={personality.identity}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Connected Channels */}
                    <div className="rounded-xl border border-border bg-surface shadow-card">
                        <div className="border-b border-border p-5">
                            <h2 className="text-base font-semibold text-text-heading">
                                Connected Channels
                            </h2>
                            <p className="text-sm text-text-muted">
                                Your active communication channels
                            </p>
                        </div>
                        <div className="divide-y divide-border">
                            <ChannelRow channels={channels} />
                            <WebChannelRow />
                            <DiscordChannelRow />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Sub-components ── */

function CopyableId({ value }: { value: string }) {
    const [copied, setCopied] = React.useState(false);
    const short = value.slice(0, 8) + "…";

    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 font-mono text-xs text-accent-lighter hover:text-accent-light transition-colors"
            title="Click to copy"
        >
            {short}
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {copied ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                )}
            </svg>
        </button>
    );
}

function PersonalityViewBlock({
    title,
    content,
}: {
    title: string;
    content: string | null;
}) {
    return (
        <div>
            <h4 className="mb-2 text-sm font-medium text-text-muted">{title}</h4>
            <pre className="overflow-auto rounded-lg bg-page p-4 font-mono text-xs leading-relaxed text-text-body">
                {content ?? "Not configured yet"}
            </pre>
        </div>
    );
}

function ChannelRow({ channels }: { channels: ChannelLink[] }) {
    const router = useRouter();
    const [unlinking, setUnlinking] = React.useState(false);
    const telegram = channels.find((c) => c.provider === "telegram");

    const handleUnlink = async () => {
        if (!confirm("Unlink Telegram? You'll need to re-link to use the bot."))
            return;
        setUnlinking(true);
        try {
            await unlinkTelegramChannel();
            await router.invalidate();
        } finally {
            setUnlinking(false);
        }
    };

    return (
        <div className="flex items-center gap-4 p-5">
            {/* Telegram icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-telegram/10">
                <svg className="h-5 w-5 text-telegram" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-heading">
                        Telegram Bot
                    </span>
                    {telegram ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-light">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Connected
                        </span>
                    ) : (
                        <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium text-text-subtle">
                            Not connected
                        </span>
                    )}
                </div>
                {telegram && (
                    <p className="text-xs text-text-muted mt-0.5">
                        User ID: {telegram.providerUserId}
                    </p>
                )}
            </div>
            <div>
                {telegram ? (
                    <button
                        onClick={handleUnlink}
                        disabled={unlinking}
                        className="rounded-lg border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                    >
                        {unlinking ? "Unlinking…" : "Unlink"}
                    </button>
                ) : (
                    <Link
                        to="/link/telegram"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-light"
                    >
                        Connect
                    </Link>
                )}
            </div>
        </div>
    );
}

function WebChannelRow() {
    return (
        <div className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <svg className="h-5 w-5 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-heading">
                        Web Dashboard
                    </span>
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-lighter">
                        Built-in
                    </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                    Chat directly via the web interface
                </p>
            </div>
            <Link
                to="/chat"
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-body transition-colors hover:bg-white/5"
            >
                Open Chat
            </Link>
        </div>
    );
}

function DiscordChannelRow() {
    return (
        <div className="flex items-center gap-4 p-5 opacity-60">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865F2]/10">
                <svg className="h-5 w-5 text-[#5865F2]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-heading">
                        Discord
                    </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                    Connect your Discord server
                </p>
            </div>
            <button
                disabled
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-subtle cursor-not-allowed"
            >
                Coming Soon
            </button>
        </div>
    );
}
