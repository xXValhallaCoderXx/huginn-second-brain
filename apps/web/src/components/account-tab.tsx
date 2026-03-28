import React from "react";
import { signOut } from "../lib/auth-client";

export function AccountTab({
    account,
}: {
    account: { id: string; email: string; displayName?: string };
}) {
    const [signingOut, setSigningOut] = React.useState(false);

    const handleSignOut = async () => {
        setSigningOut(true);
        await signOut();
        window.location.assign("/");
    };

    return (
        <div>
            <p className="mb-6 text-sm text-text-muted">
                Manage your account information and authentication.
            </p>

            {/* Profile Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 mb-6">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent-light">
                        {(account.displayName ?? account.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-text-heading">
                            {account.displayName ?? "—"}
                        </h3>
                        <p className="text-sm text-text-muted">{account.email}</p>
                        <p className="text-xs text-text-subtle mt-1">Google OAuth</p>
                    </div>
                </div>

                {/* Instance ID */}
                <div>
                    <label className="block text-sm font-medium text-text-body mb-2">
                        Instance ID
                    </label>
                    <CopyableInstanceId value={account.id} />
                    <p className="mt-2 text-xs text-text-subtle">
                        Your unique instance identifier
                    </p>
                </div>
            </div>

            {/* Sign Out Card */}
            <div className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="text-sm font-medium text-text-heading mb-1">Sign Out</h3>
                        <p className="text-xs text-text-muted">
                            Sign out of Huginn on this device
                        </p>
                    </div>
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-body transition-colors hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
                    >
                        <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                        </svg>
                        {signingOut ? "Signing out…" : "Sign Out"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CopyableInstanceId({ value }: { value: string }) {
    const [copied, setCopied] = React.useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                value={value}
                readOnly
                className="flex-1 rounded-xl border border-border bg-page py-2.5 px-4 text-sm font-mono text-text-body outline-none"
            />
            <button
                onClick={copy}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-white/5 flex items-center gap-2"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {copied ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    )}
                </svg>
                {copied ? "Copied" : "Copy"}
            </button>
        </div>
    );
}
