import { useState, useCallback } from "react";
import type { Note } from "@huginn/shared";
import {
    getNotes,
    searchNotes,
    createDashboardNote,
    updateNote,
    deleteNote,
} from "../lib/server-fns";

interface KnowledgeBasePageProps {
    initialNotes: Note[];
    initialTags: string[];
}

export function KnowledgeBasePage({ initialNotes, initialTags }: KnowledgeBasePageProps) {
    const [notes, setNotes] = useState<Note[]>(initialNotes);
    const [allTags, setAllTags] = useState<string[]>(initialTags);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [capturedByFilter, setCapturedByFilter] = useState<"all" | "user" | "agent">("all");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editContent, setEditContent] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newContent, setNewContent] = useState("");
    const [newTags, setNewTags] = useState("");
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const filter = capturedByFilter === "all" ? undefined : capturedByFilter;
            let result: Note[];
            if (searchQuery.trim()) {
                result = await searchNotes({
                    data: {
                        query: searchQuery.trim(),
                        tags: selectedTags.length > 0 ? selectedTags : undefined,
                    },
                });
            } else {
                result = await getNotes({
                    data: {
                        tags: selectedTags.length > 0 ? selectedTags : undefined,
                        capturedBy: filter,
                    },
                });
            }
            setNotes(result);
        } finally {
            setLoading(false);
        }
    }, [searchQuery, selectedTags, capturedByFilter]);

    const handleSearch = () => {
        refresh();
    };

    const toggleTag = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
        );
    };

    const startEdit = (note: Note) => {
        setEditingId(note.id);
        setEditTitle(note.title);
        setEditContent(note.content);
    };

    const saveEdit = async () => {
        if (!editingId) return;
        await updateNote({ data: { noteId: editingId, title: editTitle, content: editContent } });
        setEditingId(null);
        refresh();
    };

    const confirmDelete = async () => {
        if (!deletingId) return;
        await deleteNote({ data: { noteId: deletingId } });
        setDeletingId(null);
        refresh();
    };

    const handleCreate = async () => {
        if (!newTitle.trim() || !newContent.trim()) return;
        const tags = newTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        await createDashboardNote({ data: { title: newTitle.trim(), content: newContent.trim(), tags } });
        setNewTitle("");
        setNewContent("");
        setNewTags("");
        setShowCreate(false);
        // Refresh tags list too
        const { getNoteTags } = await import("../lib/server-fns");
        const updatedTags = await getNoteTags();
        setAllTags(updatedTags);
        refresh();
    };

    return (
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-text-heading flex items-center gap-2">
                        <svg className="h-6 w-6 text-accent-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                        </svg>
                        Knowledge Base
                    </h1>
                    <p className="text-sm text-text-muted mt-1">
                        Notes captured from conversations and saved manually.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="bg-accent hover:bg-accent/90 text-white font-medium py-2 px-4 rounded-xl transition-all shadow-sm shadow-accent/20 flex items-center gap-2 text-sm"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    New Note
                </button>
            </div>

            {/* Create Note Form */}
            {showCreate && (
                <div className="rounded-2xl border border-accent/30 bg-surface p-5 mb-6 space-y-3">
                    <input
                        type="text"
                        placeholder="Title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-text-heading placeholder:text-text-muted focus:outline-none focus:border-accent"
                    />
                    <textarea
                        placeholder="Content"
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        rows={3}
                        className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                    />
                    <input
                        type="text"
                        placeholder="Tags (comma-separated)"
                        value={newTags}
                        onChange={(e) => setNewTags(e.target.value)}
                        className="w-full bg-page border border-border rounded-lg px-3 py-2 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:border-accent"
                    />
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setShowCreate(false)}
                            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-body transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!newTitle.trim() || !newContent.trim()}
                            className="px-4 py-1.5 text-sm bg-accent hover:bg-accent/90 text-white rounded-lg disabled:opacity-40 transition-all"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* Search & Filters */}
            <div className="space-y-3 mb-6">
                {/* Search bar */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search notes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text-heading placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                    />
                    <button
                        onClick={handleSearch}
                        className="px-4 py-2.5 bg-surface border border-border rounded-xl text-text-muted hover:text-text-heading hover:border-accent/50 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                    </button>
                </div>

                {/* Captured-by filter */}
                <div className="flex items-center gap-2">
                    {(["all", "user", "agent"] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => {
                                setCapturedByFilter(value);
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                capturedByFilter === value
                                    ? "bg-accent/15 text-accent-light border border-accent/30"
                                    : "bg-white/[0.04] text-text-muted border border-border hover:text-text-body"
                            }`}
                        >
                            {value === "all" ? "All" : value === "user" ? "Saved by Me" : "Captured by Huginn"}
                        </button>
                    ))}
                </div>

                {/* Tag pills */}
                {allTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {allTags.map((tag) => (
                            <button
                                key={tag}
                                onClick={() => toggleTag(tag)}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                                    selectedTags.includes(tag)
                                        ? "bg-accent/20 text-accent-light border border-accent/40"
                                        : "bg-white/[0.04] text-text-muted border border-border hover:text-text-body"
                                }`}
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                )}

                {/* Apply filters button (when tags or capturedBy changed) */}
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="text-xs text-accent-light hover:text-accent font-medium"
                >
                    {loading ? "Loading..." : "Apply Filters"}
                </button>
            </div>

            {/* Notes list */}
            {notes.length === 0 ? (
                <div className="text-center py-16">
                    <svg className="h-12 w-12 mx-auto text-text-muted/40 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    <p className="text-text-muted text-sm">No saved knowledge yet.</p>
                    <p className="text-text-subtle text-xs mt-1">
                        Tell Huginn to remember something, or it will start capturing on its own.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {notes.map((note) => (
                        <div
                            key={note.id}
                            className="rounded-xl border border-border bg-surface p-4 hover:border-border/80 transition-colors"
                        >
                            {editingId === note.id ? (
                                /* Edit mode */
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-heading focus:outline-none focus:border-accent"
                                    />
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        rows={3}
                                        className="w-full bg-page border border-border rounded-lg px-3 py-1.5 text-sm text-text-body focus:outline-none focus:border-accent resize-none"
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="px-3 py-1 text-xs text-text-muted hover:text-text-body"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={saveEdit}
                                            className="px-3 py-1 text-xs bg-accent text-white rounded-lg hover:bg-accent/90"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View mode */
                                <>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                {/* Captured-by icon */}
                                                {note.capturedBy === "agent" ? (
                                                    <svg className="h-3.5 w-3.5 text-accent-light flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="h-3.5 w-3.5 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                                                    </svg>
                                                )}
                                                <h3 className="text-sm font-semibold text-text-heading truncate">
                                                    {note.title}
                                                </h3>
                                            </div>
                                            <p className="text-sm text-text-body line-clamp-2 mb-2">
                                                {note.content}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {note.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-2 py-0.5 text-xs bg-white/[0.04] text-text-muted rounded-full border border-border"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                <span className="text-xs text-text-subtle">
                                                    {new Date(note.createdAt).toLocaleDateString(undefined, {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                    })}
                                                </span>
                                                {note.source && (
                                                    <span className="text-xs text-text-subtle">
                                                        via {note.source.channel}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                onClick={() => startEdit(note)}
                                                className="p-1.5 text-text-muted hover:text-text-heading rounded-lg hover:bg-white/[0.04] transition-colors"
                                                title="Edit"
                                            >
                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                                                </svg>
                                            </button>
                                            {deletingId === note.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={confirmDelete}
                                                        className="px-2 py-1 text-xs bg-error/20 text-error rounded-lg hover:bg-error/30 transition-colors"
                                                    >
                                                        Confirm
                                                    </button>
                                                    <button
                                                        onClick={() => setDeletingId(null)}
                                                        className="px-2 py-1 text-xs text-text-muted hover:text-text-body"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setDeletingId(note.id)}
                                                    className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10 transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
