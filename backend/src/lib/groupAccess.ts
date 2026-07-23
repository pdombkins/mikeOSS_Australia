/**
 * Group-based project access (student groups).
 *
 * Membership is email-based so a cohort can be added before anyone has an
 * account ("match on signup"): at check time we match on user_id OR the
 * caller's email, and opportunistically backfill user_id when an email-only
 * row matches a now-registered user. A user in several granted groups gets
 * the strongest role.
 */

import type { createServerSupabase } from "./supabase";
import type { ProjectRole } from "./rbac";

type Db = ReturnType<typeof createServerSupabase>;

const GRANT_ROLES: readonly ProjectRole[] = ["editor", "reviewer", "viewer"];

/** Strongest first. */
function strongest(roles: string[]): Exclude<ProjectRole, "owner"> | null {
  for (const r of GRANT_ROLES) if (roles.includes(r)) return r as Exclude<ProjectRole, "owner">;
  return null;
}

function membershipFilter(userId: string, email: string): string {
  return email
    ? `user_id.eq.${userId},email.eq.${email}`
    : `user_id.eq.${userId}`;
}

/** IDs of groups the user belongs to (by user_id or email). */
export async function listUserGroupIds(
  userId: string,
  userEmail: string | null | undefined,
  db: Db,
): Promise<string[]> {
  const email = (userEmail ?? "").trim().toLowerCase();
  const { data } = await db
    .from("user_group_members")
    .select("id, group_id, user_id")
    .or(membershipFilter(userId, email));
  const rows = (data ?? []) as {
    id: string;
    group_id: string;
    user_id: string | null;
  }[];

  // Opportunistic backfill: matched by email but not yet linked.
  const unlinked = rows.filter((r) => !r.user_id).map((r) => r.id);
  if (unlinked.length > 0) {
    void db
      .from("user_group_members")
      .update({ user_id: userId })
      .in("id", unlinked)
      .then(() => undefined);
  }
  return [...new Set(rows.map((r) => r.group_id))];
}

/**
 * Role granted to the user on a project via group grants, or null.
 */
export async function groupRoleForProject(
  projectId: string,
  userId: string,
  userEmail: string | null | undefined,
  db: Db,
): Promise<Exclude<ProjectRole, "owner"> | null> {
  const groupIds = await listUserGroupIds(userId, userEmail, db);
  if (groupIds.length === 0) return null;
  const { data } = await db
    .from("project_group_grants")
    .select("role")
    .eq("project_id", projectId)
    .in("group_id", groupIds);
  const roles = ((data ?? []) as { role: string }[]).map((g) => g.role);
  return strongest(roles);
}

/** Project IDs accessible to the user via group grants. */
export async function listGroupAccessibleProjectIds(
  userId: string,
  userEmail: string | null | undefined,
  db: Db,
): Promise<string[]> {
  const groupIds = await listUserGroupIds(userId, userEmail, db);
  if (groupIds.length === 0) return [];
  const { data } = await db
    .from("project_group_grants")
    .select("project_id")
    .in("group_id", groupIds);
  return [
    ...new Set(((data ?? []) as { project_id: string }[]).map((g) => g.project_id)),
  ];
}
