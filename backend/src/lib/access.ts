/**
 * Project / document access helpers.
 *
 * Sharing makes the previous "scope by user_id" pattern incorrect — a doc
 * can belong to user A's project that A has shared with B's email, and B
 * must still be able to read/edit it. These helpers centralize the
 * "owner OR shared project member" check so every route uses the same
 * logic instead of re-implementing the join.
 *
 * Returned `isOwner` lets callers gate operations that should stay
 * owner-only (delete, rename, member management).
 */

import type { createServerSupabase } from "./supabase";
import type { ProjectRole } from "./rbac";
import {
    groupRoleForProject,
    listGroupAccessibleProjectIds,
} from "./groupAccess";
import { linksByDocument, listProjectIdsForDocument } from "./documentLinks";

type Db = ReturnType<typeof createServerSupabase>;

export type ProjectAccess =
    | {
          ok: true;
          isOwner: boolean;
          /** RBAC project role (P3). Owner ⇒ 'owner'; legacy shared_with
           *  members map to 'editor' until backfilled into project_members. */
          role: ProjectRole;
          project: {
              id: string;
              user_id: string;
              shared_with: string[] | null;
          };
      }
    | { ok: false };

export async function checkProjectAccess(
    projectId: string,
    userId: string,
    userEmail: string | null | undefined,
    db: Db,
): Promise<ProjectAccess> {
    const { data: project } = await db
        .from("projects")
        .select("id, user_id, shared_with")
        .eq("id", projectId)
        .single();
    if (!project) return { ok: false };
    const proj = project as {
        id: string;
        user_id: string;
        shared_with: string[] | null;
    };
    if (proj.user_id === userId) {
        return { ok: true, isOwner: true, role: "owner", project: proj };
    }

    // RBAC membership (authoritative).
    const { data: member } = await db
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
    const memberRole = (member as { role?: string } | null)?.role;
    if (
        memberRole === "owner" ||
        memberRole === "editor" ||
        memberRole === "reviewer" ||
        memberRole === "viewer"
    ) {
        return {
            ok: true,
            isOwner: memberRole === "owner",
            role: memberRole,
            project: proj,
        };
    }

    // Group grants (student groups): membership in a granted group confers
    // the grant's role. Direct project_members rows (above) take precedence.
    const groupRole = await groupRoleForProject(
        projectId,
        userId,
        userEmail,
        db,
    );
    if (groupRole) {
        return { ok: true, isOwner: false, role: groupRole, project: proj };
    }

    // Legacy fallback: shared_with email list (pre-RBAC shares behaved as
    // read/write ⇒ editor). Removed once all instances run migration 03.
    const sharedWith = Array.isArray(proj.shared_with) ? proj.shared_with : [];
    const email = (userEmail ?? "").toLowerCase();
    if (
        email &&
        sharedWith.some((e) => (e ?? "").toLowerCase() === email)
    ) {
        return { ok: true, isOwner: false, role: "editor", project: proj };
    }
    return { ok: false };
}

/**
 * Check whether the current user can access a document the caller has
 * already loaded (saves a round-trip vs. having the helper re-fetch).
 * Owner-of-doc passes immediately; otherwise we fall through to a
 * project-membership check via `shared_with`.
 */
export async function ensureDocAccess(
    doc: { id?: string; user_id: string; project_id: string | null },
    userId: string,
    userEmail: string | null | undefined,
    db: Db,
): Promise<{ ok: true; isOwner: boolean } | { ok: false }> {
    if (doc.user_id === userId) return { ok: true, isOwner: true };
    if (doc.project_id) {
        const access = await checkProjectAccess(
            doc.project_id,
            userId,
            userEmail,
            db,
        );
        if (access.ok) return { ok: true, isOwner: false };
    }
    // Central document management: a document linked into a project the user
    // can access is readable (never owned). Covers Library docs (project_id
    // null) published to student-group projects.
    if (doc.id) {
        const linkedProjectIds = await listProjectIdsForDocument(db, doc.id);
        if (linkedProjectIds.length > 0) {
            const accessible = new Set(
                await listAccessibleProjectIds(userId, userEmail, db),
            );
            if (linkedProjectIds.some((pid) => accessible.has(pid))) {
                return { ok: true, isOwner: false };
            }
        }
    }
    return { ok: false };
}

