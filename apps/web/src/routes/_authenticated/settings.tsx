import { createFileRoute } from "@tanstack/react-router";
import {
  loadPersonalityFiles,
  getChannelLinks,
  getCalendarConnections,
} from "../../lib/server-fns";
import { SettingsPage } from "../../components/settings-page";
import type { SettingsTab } from "../../components/settings-page";

const validTabs: SettingsTab[] = ["personality", "channels", "calendars", "account"];

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab: SettingsTab; connected?: boolean; error?: string } => ({
    tab: validTabs.includes(search.tab as SettingsTab)
      ? (search.tab as SettingsTab)
      : "personality",
    connected: search.connected === "true" ? true : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  loader: async ({ context }) => {
    const [personality, channels, calendars] = await Promise.all([
      loadPersonalityFiles({ data: { accountId: context.account.id } }),
      getChannelLinks(),
      getCalendarConnections(),
    ]);
    return { personality, channels, calendars };
  },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { account } = Route.useRouteContext();
  const { personality, channels, calendars } = Route.useLoaderData();
  const { tab, connected } = Route.useSearch();

  return (
      <SettingsPage
        personality={personality}
        channels={channels}
        calendars={calendars}
        accountId={account.id}
        account={account}
        activeTab={tab}
        connected={connected}
      />
    );
}
