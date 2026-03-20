import { createFileRoute } from '@tanstack/react-router'
import { loadPersonalityFiles } from '../../lib/server-fns'
import { EditIdentityPage } from '../../components/edit-identity-page'

export const Route = createFileRoute('/_authenticated/edit-identity')({
  loader: async ({ context }) => {
    const personality = await loadPersonalityFiles({
      data: { accountId: context.account.id },
    })
    return { personality, accountId: context.account.id }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { personality, accountId } = Route.useLoaderData()
  return <EditIdentityPage personality={personality} accountId={accountId} />
}
