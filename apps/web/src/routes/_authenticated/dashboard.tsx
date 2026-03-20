import { createFileRoute } from "@tanstack/react-router";
import { loadPersonalityFiles } from "../../lib/server-fns";
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

            <section style={{ marginBottom: "2rem" }}>
                <h2>SOUL.md</h2>
                <pre
                    style={{
                        background: "#f5f5f5",
                        padding: "1rem",
                        borderRadius: "4px",
                        whiteSpace: "pre-wrap",
                        overflow: "auto",
                    }}
                >
                    {personality.soul ?? "Not set"}
                </pre>
            </section>

            <section style={{ marginBottom: "2rem" }}>
                <h2>IDENTITY.md</h2>
                <pre
                    style={{
                        background: "#f5f5f5",
                        padding: "1rem",
                        borderRadius: "4px",
                        whiteSpace: "pre-wrap",
                        overflow: "auto",
                    }}
                >
                    {personality.identity ?? "Not set"}
                </pre>
            </section>
        </div>
    );
}
