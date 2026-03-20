import React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { savePersonalityFile } from "../lib/server-fns";

type FileType = "IDENTITY" | "SOUL";

interface LoadedPersonality {
    soul: string | null;
    identity: string | null;
}

function getFile(personality: LoadedPersonality, tab: FileType): string | null {
    return tab === "SOUL" ? personality.soul : personality.identity;
}

export function EditIdentityPage({
    personality,
    accountId,
}: {
    personality: LoadedPersonality;
    accountId: string;
}) {
    const router = useRouter();
    const [activeTab, setActiveTab] = React.useState<FileType>("IDENTITY");
    const [content, setContent] = React.useState(
        getFile(personality, "IDENTITY") ?? ""
    );
    const [reason, setReason] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);

    const currentFile = getFile(personality, activeTab);

    const switchTab = (tab: FileType) => {
        if (dirty && !confirm("Discard unsaved changes?")) return;
        setActiveTab(tab);
        setContent(getFile(personality, tab) ?? "");
        setReason("");
        setDirty(false);
    };

    const handleSave = async () => {
        if (!content.trim() || saving) return;
        setSaving(true);
        try {
            await savePersonalityFile({
                data: {
                    accountId,
                    fileType: activeTab,
                    content: content.trim(),
                    reason: reason.trim() || `Updated ${activeTab}`,
                },
            });
            setDirty(false);
            setReason("");
            router.invalidate();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        to="/dashboard"
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text-body"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                        </svg>
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold text-text-heading">
                            Edit Personality
                        </h1>
                        <p className="text-sm text-text-muted">
                            Modify your AI&apos;s SOUL and IDENTITY files
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link
                        to="/dashboard"
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-body transition-colors hover:bg-white/5"
                    >
                        Discard
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </div>

            {/* Tab switcher */}
            <div className="mb-6 inline-flex rounded-lg border border-border bg-surface p-1">
                {(["IDENTITY", "SOUL"] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => switchTab(tab)}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === tab
                                ? "bg-accent text-white"
                                : "text-text-muted hover:text-text-body"
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Two-column editor */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Current (read-only) */}
                <div className="rounded-2xl border border-border bg-surface p-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-heading">
                        Current {activeTab}
                    </h3>
                    <pre className="max-h-[60vh] overflow-auto rounded-lg bg-page p-4 text-sm leading-relaxed text-text-body font-mono whitespace-pre-wrap">
                        {currentFile ?? "No content yet"}
                    </pre>
                </div>

                {/* Editor */}
                <div className="rounded-2xl border border-border bg-surface p-5">
                    <h3 className="mb-3 text-sm font-semibold text-text-heading">
                        Edit {activeTab}
                    </h3>
                    <textarea
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            setDirty(true);
                        }}
                        className="h-[50vh] w-full resize-none rounded-lg border border-border bg-page p-4 text-sm leading-relaxed text-text-heading font-mono placeholder:text-text-subtle outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                        placeholder={`Enter ${activeTab} content…`}
                    />
                    <div className="mt-3">
                        <label className="mb-1 block text-xs font-medium text-text-muted">
                            Change reason (optional)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Describe what changed…"
                            className="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-text-heading placeholder:text-text-subtle outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
