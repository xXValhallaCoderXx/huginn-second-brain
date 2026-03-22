import { Link, useMatches } from "@tanstack/react-router";

const navLinks = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/chat", label: "Chat" },
    { to: "/channels", label: "Connected Channels" },
    { to: "/calendars", label: "Calendars" },
    { to: "/settings", label: "Settings" },
] as const;

export function NavBar() {
    const matches = useMatches();
    const currentPath = matches[matches.length - 1]?.fullPath ?? "";

    return (
        <nav className="border-b border-border bg-surface">
            <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
                {/* Logo */}
                <Link to="/dashboard" className="mr-8 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
                        H
                    </div>
                    <span className="text-lg font-semibold text-text-heading">
                        Huginn
                    </span>
                </Link>

                {/* Desktop nav links */}
                <div className="hidden md:flex items-center gap-1">
                    {navLinks.map((link) => {
                        const isActive =
                            currentPath === link.to ||
                            currentPath.startsWith(link.to + "/");
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`relative px-3 py-4 text-sm font-medium transition-colors ${isActive
                                        ? "text-text-heading"
                                        : "text-text-muted hover:text-text-body"
                                    }`}
                            >
                                {link.label}
                                {isActive && (
                                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
                                )}
                            </Link>
                        );
                    })}
                </div>

                <div className="flex-1" />

                {/* Settings gear (desktop) */}
                <Link
                    to="/settings"
                    className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:text-text-body hover:bg-white/5 transition-colors"
                    aria-label="Settings"
                >
                    <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.214 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                        />
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                        />
                    </svg>
                </Link>

                {/* Mobile hamburger */}
                <MobileMenu currentPath={currentPath} />
            </div>
        </nav>
    );
}

function MobileMenu({ currentPath }: { currentPath: string }) {
    return (
        <div className="md:hidden">
            {/* Bottom nav for mobile */}
            <div className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-surface md:hidden">
                {navLinks.map((link) => {
                    const isActive =
                        currentPath === link.to ||
                        currentPath.startsWith(link.to + "/");
                    return (
                        <Link
                            key={link.to}
                            to={link.to}
                            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${isActive
                                    ? "text-accent"
                                    : "text-text-muted"
                                }`}
                        >
                            <NavIcon name={link.label} />
                            <span className="truncate">{link.label.split(" ")[0]}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

function NavIcon({ name }: { name: string }) {
    const className = "h-5 w-5";
    switch (name) {
        case "Dashboard":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
            );
        case "Chat":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
            );
        case "Connected Channels":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.875a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 9.69" />
                </svg>
            );
        case "Settings":
            return (
                <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.214 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
            );
        default:
            return null;
    }
}
