"use client";

/**
 * C076 — Lists: tasks, facts & deadlines on a matter (Legora Lists analogue).
 * Three grouped sections with inline add, status toggles, due-date badges,
 * assignee picker (project members), and "Run with agent" on tasks — which
 * seeds an approval-gated agent run (C030) and links it to the item. The
 * agent never closes its own task; a human marks it done.
 */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Bot,
    Calendar,
    Check,
    CircleDashed,
    ExternalLink,
    Loader2,
    Plus,
    Quote,
    Trash2,
} from "lucide-react";
import {
    createAgentRun,
    createProjectListItem,
    deleteProjectListItem,
    getProjectMembers,
    listProjectListItems,
    updateProjectListItem,
    type ListItem,
    type ListItemKind,
    type ListItemStatus,
    type ProjectMember,
} from "@/app/lib/mikeApi";
import {
    ProjectSectionToolbar,
    useProjectWorkspace,
} from "@/app/components/projects/ProjectWorkspace";

interface Props {
    params: Promise<{ id: string }>;
}

const KIND_META: Record<
    ListItemKind,
    { label: string; empty: string; addPlaceholder: string }
> = {
    task: {
        label: "Tasks",
        empty: "No tasks yet. Add work items to track, or ask the assistant to add them from chat.",
        addPlaceholder: "Add a task, e.g. 'Draft indemnity clause options'",
    },
    fact: {
        label: "Facts",
        empty: "No facts pinned yet. Pin key facts (with citations) so they're on hand for drafting and review.",
        addPlaceholder: "Pin a fact, e.g. 'Lease commenced 1 March 2024'",
    },
    deadline: {
        label: "Deadlines",
        empty: "No deadlines yet. Date-bound items notify the assignee when they fall due within 72 hours.",
        addPlaceholder: "Add a deadline, e.g. 'File defence'",
    },
};

const STATUS_ORDER: ListItemStatus[] = ["open", "in_progress", "done"];

function dueBadge(item: ListItem): { text: string; cls: string } | null {
    if (!item.due_at || item.status === "done" || item.status === "dismissed")
        return item.due_at
            ? { text: item.due_at.slice(0, 10), cls: "bg-gray-100 text-gray-500" }
            : null;
    const due = new Date(item.due_at).getTime();
    const now = Date.now();
    if (due < now)
        return {
            text: `Overdue · ${item.due_at.slice(0, 10)}`,
            cls: "bg-red-50 text-red-700 border border-red-200",
        };
    if (due - now < 72 * 60 * 60 * 1000)
        return {
            text: `Due soon · ${item.due_at.slice(0, 10)}`,
            cls: "bg-amber-50 text-amber-700 border border-amber-200",
        };
    return { text: item.due_at.slice(0, 10), cls: "bg-gray-100 text-gray-600" };
}

