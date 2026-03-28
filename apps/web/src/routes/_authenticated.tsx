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
        <div className="flex min-h-screen flex-col bg-page relative">
            {/* Atmospheric gradient orbs */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-accent/[0.07] blur-[100px]" />
                <div className="absolute -bottom-[10%] -right-[10%] h-[50%] w-[50%] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
            </div>
            <NavBar />
            <main className="relative z-10 flex-1 pb-16 md:pb-0">
                <Outlet />
            </main>
        </div>
    );
}
