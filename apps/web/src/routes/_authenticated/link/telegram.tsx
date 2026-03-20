import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { generateLinkingCode, checkTelegramLinked } from "../../../lib/server-fns";

export const Route = createFileRoute("/_authenticated/link/telegram")({
    component: LinkTelegram,
});

function LinkTelegram() {
    const { account } = Route.useRouteContext();
    const [code, setCode] = React.useState<string | null>(null);
    const [deepLink, setDeepLink] = React.useState<string | null>(null);
    const [linked, setLinked] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Generate code on mount
    React.useEffect(() => {
        generateLinkingCode()
            .then((res) => {
                setCode(res.code);
                setDeepLink(res.deepLink);
            })
            .catch(() => setError("Failed to generate linking code."));
    }, [account.id]);

    // Poll for link completion
    React.useEffect(() => {
        if (!code || linked) return;
        const interval = setInterval(async () => {
            try {
                const res = await checkTelegramLinked();
                if (res.linked) setLinked(true);
            } catch {
                // ignore polling errors
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [code, linked, account.id]);

    if (linked) {
        return (
            <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px", margin: "0 auto", textAlign: "center" }}>
                <h1>✅ Telegram Linked!</h1>
                <p>Your Telegram account is now connected to Huginn.</p>
                <p>Send a message to your bot to start chatting!</p>
                <Link
                    to="/dashboard"
                    style={{
                        display: "inline-block",
                        marginTop: "1rem",
                        padding: "0.5rem 1rem",
                        background: "#2563eb",
                        color: "white",
                        borderRadius: "4px",
                        textDecoration: "none",
                    }}
                >
                    Back to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "600px", margin: "0 auto" }}>
            <h1>Connect Telegram</h1>
            {error && <p style={{ color: "red" }}>{error}</p>}
            {!code && !error && <p>Generating linking code...</p>}
            {code && (
                <>
                    {deepLink ? (
                        <>
                            <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
                                <a
                                    href={deepLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: "inline-block",
                                        padding: "0.75rem 2rem",
                                        background: "#0088cc",
                                        color: "white",
                                        borderRadius: "8px",
                                        textDecoration: "none",
                                        fontSize: "1.1rem",
                                        fontWeight: "bold",
                                    }}
                                >
                                    Open in Telegram →
                                </a>
                            </div>
                            <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
                                <p style={{ color: "#666", marginBottom: "0.75rem" }}>Or scan with your phone:</p>
                                <div style={{ display: "inline-block", padding: "1rem", background: "white", borderRadius: "8px", border: "1px solid #e5e5e5" }}>
                                    <QRCodeSVG value={deepLink} size={200} />
                                </div>
                            </div>
                            <p style={{ textAlign: "center", color: "#888", fontSize: "0.85rem" }}>
                                Click "Start" in Telegram to complete the link.
                            </p>
                        </>
                    ) : (
                        <>
                            <div style={{ background: "#f5f5f5", padding: "1.5rem", borderRadius: "8px", textAlign: "center", margin: "1.5rem 0" }}>
                                <p style={{ margin: "0 0 0.5rem", color: "#666" }}>Your linking code:</p>
                                <code style={{ fontSize: "2rem", fontWeight: "bold", letterSpacing: "0.1em" }}>{code}</code>
                            </div>
                            <p>Open Telegram, find the Huginn bot, and send:</p>
                            <pre style={{ background: "#f5f5f5", padding: "0.75rem", borderRadius: "4px" }}>/link {code}</pre>
                        </>
                    )}
                    <p style={{ color: "#888", fontSize: "0.9rem", textAlign: "center", marginTop: "1rem" }}>
                        This code expires in 10 minutes. Waiting for confirmation...
                    </p>
                </>
            )}
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <Link to="/dashboard" style={{ color: "#2563eb", textDecoration: "none" }}>
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    );
}
