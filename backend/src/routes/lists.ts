/**
 * C076 — Lists REST API (tasks, facts & deadlines on matters).
 * Mounted at /projects/:projectId/list.
 *
 * RBAC (project_members, deny-by-default): owner/editor create & edit;
 * reviewer/viewer read-only. Assignees may update the STATUS of items
 * assigned to them regardless of role. All writes are audit-logged.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess } from "../lib/access";
import { can } from "../lib/rbac";
import { recordAudit } from "../lib/audit";
import {
    LIST_ITEM_COLUMNS,
    LIST_ITEM_KINDS,
    LIST_ITEM_STATUSES,
    createListItem,
    listItemsForProject,
    type ListItemKind,
    type ListItemStatus,
} from "../lib/lists";

export const listsRouter = Router({ mergeParams: true });

// GET /projects/:projectId/list
listsRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params as { projectId: string };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok || !can(access.role, "view"))
        return void res.status(404).json({ detail: "Project not found" });

    try {
        res.json({ items: await listItemsForProject(db, projectId) });
    } catch (err) {
        res.status(500).json({ detail: (err as Error).message });
    }
});

// POST /projects/:projectId/list
listsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId } = req.params as { projectId: string };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    if (!can(access.role, "edit"))
        return void res.status(403).json({ detail: "No edit access" });

    const kind = req.body?.kind as ListItemKind;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!LIST_ITEM_KINDS.has(kind))
        return void res
            .status(400)
            .json({ detail: "kind must be task, fact or deadline" });
    if (!title) return void res.status(400).json({ detail: "title is required" });
    const dueAt =
        typeof req.body?.due_at === "string" && req.body.due_at
            ? new Date(req.body.due_at)
            : null;
    if (dueAt && Number.isNaN(dueAt.getTime()))
        return void res.status(400).json({ detail: "due_at is not a valid date" });

    try {
        const item = await createListItem(db, {
            projectId,
            createdBy: userId,
            kind,
            title,
            detail:
                typeof req.body?.detail === "string" ? req.body.detail : null,
            dueAt: dueAt ? dueAt.toISOString() : null,
            assigneeUserId:
                typeof req.body?.assignee_user_id === "string"
                    ? req.body.assignee_user_id
                    : null,
            documentId:
                typeof req.body?.document_id === "string"
                    ? req.body.document_id
                    : null,
            citation:
                typeof req.body?.citation === "string"
                    ? req.body.citation
                    : null,
        });
        recordAudit({
            actorId: userId,
            eventType: "doc_edit",
            projectId,
            resourceType: "list_item",
            resourceId: item.id,
            detail: { action: "create", kind },
        });
        res.status(201).json({ item });
    } catch (err) {
        res.status(500).json({ detail: (err as Error).message });
    }
});

// PATCH /projects/:projectId/list/:itemId
listsRouter.patch("/:itemId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, itemId } = req.params as {
        projectId: string;
        itemId: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok || !can(access.role, "view"))
        return void res.status(404).json({ detail: "Project not found" });

    const { data: item } = await db
        .from("list_items")
        .select(LIST_ITEM_COLUMNS)
        .eq("id", itemId)
        .eq("project_id", projectId)
        .maybeSingle();
    if (!item) return void res.status(404).json({ detail: "Item not found" });

    const updates: Record<string, unknown> = {};
    const isAssignee =
        (item as { assignee_user_id: string | null }).assignee_user_id ===
        userId;
    const canEdit = can(access.role, "edit");

    if (req.body?.status !== undefined) {
        const status = req.body.status as ListItemStatus;
        if (!LIST_ITEM_STATUSES.has(status))
            return void res.status(400).json({ detail: "Bad status" });
        if (!canEdit && !isAssignee)
            return void res.status(403).json({ detail: "No edit access" });
        updates.status = status;
    }

    // Field edits require the edit capability.
    const fieldEdits: [string, unknown][] = [];
    if (typeof req.body?.title === "string" && req.body.title.trim())
        fieldEdits.push(["title", req.body.title.trim().slice(0, 500)]);
    if (req.body?.detail !== undefined)
        fieldEdits.push([
            "detail",
            typeof req.body.detail === "string"
                ? req.body.detail.slice(0, 8000)
                : null,
        ]);
    if (req.body?.due_at !== undefined) {
        if (req.body.due_at === null) fieldEdits.push(["due_at", null]);
        else {
            const d = new Date(String(req.body.due_at));
            if (Number.isNaN(d.getTime()))
                return void res
                    .status(400)
                    .json({ detail: "due_at is not a valid date" });
            fieldEdits.push(["due_at", d.toISOString()]);
        }
    }
    if (req.body?.assignee_user_id !== undefined)
        fieldEdits.push([
            "assignee_user_id",
            typeof req.body.assignee_user_id === "string"
                ? req.body.assignee_user_id
                : null,
        ]);
    if (req.body?.citation !== undefined)
        fieldEdits.push([
            "citation",
            typeof req.body.citation === "string"
                ? req.body.citation.slice(0, 500)
                : null,
        ]);
    if (req.body?.agent_run_id !== undefined)
        fieldEdits.push([
            "agent_run_id",
            typeof req.body.agent_run_id === "string"
                ? req.body.agent_run_id
                : null,
        ]);
    if (typeof req.body?.position === "number")
        fieldEdits.push(["position", Math.max(0, Math.floor(req.body.position))]);

    if (fieldEdits.length > 0) {
        if (!canEdit)
            return void res.status(403).json({ detail: "No edit access" });
        for (const [k, v] of fieldEdits) updates[k] = v;
    }
    if (Object.keys(updates).length === 0)
        return void res.status(400).json({ detail: "Nothing to update" });
    updates.updated_at = new Date().toISOString();

    const { data: updated, error } = await db
        .from("list_items")
        .update(updates)
        .eq("id", itemId)
        .eq("project_id", projectId)
        .select(LIST_ITEM_COLUMNS)
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    recordAudit({
        actorId: userId,
        eventType: "doc_edit",
        projectId,
        resourceType: "list_item",
        resourceId: itemId,
        detail: { action: "update", fields: Object.keys(updates) },
    });
    res.json({ item: updated });
});

// DELETE /projects/:projectId/list/:itemId
listsRouter.delete("/:itemId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const userEmail = res.locals.userEmail as string | undefined;
    const { projectId, itemId } = req.params as {
        projectId: string;
        itemId: string;
    };
    const db = createServerSupabase();

    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok)
        return void res.status(404).json({ detail: "Project not found" });
    if (!can(access.role, "edit"))
        return void res.status(403).json({ detail: "No edit access" });

    const { error } = await db
        .from("list_items")
        .delete()
        .eq("id", itemId)
        .eq("project_id", projectId);
    if (error) return void res.status(500).json({ detail: error.message });
    recordAudit({
        actorId: userId,
        eventType: "doc_edit",
        projectId,
        resourceType: "list_item",
        resourceId: itemId,
        detail: { action: "delete" },
    });
    res.status(204).end();
});
