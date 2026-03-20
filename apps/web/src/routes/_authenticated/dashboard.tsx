import React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { loadPersonalityFiles, savePersonalityFile } from "../../lib/server-fns";
import { signOut } from "../../lib/auth-client";

export const Route = createFileRoute("/_authenticated/dashboard")({
    loader: async ({ context }) => {
        const personality = await loadPersonalityFiles({
            data: { accountId: context.account.id },
        });
        return { personality };
    },
    component: Dashboard,
});

function Dashboard() {
    const { account } = Route.useRouteContext();
    const { personality } = Route.useLoaderData();

    return (
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h1>Huginn Dashboard</h1>
                <button
                    onClick={() => signOut().then(() => window.location.assign("/"))}
                    style={{
                        padding: "0.5rem 1rem",
                        cursor: "pointer",
                        background: "none",
                        border: "1px solid #666",
                        borderRadius: "4px",
                    }}
                >
                    Sign out
                </button>
            </div>

            <section style={{ marginBottom: "2rem" }}>
                <h2>Account</h2>
                <dl style={{ lineHeight: 1.8 }}>
                    <dt style={{ fontWeight: "bold" }}>Email</dt>
                    <dd style={{ margin: "0 0 0.5rem 1rem" }}>{account.email}</dd>
                    <dt style={{ fontWeight: "bold" }}>Display Name</dt>
                    <dd style={{ margin: "0 0 0.5rem 1rem" }}>{account.displayName ?? "—"}</dd>
                    <dt style={{ fontWeight: "bold" }}>Account ID</dt>
                    <dd style={{ margin: "0 0 0.5rem 1rem" }}>
                        <code>{account.id}</code>
                    </dd>
                </dl>
            </section>

            <section style={{ marginBottom: "2rem" }}>
                <h2>Connected Channels</h2>
                <p style={{ color: "#888" }}>No channels connected yet.</p>
            </section>

            <PersonalitySection title="SOUL.md" fileType="SOUL" content={personality.soul} accountId={account.id} />
            <PersonalitySection title="IDENTITY.md" fileType="IDENTITY" content={personality.identity} accountId={account.id} />
        </div>
    );
}

function PersonalitySection({
    title,
    fileType,
    content,
    accountId,
}: {
    title: string;
    fileType: "SOUL" | "IDENTITY";
    content: string | null;
    accountId: string;
}) {
    const router = useRouter();
    const [editing, setEditing] = React.useState(false);
    const [draft, setDraft] = React.useState(content ?? "");
    const [reason, setReason] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    const handleSave = async () => {
        if (!draft.trim() || !reason.trim()) return;
        setSaving(true);
        try {
            await savePersonalityFile({
                data: { accountId, fileType, content: draft, reason },
            });
            await router.invalidate();
            setEditing(false);
            setReason("");
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = () => {
        setDraft(content ?? "");
        setReason("");
        setEditing(true);
    };

    return (
        <section style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>{title}</h2>
                {!editing && (
                    <button onClick={handleEdit} style={{ padding: "0.25rem 0.75rem", cursor: "pointer", background: "none", border: "1px solid #666", borderRadius: "4px" }}>
                        Edit
                    </button>
                )}
            </div>
            {editing ? (
                <div>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        style={{ width: "100%", minHeight: "200px", fontFamily: "monospace", fontSize: "0.9rem", padding: "1rem", borderRadius: "4px", border: "1px solid #ccc", background: "#f9f9f9", resize: "vertical" }}
                    />
                    <div style={{ marginTop: "0.5rem" }}>
                        <label style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem", color: "#666" }}>
                            Reason for change:
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Updated communication style preferences"
                            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "0.9rem" }}
                        />
                    </div>
                    <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || !draft.trim() || !reason.trim()}
                            style={{ padding: "0.5rem 1rem", cursor: saving ? "wait" : "pointer", background: "#2563eb", color: "white", border: "none", borderRadius: "4px", opacity: saving || !draft.trim() || !reason.trim() ? 0.5 : 1 }}
                        >
                            {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                            onClick={() => setEditing(false)}
                            disabled={saving}
                            style={{ padding: "0.5rem 1rem", cursor: "pointer", background: "none", border: "1px solid #666", borderRadius: "4px" }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", whiteSpace: "pre-wrap", overflow: "auto" }}>
                    {content ?? "Not set"}
                </pre>
            )}
        </section>
    );
}
