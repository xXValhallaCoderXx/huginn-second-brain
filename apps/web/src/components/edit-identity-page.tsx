import React from "react";
import { useRouter } from "@tanstack/react-router";
import { savePersonalityFile } from "../lib/server-fns";

type FileType = "IDENTITY" | "SOUL";

interface LoadedPersonality {
    soul: string | null;
    identity: string | null;
}

export function EditIdentityPage({
    personality,
    accountId,
}: {
    personality: LoadedPersonality;
    accountId: string;
}) {
    return (
        <div>
            <p className="mb-6 text-sm text-text-muted">
                Define how Huginn thinks, speaks, and behaves through structured
                identity files.
            </p>

            <PersonalityEditorCard
                title="SOUL.md"
                description="Core personality traits, values, and behavioral patterns"
                fileType="SOUL"
                initialContent={personality.soul ?? ""}
                accountId={accountId}
                placeholder={"# Core Identity\n\nI am a thoughtful, empathetic AI assistant..."}
                minHeight="min-h-[240px]"
            />

            <PersonalityEditorCard
                title="IDENTITY.md"
                description="Contextual information, background, and domain expertise"
                fileType="IDENTITY"
                initialContent={personality.identity ?? ""}
                accountId={accountId}
                placeholder={"# Background\n\nI have expertise in..."}
                minHeight="min-h-[200px]"
            />
        </div>
    );
}

function PersonalityEditorCard({
    title,
    description,
    fileType,
    initialContent,
    accountId,
    placeholder,
    minHeight,
}: {
    title: string;
    description: string;
    fileType: FileType;
    initialContent: string;
    accountId: string;
    placeholder: string;
    minHeight: string;
}) {
    const router = useRouter();
    const [content, setContent] = React.useState(initialContent);
    const [reason, setReason] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    const dirty = content !== initialContent;

    const handleCancel = () => {
        setContent(initialContent);
        setReason("");
    };

    const handleSave = async () => {
        if (!content.trim() || saving || !dirty) return;
        setSaving(true);
        try {
            await savePersonalityFile({
                data: {
                    accountId,
                    fileType,
                    content: content.trim(),
                    reason: reason.trim() || `Updated ${fileType}`,
                },
            });
            setReason("");
            router.invalidate();
        } finally {
            setSaving(false);
        }
    };

    const lineCount = content.split("\n").length;

    return (
        <div className="mb-6 rounded-2xl border border-border bg-surface p-6">
            {/* Header */}
            <div className="mb-4">
                <h3 className="text-base font-semibold text-text-heading">
                    {title}
                </h3>
                <p className="mt-1 text-xs text-text-muted">{description}</p>
            </div>

            {/* Editor with line numbers */}
            <div className="overflow-hidden rounded-xl border border-border bg-page">
                <div className="flex">
                    {/* Line numbers */}
                    <div className="w-12 shrink-0 select-none border-r border-border bg-surface py-3 px-2 text-right font-mono text-xs leading-[1.5rem] text-text-subtle">
                        {Array.from({ length: Math.max(lineCount, 1) }, (_, i) => (
                            <div key={i}>{i + 1}</div>
                        ))}
                    </div>
                    {/* Textarea */}
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={placeholder}
                        className={`flex-1 resize-none bg-transparent p-3 font-mono text-sm leading-[1.5rem] text-text-heading placeholder:text-text-subtle outline-none ${minHeight}`}
                    />
                </div>
            </div>

            {/* Reason input — shown when dirty */}
            {dirty && (
                <div className="mt-4">
                    <label className="mb-2 block text-xs font-medium text-text-muted">
                        What did you change?
                    </label>
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={`e.g., Updated ${title.replace(".md", "").toLowerCase()} configuration`}
                        className="w-full rounded-lg border border-border bg-page px-3 py-2 text-sm text-text-heading placeholder:text-text-subtle outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                    />
                </div>
            )}

            {/* Action buttons */}
            <div className="mt-4 flex justify-end gap-2">
                {dirty && (
                    <button
                        onClick={handleCancel}
                        className="rounded-xl px-5 py-2.5 text-sm font-medium text-text-body bg-white/5 transition-colors hover:bg-white/10"
                    >
                        Cancel
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-colors ${dirty
                            ? "bg-accent text-white hover:bg-accent-light shadow-md shadow-accent/20"
                            : "cursor-not-allowed bg-white/5 text-text-subtle"
                        }`}
                >
                    {saving ? "Saving…" : "Save Changes"}
                </button>
            </div>
        </div>
    );
}
