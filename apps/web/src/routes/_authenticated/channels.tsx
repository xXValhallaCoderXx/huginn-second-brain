import { createFileRoute } from '@tanstack/react-router'
import { getChannelLinks } from '../../lib/server-fns'
import { ConnectedChannels } from '../../components/channels-page'

export const Route = createFileRoute('/_authenticated/channels')({
  loader: async () => {
    const channels = await getChannelLinks()
    return { channels }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { channels } = Route.useLoaderData()
  return <ConnectedChannels channels={channels} />
}
