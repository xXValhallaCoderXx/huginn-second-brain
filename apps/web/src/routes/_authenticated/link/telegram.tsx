import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { generateLinkingCode, checkTelegramLinked } from "../../../lib/server-fns";

export const Route = createFileRoute("/_authenticated/link/telegram")({
    component: LinkTelegram,
});

type Step = 1 | 2 | 3;

function LinkTelegram() {
    const { account } = Route.useRouteContext();
    const [step, setStep] = React.useState<Step>(1);
    const [code, setCode] = React.useState<string | null>(null);
    const [deepLink, setDeepLink] = React.useState<string | null>(null);
    const [botUsername, setBotUsername] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    // Generate code on mount
    React.useEffect(() => {
        generateLinkingCode()
            .then((res) => {
                setCode(res.code);
                setDeepLink(res.deepLink);
                setBotUsername(res.botUsername ?? null);
            })
            .catch(() => setError("Failed to generate linking code."));
    }, [account.id]);

    // Poll for link completion (active during steps 1 & 2)
    React.useEffect(() => {
        if (!code || step === 3) return;
        const interval = setInterval(async () => {
            try {
                const res = await checkTelegramLinked();
                if (res.linked) setStep(3);
            } catch {
                // ignore polling errors
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [code, step, account.id]);

    return (
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {/* Header */}
            <div className="mb-6">
                <Link
                    to="/channels"
                    className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-body transition-colors"
                >
                    ← Back to Connected Channels
                </Link>
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-semibold text-text-heading">
                        Link Telegram
                    </h1>
                    <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent-lighter">
                        Step {step} of 3
                    </span>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${step === 3 ? "bg-success" : "bg-accent"
                        }`}
                    style={{ width: `${(step / 3) * 100}%` }}
                />
            </div>

            {error && (
                <div className="mb-6 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
                    {error}
                </div>
            )}

            {step === 1 && (
                <StepOne
                    code={code}
                    deepLink={deepLink}
                    onNext={() => setStep(2)}
                />
            )}
            {step === 2 && <StepTwo botUsername={botUsername} />}
            {step === 3 && <StepThree />}

            {/* Footer */}
            <div className="mt-12 border-t border-border pt-6 text-center text-xs text-text-subtle">
                <p>Huginn Personal AI</p>
                <div className="mt-2 flex justify-center gap-4">
                    <span>Documentation</span>
                    <span>Privacy</span>
                    <span>Terms</span>
                </div>
            </div>
        </div>
    );
}

function StepOne({
    code,
    deepLink,
    onNext,
}: {
    code: string | null;
    deepLink: string | null;
    onNext: () => void;
}) {
    if (!code) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-3 text-sm text-text-muted">
                    <svg
                        className="h-5 w-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                    </svg>
                    Generating linking code…
                </div>
            </div>
        );
    }

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Left — instructions timeline */}
            <div className="rounded-xl border border-border bg-surface p-6">
                <h3 className="mb-6 text-sm font-semibold text-text-heading">
                    How to connect
                </h3>
                <div className="space-y-6">
                    <TimelineStep
                        number={1}
                        title="Open the Bot"
                        description="Click the button below or scan the QR code to open the Huginn bot in Telegram."
                        active
                    />
                    <TimelineStep
                        number={2}
                        title="Start Conversation"
                        description='Press "Start" in Telegram to begin the linking process.'
                    />
                    <TimelineStep
                        number={3}
                        title="Confirm Link"
                        description="The bot will confirm your account is linked. You're all set!"
                    />
                </div>

                {deepLink && (
                    <a
                        href={deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onNext}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-light"
                    >
                        <svg
                            className="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                        </svg>
                        Open in Telegram
                    </a>
                )}

                {!deepLink && code && (
                    <div className="mt-6 rounded-lg bg-page p-4 text-center">
                        <p className="mb-2 text-xs text-text-muted">
                            Send this to the Huginn bot:
                        </p>
                        <code className="font-mono text-lg font-bold text-text-heading tracking-wider">
                            /link {code}
                        </code>
                    </div>
                )}
            </div>

            {/* Right — QR code */}
            <div className="rounded-xl border border-border bg-surface p-6">
                <h3 className="mb-6 text-sm font-semibold text-text-heading">
                    Or scan with phone camera
                </h3>
                {deepLink ? (
                    <div className="flex flex-col items-center">
                        <div className="rounded-xl bg-white p-4">
                            <QRCodeSVG value={deepLink} size={200} />
                        </div>
                        <p className="mt-4 text-center text-xs text-text-muted">
                            Scan this QR code with your phone camera to open
                            Telegram
                        </p>
                    </div>
                ) : (
                    <p className="text-center text-sm text-text-muted py-12">
                        QR code unavailable — bot may be offline
                    </p>
                )}

                <div className="mt-6 rounded-lg bg-page p-3 text-center text-xs text-text-subtle">
                    This code expires in 10 minutes
                </div>
            </div>
        </div>
    );
}

function StepTwo({ botUsername }: { botUsername: string | null }) {
    return (
        <div className="mx-auto max-w-md text-center">
            <div className="rounded-xl border border-border bg-surface p-8">
                {/* Pulsing indicator */}
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-accent/50" />
                </div>

                <h2 className="mb-2 text-lg font-semibold text-text-heading">
                    Waiting for confirmation
                </h2>
                <p className="mb-6 text-sm text-text-muted">
                    Open the bot in Telegram and press "Start" to complete the
                    link.
                    {botUsername && (
                        <span className="mt-1 block font-mono text-xs text-accent-lighter">
                            @{botUsername}
                        </span>
                    )}
                </p>

                {/* Animated dots */}
                <div className="flex justify-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
                </div>

                <p className="mt-6 text-xs text-text-subtle">
                    This page will update automatically when linked
                </p>
            </div>
        </div>
    );
}

function StepThree() {
    return (
        <div className="space-y-6">
            {/* Success banner */}
            <div className="rounded-xl border border-success/30 bg-success/5 p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/20">
                        <svg
                            className="h-5 w-5 text-success-light"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m4.5 12.75 6 6 9-13.5"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-success-light">
                            Connection Successful!
                        </h3>
                        <p className="mt-1 text-sm text-text-body">
                            Your Telegram account is now linked to Huginn. You
                            can start chatting with your AI assistant directly in
                            Telegram.
                        </p>
                    </div>
                </div>
            </div>

            {/* Confirmation card */}
            <div className="mx-auto max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <svg
                        className="h-8 w-8 text-success"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m4.5 12.75 6 6 9-13.5"
                        />
                    </svg>
                </div>
                <h3 className="mb-1 text-lg font-semibold text-text-heading">
                    Telegram Connected
                </h3>
                <p className="text-sm text-text-muted">
                    Your accounts are now linked
                </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Link
                    to="/chat"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-light"
                >
                    Go to Chat →
                </Link>
                <Link
                    to="/channels"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-medium text-text-body transition-colors hover:bg-white/5"
                >
                    Back to Connected Channels
                </Link>
            </div>
        </div>
    );
}

function TimelineStep({
    number,
    title,
    description,
    active,
}: {
    number: number;
    title: string;
    description: string;
    active?: boolean;
}) {
    return (
        <div className="flex gap-4">
            <div className="flex flex-col items-center">
                <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active
                            ? "bg-accent text-white"
                            : "border border-border text-text-muted"
                        }`}
                >
                    {number}
                </div>
                {number < 3 && (
                    <div className="mt-2 h-full w-px bg-border" />
                )}
            </div>
            <div className="pb-2">
                <h4 className="text-sm font-medium text-text-heading">
                    {title}
                </h4>
                <p className="mt-0.5 text-xs text-text-muted">{description}</p>
            </div>
        </div>
    );
}
