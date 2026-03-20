import { createFileRoute, redirect } from "@tanstack/react-router";
import { signIn } from "../lib/auth-client";
import { getSession } from "../lib/session";
import { useState } from "react";

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
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [remember, setRemember] = useState(false);

    return (
        <div className="flex min-h-screen bg-page">
            {/* Left panel — hero/branding */}
            <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-accent via-accent-light to-accent-lighter p-12">
                {/* Decorative blurs */}
                <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

                <div className="relative z-10 max-w-md text-center">
                    {/* Logo */}
                    <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white backdrop-blur-sm">
                        H
                    </div>
                    <h1 className="mb-4 text-4xl font-bold tracking-tight text-white">
                        Your personal AI, fully self-hosted.
                    </h1>
                    <p className="text-lg text-white/80">
                        One account. One personality. One memory. Any channel.
                    </p>
                </div>

                {/* Floating UI mockup */}
                <div className="relative z-10 mt-12 w-full max-w-sm">
                    <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-success-light" />
                            <span className="text-xs text-white/70">Online</span>
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 w-3/4 rounded bg-white/20" />
                            <div className="h-3 w-1/2 rounded bg-white/15" />
                            <div className="h-3 w-2/3 rounded bg-white/10" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Right panel — login form */}
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:w-1/2">
                {/* Mobile logo */}
                <div className="mb-8 flex items-center gap-2 lg:hidden">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
                        H
                    </div>
                    <span className="text-xl font-semibold text-text-heading">Huginn</span>
                </div>

                <div className="w-full max-w-sm">
                    <h2 className="mb-2 text-2xl font-bold text-text-heading">
                        Welcome back
                    </h2>
                    <p className="mb-8 text-sm text-text-muted">
                        Sign in to access your personal AI dashboard
                    </p>

                    {/* Google OAuth */}
                    <button
                        onClick={() =>
                            signIn.social({
                                provider: "google",
                                callbackURL: "/dashboard",
                            })
                        }
                        className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-text-heading transition-colors hover:bg-white/5"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 24 24">
                            <path
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                fill="#EA4335"
                            />
                        </svg>
                        Continue with Google
                    </button>

                    {/* Divider */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-page px-3 text-xs text-text-subtle">
                                OR
                            </span>
                        </div>
                    </div>

                    {/* Cosmetic email/password form */}
                    <form
                        onSubmit={(e) => e.preventDefault()}
                        className="space-y-4"
                    >
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-text-body">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-heading placeholder:text-text-subtle outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-text-body">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-heading placeholder:text-text-subtle outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm text-text-muted">
                                <input
                                    type="checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                    className="h-4 w-4 rounded border-border bg-surface accent-accent"
                                />
                                Remember me
                            </label>
                            <button
                                type="button"
                                className="text-sm text-accent hover:text-accent-light transition-colors"
                            >
                                Forgot password?
                            </button>
                        </div>

                        <button
                            type="submit"
                            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-light"
                        >
                            Sign In
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-8 flex items-center justify-center gap-4 text-xs text-text-subtle">
                        <span className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-success" />
                            Self-hosted instance
                        </span>
                        <span>•</span>
                        <span>End-to-end private</span>
                        <span>•</span>
                        <span>v0.1.0</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
