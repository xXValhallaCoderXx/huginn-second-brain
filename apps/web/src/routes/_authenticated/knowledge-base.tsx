import { createFileRoute } from "@tanstack/react-router";
import { getNotes, getNoteTags } from "../../lib/server-fns";
import { KnowledgeBasePage } from "../../components/knowledge-base-page";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
    loader: async () => {
        const [notes, tags] = await Promise.all([
            getNotes({ data: {} }),
            getNoteTags(),
        ]);
        return { notes, tags };
    },
    component: KnowledgeBaseRoute,
});

function KnowledgeBaseRoute() {
    const { notes, tags } = Route.useLoaderData();
    return <KnowledgeBasePage initialNotes={notes} initialTags={tags} />;
}
