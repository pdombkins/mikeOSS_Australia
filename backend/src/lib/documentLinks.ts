/**
 * Central document management — helpers for the document_project_links table.
 *
 * A canonical document (typically a Library document owned by the
 * instructor/admin, project_id null) can be linked to many projects. Links
 * are live references, not copies: the bytes live once, and every project
 * the document is linked to sees the current version.
 *
 * Access rule (enforced in access.ts): a user with access to a project can
 * read any document linked to that project.
 */

import type { createServerSupabase } from "./supabase";

type Db = ReturnType<typeof createServerSupabase>;

/** Document IDs linked into a given project. */
export async function listLinkedDocumentIdsForProject(
    db: Db,
    projectId: string,
): Promise<string[]> {
    const { data } = await db
        .from("document_project_links")
        .select("document_id")
        .eq("project_id", projectId);
    return (data ?? []).map((r) => r.document_id as string);
}

/** Project IDs a given document is linked into. */
export async function listProjectIdsForDocument(
    db: Db,
    documentId: string,
): Promise<string[]> {
    const { data } = await db
        .from("document_project_links")
        .select("project_id")
        .eq("document_id", documentId);
    return (data ?? []).map((r) => r.project_id as string);
}

/**
 * Bulk map of document_id → project_id[] for a set of documents. Used by the
 * admin matrix so a single query hydrates every checkbox row.
 */
export async function linksByDocument(
    db: Db,
    documentIds: string[],
): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (documentIds.length === 0) return map;
    const { data } = await db
        .from("document_project_links")
        .select("document_id, project_id")
        .in("document_id", documentIds);
    for (const r of (data ?? []) as {
        document_id: string;
        project_id: string;
    }[]) {
        const list = map.get(r.document_id) ?? [];
        list.push(r.project_id);
        map.set(r.document_id, list);
    }
    return map;
}

/**
 * Load the full document rows linked into a project (excluding docs whose
 * project_id already equals this project — those are the project's own and
 * are listed separately). Each returned row is tagged is_linked so the UI can
 * render a read-only "Shared" badge and callers can suppress destructive ops.
 */
export async function loadLinkedDocumentsForProject(
    db: Db,
    projectId: string,
): Promise<Record<string, unknown>[]> {
    const ids = await listLinkedDocumentIdsForProject(db, projectId);
    if (ids.length === 0) return [];
    const { data } = await db
        .from("documents")
        .select("*")
        .in("id", ids);
    return ((data ?? []) as Record<string, unknown>[])
        // A document that already belongs to this project is not "linked in".
        .filter((d) => (d.project_id as string | null) !== projectId)
        .map((d) => ({ ...d, is_linked: true }));
}

/**
 * Replace the full set of project links for a document. Inserts any missing
 * links and deletes any that are no longer present. Idempotent.
 */
export async function setDocumentLinks(
    db: Db,
    documentId: string,
    projectIds: string[],
    linkedBy: string | null,
): Promise<void> {
    const desired = new Set(projectIds);
    const current = new Set(await listProjectIdsForDocument(db, documentId));

    const toAdd = [...desired].filter((p) => !current.has(p));
    const toRemove = [...current].filter((p) => !desired.has(p));

    if (toAdd.length > 0) {
        await db.from("document_project_links").insert(
            toAdd.map((project_id) => ({
                document_id: documentId,
                project_id,
                linked_by: linkedBy,
            })),
        );
    }
    if (toRemove.length > 0) {
        await db
            .from("document_project_links")
            .delete()
            .eq("document_id", documentId)
            .in("project_id", toRemove);
    }
}
