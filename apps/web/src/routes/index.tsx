import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: Home,
});

function Home() {
    return (
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
            <h1>Huginn</h1>
            <p>Your personal AI assistant. Coming soon.</p>
        </div>
    );
}