export default function ProjectListsPage({ params }: Props) {
    use(params);
    const { projectId, search } = useProjectWorkspace();
    const router = useRouter();

    const [items, setItems] = useState<ListItem[] | null>(null);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [canEdit, setCanEdit] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<
        Record<ListItemKind, { title: string; due: string }>
    >({
        task: { title: "", due: "" },
        fact: { title: "", due: "" },
        deadline: { title: "", due: "" },
    });
    const [savingKind, setSavingKind] = useState<ListItemKind | null>(null);
    const [runningItemId, setRunningItemId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const { items } = await listProjectListItems(projectId);
            setItems(items);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load list");
        }
    }, [projectId]);

    useEffect(() => {
        void refresh();
        void getProjectMembers(projectId)
            .then(({ role, members }) => {
                setMembers(members);
                setCanEdit(role === "owner" || role === "editor");
            })
            .catch(() => {
                /* fall back to edit-allowed; server still enforces */
            });
    }, [projectId, refresh]);

    const filtered = useMemo(() => {
        const list = items ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter(
            (i) =>
                i.title.toLowerCase().includes(q) ||
                (i.detail ?? "").toLowerCase().includes(q) ||
                (i.citation ?? "").toLowerCase().includes(q),
        );
    }, [items, search]);

    const memberLabel = useCallback(
        (userId: string | null) => {
            if (!userId) return null;
            const m = members.find((m) => m.user_id === userId);
            return m?.display_name || m?.email || null;
        },
        [members],
    );

    async function addItem(kind: ListItemKind) {
        const draft = drafts[kind];
        if (!draft.title.trim() || savingKind) return;
        if (kind === "deadline" && !draft.due) {
            setError("Deadlines need a due date.");
            return;
        }
        setSavingKind(kind);
        setError(null);
        try {
            const { item } = await createProjectListItem(projectId, {
                kind,
                title: draft.title.trim(),
                due_at: draft.due ? new Date(draft.due).toISOString() : null,
            });
            setItems((prev) => [...(prev ?? []), item]);
            setDrafts((d) => ({ ...d, [kind]: { title: "", due: "" } }));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to add item");
        } finally {
            setSavingKind(null);
        }
    }

    async function patchItem(
        itemId: string,
        patch: Parameters<typeof updateProjectListItem>[2],
    ) {
        try {
            const { item } = await updateProjectListItem(
                projectId,
                itemId,
                patch,
            );
            setItems((prev) =>
                (prev ?? []).map((i) => (i.id === item.id ? item : i)),
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Update failed");
        }
    }

    async function removeItem(itemId: string) {
        try {
            await deleteProjectListItem(projectId, itemId);
            setItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed");
        }
    }

    async function runWithAgent(item: ListItem) {
        if (runningItemId) return;
        setRunningItemId(item.id);
        setError(null);
        try {
            const { run_id } = await createAgentRun({
                request: `${item.title}${item.detail ? `\n\nContext: ${item.detail}` : ""}\n\n(This request executes the matter task "${item.title}" from the project list. Do not mark the task done yourself — the user confirms completion.)`,
                project_id: projectId,
            });
            await patchItem(item.id, {
                agent_run_id: run_id,
                status: "in_progress",
            });
            router.push(`/agents?run=${run_id}`);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Failed to start agent run",
            );
        } finally {
            setRunningItemId(null);
        }
    }

    function nextStatus(s: ListItemStatus): ListItemStatus {
        const idx = STATUS_ORDER.indexOf(s);
        return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] ?? "open";
    }

    const loading = items === null;

    return (
        <>
            <ProjectSectionToolbar />
            <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4">
                <p className="mb-4 text-sm text-gray-500">
                    Own every task, fact, and deadline on this matter. Tasks can
                    be handed to an agent (plan approval applies); deadline
                    reminders go to the assignee 72 hours out. The assistant can
                    read and update this list from project chat.
                </p>
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                ) : (
                    (["task", "deadline", "fact"] as ListItemKind[]).map(
                        (kind) => {
                            const group = filtered
                                .filter((i) => i.kind === kind)
                                .sort((a, b) => {
                                    if (a.due_at && b.due_at)
                                        return a.due_at.localeCompare(b.due_at);
                                    if (a.due_at) return -1;
                                    if (b.due_at) return 1;
                                    return a.position - b.position;
                                });
                            return (
                                <section key={kind} className="mb-8">
                                    <h2 className="mb-2 text-sm font-semibold text-gray-800">
                                        {KIND_META[kind].label}
                                        <span className="ml-2 text-xs font-normal text-gray-400">
                                            {group.filter(
                                                (i) =>
                                                    i.status !== "done" &&
                                                    i.status !== "dismissed",
                                            ).length}{" "}
                                            open
                                        </span>
                                    </h2>
                                    {group.length === 0 && (
                                        <p className="mb-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-4 text-center text-xs text-gray-500">
                                            {KIND_META[kind].empty}
                                        </p>
                                    )}
                                    <ul className="space-y-1.5">
                                        {group.map((item) => {
                                            const badge = dueBadge(item);
                                            const assignee = memberLabel(
                                                item.assignee_user_id,
                                            );
                                            const done =
                                                item.status === "done" ||
                                                item.status === "dismissed";
                                            return (
                                                <li
                                                    key={item.id}
                                                    className="group flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                                >
                                                    <button
                                                        title={`Status: ${item.status} (click to change)`}
                                                        onClick={() =>
                                                            void patchItem(
                                                                item.id,
                                                                {
                                                                    status: nextStatus(
                                                                        item.status,
                                                                    ),
                                                                },
                                                            )
                                                        }
                                                        className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-700"
                                                    >
                                                        {item.status ===
                                                        "done" ? (
                                                            <Check className="h-4 w-4 text-emerald-600" />
                                                        ) : item.status ===
                                                          "in_progress" ? (
                                                            <Loader2 className="h-4 w-4 text-blue-500" />
                                                        ) : (
                                                            <CircleDashed className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                    <div className="min-w-0 flex-1">
                                                        <p
                                                            className={`text-sm ${done ? "text-gray-400 line-through" : "text-gray-800"}`}
                                                        >
                                                            {item.title}
                                                        </p>
                                                        {item.detail && (
                                                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                                                                {item.detail}
                                                            </p>
                                                        )}
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                                            {badge && (
                                                                <span
                                                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${badge.cls}`}
                                                                >
                                                                    <Calendar className="h-3 w-3" />
                                                                    {badge.text}
                                                                </span>
                                                            )}
                                                            {item.citation && (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                                                                    <Quote className="h-3 w-3" />
                                                                    {
                                                                        item.citation
                                                                    }
                                                                </span>
                                                            )}
                                                            {item.agent_run_id && (
                                                                <button
                                                                    onClick={() =>
                                                                        router.push(
                                                                            `/agents?run=${item.agent_run_id}`,
                                                                        )
                                                                    }
                                                                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 hover:bg-indigo-100"
                                                                >
                                                                    <Bot className="h-3 w-3" />
                                                                    Agent run
                                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                                </button>
                                                            )}
                                                            {canEdit ? (
                                                                <select
                                                                    value={
                                                                        item.assignee_user_id ??
                                                                        ""
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        void patchItem(
                                                                            item.id,
                                                                            {
                                                                                assignee_user_id:
                                                                                    e
                                                                                        .target
                                                                                        .value ||
                                                                                    null,
                                                                            },
                                                                        )
                                                                    }
                                                                    className="rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600"
                                                                >
                                                                    <option value="">
                                                                        Unassigned
                                                                    </option>
                                                                    {members.map(
                                                                        (m) => (
                                                                            <option
                                                                                key={
                                                                                    m.user_id
                                                                                }
                                                                                value={
                                                                                    m.user_id
                                                                                }
                                                                            >
                                                                                {m.display_name ||
                                                                                    m.email ||
                                                                                    m.user_id.slice(
                                                                                        0,
                                                                                        8,
                                                                                    )}
                                                                            </option>
                                                                        ),
                                                                    )}
                                                                </select>
                                                            ) : (
                                                                assignee && (
                                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                                                                        {
                                                                            assignee
                                                                        }
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                                        {kind === "task" &&
                                                            !done &&
                                                            !item.agent_run_id &&
                                                            canEdit && (
                                                                <button
                                                                    title="Run with agent (plan approval applies)"
                                                                    disabled={
                                                                        runningItemId ===
                                                                        item.id
                                                                    }
                                                                    onClick={() =>
                                                                        void runWithAgent(
                                                                            item,
                                                                        )
                                                                    }
                                                                    className="rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                                                >
                                                                    {runningItemId ===
                                                                    item.id ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Bot className="h-3.5 w-3.5" />
                                                                    )}
                                                                </button>
                                                            )}
                                                        {canEdit && (
                                                            <button
                                                                title="Delete"
                                                                onClick={() =>
                                                                    void removeItem(
                                                                        item.id,
                                                                    )
                                                                }
                                                                className="rounded-md border border-gray-200 p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {canEdit && (
                                        <form
                                            className="mt-2 flex items-center gap-2"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                void addItem(kind);
                                            }}
                                        >
                                            <input
                                                value={drafts[kind].title}
                                                onChange={(e) =>
                                                    setDrafts((d) => ({
                                                        ...d,
                                                        [kind]: {
                                                            ...d[kind],
                                                            title: e.target
                                                                .value,
                                                        },
                                                    }))
                                                }
                                                placeholder={
                                                    KIND_META[kind]
                                                        .addPlaceholder
                                                }
                                                className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-gray-400"
                                            />
                                            {(kind === "deadline" ||
                                                kind === "task") && (
                                                <input
                                                    type="date"
                                                    value={drafts[kind].due}
                                                    onChange={(e) =>
                                                        setDrafts((d) => ({
                                                            ...d,
                                                            [kind]: {
                                                                ...d[kind],
                                                                due: e.target
                                                                    .value,
                                                            },
                                                        }))
                                                    }
                                                    className="rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-600"
                                                />
                                            )}
                                            <button
                                                type="submit"
                                                disabled={
                                                    savingKind === kind ||
                                                    !drafts[kind].title.trim()
                                                }
                                                className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                                            >
                                                {savingKind === kind ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Plus className="h-4 w-4" />
                                                )}
                                                Add
                                            </button>
                                        </form>
                                    )}
                                </section>
                            );
                        },
                    )
                )}
            </div>
        </>
    );
}
