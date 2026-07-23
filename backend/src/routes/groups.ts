/**
 * /groups — Student / user groups (admin-only management).
 *
 * Lets an instructor invite a whole class in one go and manage its access as
 * a unit:
 *   GET    /groups                       List groups (member + grant counts)
 *   POST   /groups                       Create a group { name, description? }
 *   PATCH  /groups/:id                   Rename / redescribe
 *   DELETE /groups/:id                   Delete (cascades members + grants)
 *   GET    /groups/:id                   Group detail: members + project grants
 *   POST   /groups/:id/members           Bulk add { emails: string | string[] }
 *   DELETE /groups/:id/members/:memberId Remove one member
 *
 * Membership is email-based ("match on signup"): unregistered emails are
 * valid members and activate the moment that email registers. Project role
 * grants live on the project routes (/projects/:id/groups) so they sit with
 * the rest of the members API.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import { createServerSupabase } from "../lib/supabase";
import { loadProfileUsersByEmail } from "../lib/userLookup";
import { recordAudit } from "../lib/audit";
import { frontendBaseUrl } from "../lib/urls";

export const groupsRouter = Router();
groupsRouter.use(requireAuth, requireAdmin);

/** Parse pasted emails: accepts an array or a blob separated by commas,
 * semicolons, whitespace or newlines. Returns lowercase, deduped. */
function parseEmails(input: unknown): { valid: string[]; invalid: string[] } {
  let parts: string[] = [];
  if (Array.isArray(input)) {
    parts = input.filter((e): e is string => typeof e === "string");
  } else if (typeof input === "string") {
    parts = input.split(/[\s,;]+/);
  }
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const raw of parts) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    // Deliberately loose: local@domain.tld
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) valid.add(e);
    else invalid.push(e);
  }
  return { valid: [...valid], invalid };
}

// ── GET /groups ───────────────────────────────────────────────────────────────

groupsRouter.get("/", async (_req, res) => {
  const db = createServerSupabase();
  const [{ data: groups }, { data: members }, { data: grants }] =
    await Promise.all([
      db
        .from("user_groups")
        .select("id, name, description, created_at")
        .order("created_at", { ascending: true }),
      db.from("user_group_members").select("group_id, user_id"),
      db.from("project_group_grants").select("group_id"),
    ]);
  const memberRows = (members ?? []) as {
    group_id: string;
    user_id: string | null;
  }[];
  const grantRows = (grants ?? []) as { group_id: string }[];
  res.json({
    groups: ((groups ?? []) as {
      id: string;
      name: string;
      description: string | null;
      created_at: string;
    }[]).map((g) => ({
      ...g,
      member_count: memberRows.filter((m) => m.group_id === g.id).length,
      registered_count: memberRows.filter(
        (m) => m.group_id === g.id && m.user_id,
      ).length,
      project_count: grantRows.filter((x) => x.group_id === g.id).length,
    })),
  });
});

// ── POST /groups ──────────────────────────────────────────────────────────────

groupsRouter.post("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim() || null
      : null;
  if (!name) return void res.status(400).json({ detail: "name required" });

  const db = createServerSupabase();
  const { data, error } = await db
    .from("user_groups")
    .insert({ name, description, created_by: userId })
    .select("id, name, description, created_at")
    .single();
  if (error) return void res.status(500).json({ detail: error.message });
  recordAudit({
    actorId: userId,
    eventType: "member_change",
    resourceType: "group",
    resourceId: (data as { id: string }).id,
    detail: { action: "create_group", name },
  });
  res.json({ group: data });
});

// ── PATCH /groups/:id ─────────────────────────────────────────────────────────

groupsRouter.patch("/:id", async (req, res) => {
  const db = createServerSupabase();
  const patch: Record<string, string | null> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim())
    patch.name = req.body.name.trim();
  if (typeof req.body?.description === "string")
    patch.description = req.body.description.trim() || null;
  if (Object.keys(patch).length === 0)
    return void res.status(400).json({ detail: "Nothing to update" });
  const { error } = await db
    .from("user_groups")
    .update(patch)
    .eq("id", req.params.id);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ ok: true });
});

// ── DELETE /groups/:id ────────────────────────────────────────────────────────

groupsRouter.delete("/:id", async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { error } = await db
    .from("user_groups")
    .delete()
    .eq("id", req.params.id);
  if (error) return void res.status(500).json({ detail: error.message });
  recordAudit({
    actorId: userId,
    eventType: "member_change",
    resourceType: "group",
    resourceId: req.params.id,
    detail: { action: "delete_group" },
  });
  res.json({ ok: true });
});

// ── GET /groups/:id ───────────────────────────────────────────────────────────

