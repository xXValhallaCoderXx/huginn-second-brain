import { createFileRoute, redirect } from "@tanstack/react-router";
import { signIn } from "../lib/auth-client";
import { getSession } from "../lib/session";

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        const session = await getSession();
        if (session) {
            throw redirect({ to: "/dashboard" });
        }
    },
    component: Home,
});

function Home() {
    return (
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "500px", margin: "4rem auto", textAlign: "center" }}>
            <h1>Huginn</h1>
            <p style={{ marginBottom: "2rem" }}>Your personal AI assistant.</p>
            <button
                onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })}
                style={{
                    padding: "0.75rem 1.5rem",
                    fontSize: "1rem",
                    cursor: "pointer",
                    background: "#4285F4",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                }}
            >
                Sign in with Google
            </button>
        </div>
    );
}
