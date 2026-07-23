/**
 * C076 — Lists: tasks, facts & deadlines on matters (Legora Lists analogue).
 *
 * Shared helpers used by routes/lists.ts, the chat/agent list tools, and the
 * daily deadline sweep. Access control is the caller's job (checkProjectAccess
 * + rbac.can); these helpers assume the project is already authorised.
 */

import { createServerSupabase } from "./supabase";
import { notify } from "./notifications";

type Db = ReturnType<typeof createServerSupabase>;

export type ListItemKind = "task" | "fact" | "deadline";
export type ListItemStatus = "open" | "in_progress" | "done" | "dismissed";

export const LIST_ITEM_KINDS = new Set<ListItemKind>([
    "task",
    "fact",
    "deadline",
]);
export const LIST_ITEM_STATUSES = new Set<ListItemStatus>([
    "open",
    "in_progress",
    "done",
    "dismissed",
]);

export type ListItem = {
    id: string;
    project_id: string;
    created_by: string;
    kind: ListItemKind;
    title: string;
    detail: string | null;
    due_at: string | null;
    status: ListItemStatus;
    assignee_user_id: string | null;
    document_id: string | null;
    citation: string | null;
    agent_run_id: string | null;
    position: number;
    created_at: string;
    updated_at: string;
};

export const LIST_ITEM_COLUMNS =
    "id, project_id, created_by, kind, title, detail, due_at, status, assignee_user_id, document_id, citation, agent_run_id, position, created_at, updated_at";

export async function listItemsForProject(
    db: Db,
    projectId: string,
): Promise<ListItem[]> {
    const { data, error } = await db
        .from("list_items")
        .select(LIST_ITEM_COLUMNS)
        .eq("project_id", projectId)
        .order("position")
        .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as ListItem[];
}

export async function createListItem(
    db: Db,
    args: {
        projectId: string;
        createdBy: string;
        kind: ListItemKind;
        title: string;
        detail?: string | null;
        dueAt?: string | null;
        assigneeUserId?: string | null;
        documentId?: string | null;
        citation?: string | null;
    },
): Promise<ListItem> {
    // Append at the end of the kind group.
    const { data: maxRow } = await db
        .from("list_items")
        .select("position")
        .eq("project_id", args.projectId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
    const position = ((maxRow as { position?: number } | null)?.position ?? -1) + 1;

    const { data, error } = await db
        .from("list_items")
        .insert({
            project_id: args.projectId,
            created_by: args.createdBy,
            kind: args.kind,
            title: args.title.slice(0, 500),
            detail: args.detail?.slice(0, 8000) ?? null,
            due_at: args.dueAt ?? null,
            assignee_user_id: args.assigneeUserId ?? null,
            document_id: args.documentId ?? null,
            citation: args.citation?.slice(0, 500) ?? null,
            position,
        })
        .select(LIST_ITEM_COLUMNS)
        .single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");
    return data as ListItem;
}

/**
 * Daily deadline sweep (wired in index.ts; LISTS_REMINDERS_DISABLED=1 to
 * turn off). Notifies the assignee (falling back to the creator) for open
 * items due within the next 72 hours — including overdue ones. Deduped per
 * item per day via the notifications table.
 */
export async function checkDeadlinesAndNotify(): Promise<void> {
    const db = createServerSupabase();
    const soon = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { data: items } = await db
        .from("list_items")
        .select(`${LIST_ITEM_COLUMNS}, projects(name)`)
        .in("status", ["open", "in_progress"])
        .not("due_at", "is", null)
        .lte("due_at", soon)
        .limit(500);

    const today = new Date().toISOString().slice(0, 10);
    for (const raw of (items ?? []) as (ListItem & {
        projects?: { name?: string } | null;
    })[]) {
        const recipient = raw.assignee_user_id ?? raw.created_by;
        if (!recipient) continue;
        const overdue = raw.due_at! < new Date().toISOString();
        const projectName = raw.projects?.name ?? "a matter";
        const title = `${overdue ? "Overdue" : "Due soon"}: ${raw.title} (${today})`;
        try {
            // One reminder per item per day.
            const { data: existing } = await db
                .from("notifications")
                .select("id")
                .eq("user_id", recipient)
                .eq("title", title)
                .limit(1);
            if (existing && existing.length > 0) continue;
            await notify({
                userId: recipient,
                kind: "deadline",
                title,
                body: `${raw.kind === "deadline" ? "Deadline" : "Task"} on ${projectName}${raw.due_at ? ` — due ${raw.due_at.slice(0, 10)}` : ""}${overdue ? " (overdue)" : ""}.`,
                link: `/projects/${raw.project_id}`,
            });
        } catch (err) {
            console.error("[lists] deadline notify failed:", err);
        }
    }
}
