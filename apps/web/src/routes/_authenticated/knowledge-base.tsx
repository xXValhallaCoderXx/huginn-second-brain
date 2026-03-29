import { createFileRoute } from "@tanstack/react-router";
import { getNotes, getNoteTags, getKnowledgeStats } from "../../lib/server-fns";
import { KnowledgeBasePage } from "../../components/knowledge-base-page";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
    loader: async () => {
        const [notes, tags, stats] = await Promise.all([
            getNotes({ data: {} }),
            getNoteTags(),
            getKnowledgeStats(),
        ]);
        return { notes, tags, stats };
    },
    component: KnowledgeBaseRoute,
});

function KnowledgeBaseRoute() {
    const { notes, tags, stats } = Route.useLoaderData();
    return <KnowledgeBasePage initialNotes={notes} initialTags={tags} initialStats={stats} />;
}
