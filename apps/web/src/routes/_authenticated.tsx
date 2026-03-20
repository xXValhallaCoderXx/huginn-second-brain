import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthenticatedAccount } from "../lib/server-fns";

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
    return <Outlet />;
}