groupsRouter.get("/:id", async (req, res) => {
  const db = createServerSupabase();
  const { data: group } = await db
    .from("user_groups")
    .select("id, name, description, created_at")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!group) return void res.status(404).json({ detail: "Group not found" });

  const [{ data: members }, { data: grants }, { userByEmail }] =
    await Promise.all([
      db
        .from("user_group_members")
        .select("id, email, user_id, created_at")
        .eq("group_id", req.params.id)
        .order("email", { ascending: true }),
      db
        .from("project_group_grants")
        .select("id, project_id, role, created_at, projects(name)")
        .eq("group_id", req.params.id),
      loadProfileUsersByEmail(db),
    ]);

  res.json({
    group,
    members: ((members ?? []) as {
      id: string;
      email: string;
      user_id: string | null;
      created_at: string;
    }[]).map((m) => {
      const u = userByEmail.get(m.email);
      return {
        ...m,
        registered: Boolean(m.user_id || u?.id),
        display_name: u?.display_name ?? null,
      };
    }),
    grants: ((grants ?? []) as unknown as {
      id: string;
      project_id: string;
      role: string;
      created_at: string;
      projects: { name: string } | null;
    }[]).map((g) => ({
      id: g.id,
      project_id: g.project_id,
      role: g.role,
      created_at: g.created_at,
      project_name: g.projects?.name ?? null,
    })),
  });
});

// ── POST /groups/:id/members — bulk add ──────────────────────────────────────

groupsRouter.post("/:id/members", async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data: group } = await db
    .from("user_groups")
    .select("id, name")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!group) return void res.status(404).json({ detail: "Group not found" });

  const { valid, invalid } = parseEmails(req.body?.emails);
  if (valid.length === 0)
    return void res
      .status(400)
      .json({ detail: "No valid email addresses supplied", invalid });
  if (valid.length > 500)
    return void res
      .status(400)
      .json({ detail: "At most 500 emails per import" });

  // Resolve already-registered users so user_id is set immediately.
  const { userByEmail } = await loadProfileUsersByEmail(db);
  const rows = valid.map((email) => ({
    group_id: req.params.id,
    email,
    user_id: userByEmail.get(email)?.id ?? null,
    added_by: userId,
  }));
  const { error } = await db
    .from("user_group_members")
    .upsert(rows, { onConflict: "group_id,email", ignoreDuplicates: true });
  if (error) return void res.status(500).json({ detail: error.message });

  recordAudit({
    actorId: userId,
    eventType: "member_change",
    resourceType: "group",
    resourceId: req.params.id,
    detail: { action: "bulk_add", count: valid.length, invalid },
  });
  res.json({ ok: true, added: valid.length, invalid });
});

// ── POST /groups/:id/invite — email a Supabase invite to unregistered members ─
//
// Match-on-signup means members can exist without accounts. This sends a
// set-password invite to every member who doesn't yet have an account, so a
// whole cohort can be onboarded in one click. Already-registered members are
// skipped. Note: delivery depends on the Supabase project's email config —
// the built-in SMTP is heavily rate-limited, so configure custom SMTP for a
// full class.

groupsRouter.post("/:id/invite", async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();

  const { data: group } = await db
    .from("user_groups")
    .select("id, name")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!group) return void res.status(404).json({ detail: "Group not found" });

  const { data: members } = await db
    .from("user_group_members")
    .select("email, user_id")
    .eq("group_id", req.params.id);
  const rows = (members ?? []) as { email: string; user_id: string | null }[];

  // Target = members without an account yet (registered ones already have one).
  const { userByEmail } = await loadProfileUsersByEmail(db);
  const targets = rows
    .map((m) => m.email)
    .filter((email) => !userByEmail.has(email));

  const redirectTo = `${frontendBaseUrl()}/login`;
  let invited = 0;
  const alreadyRegistered: string[] = [];
  const failed: { email: string; reason: string }[] = [];

  for (const email of targets) {
    const { error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        alreadyRegistered.push(email);
      } else {
        failed.push({ email, reason: error.message });
      }
      continue;
    }
    invited += 1;
    // Record for admin visibility (best-effort; ignore dupes).
    await db.from("invitations").insert({ email, invited_by: userId });
  }

  recordAudit({
    actorId: userId,
    eventType: "member_change",
    resourceType: "group",
    resourceId: req.params.id,
    detail: {
      action: "bulk_invite",
      invited,
      already_registered: alreadyRegistered.length,
      failed: failed.length,
    },
  });

  res.json({
    ok: true,
    invited,
    skipped_registered: alreadyRegistered.length,
    failed,
  });
});

// ── DELETE /groups/:id/members/:memberId ─────────────────────────────────────

groupsRouter.delete("/:id/members/:memberId", async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { error } = await db
    .from("user_group_members")
    .delete()
    .eq("group_id", req.params.id)
    .eq("id", req.params.memberId);
  if (error) return void res.status(500).json({ detail: error.message });
  recordAudit({
    actorId: userId,
    eventType: "member_change",
    resourceType: "group",
    resourceId: req.params.id,
    detail: { action: "remove_member", member: req.params.memberId },
  });
  res.json({ ok: true });
});
