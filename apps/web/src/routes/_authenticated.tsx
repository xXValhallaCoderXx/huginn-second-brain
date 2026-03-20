import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthenticatedAccount } from "../lib/server-fns";
import { NavBar } from "../components/nav-bar";

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async () => {
        const account = await getAuthenticatedAccount();

        if (!account) {
            throw redirect({ to: "/" });
        }

        return { account };
    },
    component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
    return (
        <div className="flex min-h-screen flex-col bg-page">
            <NavBar />
            <main className="flex-1 pb-16 md:pb-0">
                <Outlet />
            </main>
        </div>
    );
}
