import {
    Outlet,
    HeadContent,
    Scripts,
    createRootRoute,
} from "@tanstack/react-router";

export const Route = createRootRoute({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { title: "Huginn" },
        ],
    }),
    component: RootComponent,
    shellComponent: RootDocument,
});

function RootComponent() {
    return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    );
}