/**
 * Same shape as `ensureDocAccess`, for tabular_reviews. A review can be
 * shared in two ways:
 *   1. Indirectly — if `project_id` is set, everyone with project access
 *      can read/operate on it.
 *   2. Directly — `tabular_reviews.shared_with` is a per-review email list
 *      so standalone reviews (project_id null) can also be shared.
 * The owner (review.user_id) always has access.
 */
export async function ensureReviewAccess(
    review: {
        user_id: string;
        project_id: string | null;
        shared_with?: string[] | null;
    },
    userId: string,
    userEmail: string | null | undefined,
    db: Db,
): Promise<{ ok: true; isOwner: boolean } | { ok: false }> {
    if (review.user_id === userId) return { ok: true, isOwner: true };
    const email = (userEmail ?? "").toLowerCase();
    if (email && Array.isArray(review.shared_with)) {
        if (review.shared_with.some((e) => (e ?? "").toLowerCase() === email)) {
            return { ok: true, isOwner: false };
        }
    }
    if (!review.project_id) return { ok: false };
    const access = await checkProjectAccess(
        review.project_id,
        userId,
        userEmail,
        db,
    );
    if (access.ok) return { ok: true, isOwner: false };
    return { ok: false };
}

/**
 * Filter user-supplied document IDs down to documents the caller can read.
 *
 * Tabular review routes accept document IDs from request bodies. Without this
 * check, a caller with access to any review could attach arbitrary document
 * UUIDs and later cause /generate or /regenerate-cell to extract those bytes.
 */
export async function filterAccessibleDocumentIds(
    documentIds: string[],
    userId: string,
    userEmail: string | null | undefined,
    db: Db,
): Promise<string[]> {
    if (documentIds.length === 0) return [];
    const { data: docs } = await db
        .from("documents")
        .select("id, user_id, project_id")
        .in("id", documentIds);
    const rows = (docs ?? []) as {
        id: string;
        user_id: string;
        project_id: string | null;
    }[];
    if (rows.length === 0) return [];

    const accessibleProjectIds = new Set(
        await listAccessibleProjectIds(userId, userEmail, db),
    );
    // Central document management: docs linked into an accessible project are
    // readable even if the doc's own project_id isn't (e.g. Library docs).
    const linkMap = await linksByDocument(
        db,
        rows.map((d) => d.id),
    );
    const allowed: string[] = [];
    for (const doc of rows) {
        if (doc.user_id === userId) {
            allowed.push(doc.id);
        } else if (
            doc.project_id &&
            accessibleProjectIds.has(doc.project_id)
        ) {
            allowed.push(doc.id);
        } else if (
            (linkMap.get(doc.id) ?? []).some((pid) =>
                accessibleProjectIds.has(pid),
            )
        ) {
            allowed.push(doc.id);
        }
    }
    return allowed;
}

/**
 * Returns the set of project IDs the user can access — own projects plus
 * any project where their email is in `shared_with`. Used to scope chat
 * lists and similar collection queries.
 */
export async function listAccessibleProjectIds(
    userId: string,
    userEmail: string | null | undefined,
    db: Db,
): Promise<string[]> {
    const [{ data: own }, { data: shared }, { data: memberships }, groupProjectIds] =
        await Promise.all([
            db.from("projects").select("id").eq("user_id", userId),
            userEmail
                ? db
                      .from("projects")
                      .select("id")
                      .filter("shared_with", "cs", JSON.stringify([userEmail]))
                      .neq("user_id", userId)
                : Promise.resolve({ data: [] as { id: string }[] }),
            db
                .from("project_members")
                .select("project_id")
                .eq("user_id", userId),
            listGroupAccessibleProjectIds(userId, userEmail, db),
        ]);
    const ids = new Set<string>();
    for (const p of (own ?? []) as { id: string }[]) ids.add(p.id);
    for (const p of (shared ?? []) as { id: string }[]) ids.add(p.id);
    for (const m of (memberships ?? []) as { project_id: string }[]) {
        ids.add(m.project_id);
    }
    for (const id of groupProjectIds) ids.add(id);
    return [...ids];
}
