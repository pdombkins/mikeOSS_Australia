/**
 * P3 — Role-based access control (C019).
 * Single source of truth for org + project roles and the capability matrix.
 * Routes and tools ask `can(role, capability)` instead of re-implementing
 * ad-hoc checks. Deny-by-default: no project membership = no access, which
 * is what provides ethical-wall / cross-matter isolation.
 */

export type OrgRole = "admin" | "supervisor" | "member";
export type ProjectRole = "owner" | "editor" | "reviewer" | "viewer";

export type Capability =
    | "view"            // view docs / chats / runs / reviews
    | "download"        // download & export artifacts
    | "run"             // chat, run agents, tabular generate, verify
    | "edit"            // create/edit docs, approve agent plans, edit cells
    | "manage";         // members, walls, delete project

const MATRIX: Record<ProjectRole, Set<Capability>> = {
    owner:    new Set(["view", "download", "run", "edit", "manage"]),
    editor:   new Set(["view", "download", "run", "edit"]),
    reviewer: new Set(["view", "download", "run"]),
    viewer:   new Set(["view"]),
};

export function can(role: ProjectRole | null | undefined, capability: Capability): boolean {
    if (!role) return false;
    return MATRIX[role]?.has(capability) ?? false;
}

export function isProjectRole(value: unknown): value is ProjectRole {
    return (
        value === "owner" ||
        value === "editor" ||
        value === "reviewer" ||
        value === "viewer"
    );
}

export function isOrgRole(value: unknown): value is OrgRole {
    return value === "admin" || value === "supervisor" || value === "member";
}

/** Org-level: may this org role see audit trails / analytics? */
export function canViewOrgOversight(orgRole: OrgRole | null | undefined): boolean {
    return orgRole === "admin" || orgRole === "supervisor";
}
