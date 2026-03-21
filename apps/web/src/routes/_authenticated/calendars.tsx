import { createFileRoute } from "@tanstack/react-router";
import { getCalendarConnections } from "../../lib/server-fns";
import { CalendarsPage } from "../../components/calendars-page";

export const Route = createFileRoute("/_authenticated/calendars")({
    validateSearch: (search: Record<string, unknown>) => ({
        connected: search.connected === "true" || search.connected === true,
    }),
    loader: async () => {
        const connections = await getCalendarConnections();
        return { connections };
    },
    component: RouteComponent,
});

function RouteComponent() {
    const { connections } = Route.useLoaderData();
    const { connected } = Route.useSearch();
    return <CalendarsPage connections={connections} connected={connected} />;
}
