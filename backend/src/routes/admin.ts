/**
 * /admin — Collaboration portal endpoints.
 *
 * All routes require authentication AND admin status (is_admin = true in
 * user_profiles). Non-admin requests receive 403.
 *
 * Routes:
 *   GET    /admin/users              List all registered users
 *   DELETE /admin/users/:userId      Remove a user (cannot remove self)
 *   POST   /admin/invite             Invite a new user by email
 *   GET    /admin/invitations        List pending (unaccepted) invitations
 *   DELETE /admin/invitations/:id    Revoke a pending invitation
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { frontendBaseUrl } from "../lib/urls";
import {
  APP_SETTING_KEYS,
  getAppSetting,
  getJadeAccessApproved,
  setAppSetting,
} from "../lib/appSettings";

export const adminRouter = Router();

// ── Admin check middleware ────────────────────────────────────────────────────

async function requireAdmin(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.is_admin) {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  next();
}

adminRouter.use(requireAuth, requireAdmin);

// ── GET /admin/users ──────────────────────────────────────────────────────────

adminRouter.get("/users", async (req, res) => {
  const db = createServerSupabase();

  // List all auth users via admin API
  const { data: authData, error: authError } =
    await db.auth.admin.listUsers({ perPage: 1000 });
  if (authError) {
    return void res.status(500).json({ detail: authError.message });
  }

  // Pull display names and is_admin flags from user_profiles
  const { data: profiles } = await db
    .from("user_profiles")
    .select("user_id, display_name, is_admin");

  const profileMap = new Map<string, { display_name: string | null; is_admin: boolean }>(
    (profiles ?? []).map((p: { user_id: string; display_name: string | null; is_admin: boolean }) => [
      p.user_id,
      { display_name: p.display_name, is_admin: p.is_admin ?? false },
    ]),
  );

  const users = authData.users.map((u) => {
    const prof = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: prof?.display_name ?? null,
      isAdmin: prof?.is_admin ?? false,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      confirmedAt: u.confirmed_at ?? null,
    };
  });

  // Most recently created first
  users.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  res.json({ users });
});

// ── DELETE /admin/users/:userId ───────────────────────────────────────────────

adminRouter.delete("/users/:userId", async (req, res) => {
  const targetId = req.params.userId;
  const selfId = res.locals.userId as string;

  if (targetId === selfId) {
    return void res
      .status(400)
      .json({ detail: "You cannot remove your own account." });
  }

  const db = createServerSupabase();
  const { error } = await db.auth.admin.deleteUser(targetId);
  if (error) {
    return void res.status(500).json({ detail: error.message });
  }

  res.json({ ok: true });
});

// ── POST /admin/invite ────────────────────────────────────────────────────────

adminRouter.post("/invite", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return void res.status(400).json({ detail: "A valid email address is required." });
  }

  const db = createServerSupabase();
  const selfId = res.locals.userId as string;

  // Send invitation email via Supabase Auth admin API
  const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${frontendBaseUrl()}/login`,
  });

  if (inviteError) {
    // "User already registered" is not a failure — just inform the caller
    if (inviteError.message.toLowerCase().includes("already")) {
      return void res
        .status(409)
        .json({ detail: "A user with this email already exists." });
    }
    return void res.status(500).json({ detail: inviteError.message });
  }

  // Record the invitation for admin visibility
  await db.from("invitations").insert({
    email,
    invited_by: selfId,
  });

  res.json({ ok: true, message: `Invitation sent to ${email}` });
});

// ── GET /admin/invitations ────────────────────────────────────────────────────

adminRouter.get("/invitations", async (_req, res) => {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("invitations")
    .select("id, email, accepted_at, created_at")
    .is("accepted_at", null) // pending only
    .order("created_at", { ascending: false });

  if (error) {
    return void res.status(500).json({ detail: error.message });
  }

  res.json({ invitations: data ?? [] });
});

// ── DELETE /admin/invitations/:id ─────────────────────────────────────────────

adminRouter.delete("/invitations/:id", async (req, res) => {
  const db = createServerSupabase();
  const { error } = await db
    .from("invitations")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    return void res.status(500).json({ detail: error.message });
  }

  res.json({ ok: true });
});

// ── GET /admin/settings ───────────────────────────────────────────────────────
// Shared instance settings.

adminRouter.get("/settings", async (_req, res) => {
  const jadeAccessApproved = await getJadeAccessApproved();
  const orgContext = await getAppSetting<string>("org_context", "");
  res.json({ jadeAccessApproved, orgContext });
});

// ── PUT /admin/settings ───────────────────────────────────────────────────────

adminRouter.put("/settings", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const updates: Record<string, unknown> = {};
  if (typeof body.jadeAccessApproved === "boolean") {
    await setAppSetting(
      APP_SETTING_KEYS.jadeAccessApproved,
      body.jadeAccessApproved,
      res.locals.userId as string,
    );
    updates.jadeAccessApproved = body.jadeAccessApproved;
  }
  // C033 — org-wide context applied to drafting/review/redline prompts.
  if (typeof body.orgContext === "string") {
    await setAppSetting(
      "org_context",
      body.orgContext.slice(0, 20_000),
      res.locals.userId as string,
    );
    updates.orgContext = body.orgContext.slice(0, 20_000);
  }
  if (Object.keys(updates).length === 0) {
    return void res
      .status(400)
      .json({ detail: "No recognised settings in body" });
  }
  res.json(updates);
});

// ── GET /admin/costs ──────────────────────────────────────────────────────────
// Returns aggregate totals + paginated line-item breakdown.

adminRouter.get("/costs", async (req, res) => {
  const db = createServerSupabase();
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;

  // Totals across all queries
  const { data: totals, error: totalsError } = await db
    .from("query_costs")
    .select("cost_usd, cost_aud, input_tokens, output_tokens");

  if (totalsError) {
    return void res.status(500).json({ detail: totalsError.message });
  }

  let totalUsd = 0;
  let totalAud = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalQueries = 0;
  for (const row of (totals ?? []) as { cost_usd: number; cost_aud: number; input_tokens: number; output_tokens: number }[]) {
    totalUsd += row.cost_usd;
    totalAud += row.cost_aud;
    totalInputTokens += row.input_tokens;
    totalOutputTokens += row.output_tokens;
    totalQueries++;
  }

  // Line-item breakdown (paginated, most recent first)
  const { data: rows, error: rowsError } = await db
    .from("query_costs")
    .select("id, user_id, chat_id, model, input_tokens, output_tokens, cost_usd, cost_aud, aud_rate, source, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (rowsError) {
    return void res.status(500).json({ detail: rowsError.message });
  }

  // Enrich with user emails
  const { data: authData } = await db.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const lineItems = (rows ?? []).map((r: {
    id: string; user_id: string; chat_id: string | null; model: string;
    input_tokens: number; output_tokens: number; cost_usd: number; cost_aud: number;
    aud_rate: number; source: string; created_at: string;
  }) => ({
    ...r,
    userEmail: emailById.get(r.user_id) ?? r.user_id,
  }));

  res.json({
    totals: {
      totalQueries,
      totalUsd,
      totalAud,
      totalInputTokens,
      totalOutputTokens,
    },
    lineItems,
    offset,
    limit,
  });
});

// ---------------------------------------------------------------------------
// P3 (C019) — audit trail viewer.
// GET /admin/audit?user=<uuid>&project=<uuid>&tool=<name>&type=<event_type>
//                 &from=<iso>&to=<iso>&limit=<n>&format=csv
// ---------------------------------------------------------------------------
adminRouter.get("/audit", async (req, res) => {
  const db = createServerSupabase();
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1),
    1000,
  );
  let query = db
    .from("audit_events")
    .select(
      "id, actor_id, project_id, event_type, resource_type, resource_id, tool_name, detail, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (typeof req.query.user === "string" && req.query.user)
    query = query.eq("actor_id", req.query.user);
  if (typeof req.query.project === "string" && req.query.project)
    query = query.eq("project_id", req.query.project);
  if (typeof req.query.tool === "string" && req.query.tool)
    query = query.eq("tool_name", req.query.tool);
  if (typeof req.query.type === "string" && req.query.type)
    query = query.eq("event_type", req.query.type);
  if (typeof req.query.from === "string" && req.query.from)
    query = query.gte("created_at", req.query.from);
  if (typeof req.query.to === "string" && req.query.to)
    query = query.lte("created_at", req.query.to);

  const { data, error } = await query;
  if (error) return void res.status(500).json({ detail: error.message });
  const rows = data ?? [];

  // Resolve actor emails for display.
  const { data: profiles } = await db
    .from("user_profiles")
    .select("user_id, email");
  const emailById = new Map<string, string>(
    (profiles ?? []).map((p: { user_id: string; email: string | null }) => [
      p.user_id,
      p.email ?? p.user_id,
    ]),
  );
  const enriched = rows.map((r) => ({
    ...r,
    actor_email: emailById.get(r.actor_id as string) ?? r.actor_id,
  }));

  if (req.query.format === "csv") {
    const header =
      "created_at,actor_email,event_type,resource_type,resource_id,tool_name,project_id,detail";
    const lines = enriched.map((r) =>
      [
        r.created_at,
        r.actor_email,
        r.event_type,
        r.resource_type ?? "",
        r.resource_id ?? "",
        r.tool_name ?? "",
        r.project_id ?? "",
        JSON.stringify(r.detail ?? {}),
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="mike-audit.csv"',
    );
    return void res.send([header, ...lines].join("\n"));
  }
  res.json({ events: enriched });
});


// ---------------------------------------------------------------------------
// C036 — workspace knowledge management: every playbook, KB document and
// clause across all users, with owner + counts.
// ---------------------------------------------------------------------------
adminRouter.get("/knowledge", async (_req, res) => {
  const db = createServerSupabase();
  const [{ data: playbooks }, { data: rules }, { data: kbDocs }, { data: kbChunks }, { data: clauses }, { data: profiles }] =
    await Promise.all([
      db.from("playbooks").select("id, owner_id, name, agreement_type, description, updated_at"),
      db.from("playbook_rules").select("playbook_id"),
      db.from("kb_documents").select("id, owner_id, title, doc_type, source, created_at"),
      db.from("kb_chunks").select("document_id"),
      db.from("clauses").select("id, owner_id, title, agreement_type, created_at"),
      db.from("user_profiles").select("user_id, email, display_name"),
    ]);
  const emailById = new Map<string, string>(
    (profiles ?? []).map((p: { user_id: string; email: string | null }) => [
      p.user_id,
      p.email ?? p.user_id,
    ]),
  );
  const ruleCounts = new Map<string, number>();
  for (const r of rules ?? []) {
    ruleCounts.set(r.playbook_id as string, (ruleCounts.get(r.playbook_id as string) ?? 0) + 1);
  }
  const chunkCounts = new Map<string, number>();
  for (const c of kbChunks ?? []) {
    chunkCounts.set(c.document_id as string, (chunkCounts.get(c.document_id as string) ?? 0) + 1);
  }
  res.json({
    playbooks: (playbooks ?? []).map((p) => ({
      ...p,
      owner_email: emailById.get(p.owner_id as string) ?? p.owner_id,
      rule_count: ruleCounts.get(p.id as string) ?? 0,
    })),
    kb_documents: (kbDocs ?? []).map((d) => ({
      ...d,
      owner_email: emailById.get(d.owner_id as string) ?? d.owner_id,
      chunk_count: chunkCounts.get(d.id as string) ?? 0,
    })),
    clauses: (clauses ?? []).map((c) => ({
      ...c,
      owner_email: emailById.get(c.owner_id as string) ?? c.owner_id,
    })),
  });
});

// ---------------------------------------------------------------------------
// C004 — Command Center: adoption analytics + cohort comparison.
// GET /admin/analytics?days=30
// ---------------------------------------------------------------------------
adminRouter.get("/analytics", async (req, res) => {
  const db = createServerSupabase();
  const days = Math.min(
    Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1),
    365,
  );
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: costs }, { data: audits }, { data: profiles }] =
    await Promise.all([
      db
        .from("query_costs")
        .select("user_id, project_id, model, source, input_tokens, output_tokens, cost_aud, created_at")
        .gte("created_at", since)
        .limit(20000),
      db
        .from("audit_events")
        .select("actor_id, event_type, tool_name, created_at")
        .gte("created_at", since)
        .limit(20000),
      db.from("user_profiles").select("user_id, email, cohort"),
    ]);

  const cohortByUser = new Map<string, string>(
    (profiles ?? []).map((p: { user_id: string; cohort: string | null }) => [
      p.user_id,
      p.cohort ?? "(no cohort)",
    ]),
  );

  const day = (iso: string) => iso.slice(0, 10);
  const activeByWindow = (windowDays: number) => {
    const cutoff = Date.now() - windowDays * 86_400_000;
    const users = new Set<string>();
    for (const r of costs ?? []) {
      if (Date.parse(r.created_at as string) >= cutoff)
        users.add(r.user_id as string);
    }
    for (const a of audits ?? []) {
      if (Date.parse(a.created_at as string) >= cutoff)
        users.add(a.actor_id as string);
    }
    return users.size;
  };

  const costByDay = new Map<string, number>();
  const costByModel = new Map<string, { costAud: number; calls: number }>();
  const costBySource = new Map<string, { costAud: number; calls: number }>();
  // C077 — per-project consumption (rows without project attribution group
  // under "(no project)").
  const costByProject = new Map<string, { costAud: number; calls: number }>();
  const byCohort = new Map<
    string,
    { users: Set<string>; costAud: number; calls: number }
  >();
  for (const r of costs ?? []) {
    const d = day(r.created_at as string);
    const aud = Number(r.cost_aud) || 0;
    costByDay.set(d, (costByDay.get(d) ?? 0) + aud);
    const model = (r.model as string) ?? "unknown";
    const m = costByModel.get(model) ?? { costAud: 0, calls: 0 };
    m.costAud += aud;
    m.calls += 1;
    costByModel.set(model, m);
    const source = (r.source as string) ?? "unknown";
    const s = costBySource.get(source) ?? { costAud: 0, calls: 0 };
    s.costAud += aud;
    s.calls += 1;
    costBySource.set(source, s);
    const project = (r.project_id as string | null) ?? "(no project)";
    const p = costByProject.get(project) ?? { costAud: 0, calls: 0 };
    p.costAud += aud;
    p.calls += 1;
    costByProject.set(project, p);
    const cohort = cohortByUser.get(r.user_id as string) ?? "(no cohort)";
    const c = byCohort.get(cohort) ?? {
      users: new Set<string>(),
      costAud: 0,
      calls: 0,
    };
    c.users.add(r.user_id as string);
    c.costAud += aud;
    c.calls += 1;
    byCohort.set(cohort, c);
  }

  const toolUsage = new Map<string, number>();
  const eventTypes = new Map<string, number>();
  for (const a of audits ?? []) {
    if (a.tool_name)
      toolUsage.set(
        a.tool_name as string,
        (toolUsage.get(a.tool_name as string) ?? 0) + 1,
      );
    eventTypes.set(
      a.event_type as string,
      (eventTypes.get(a.event_type as string) ?? 0) + 1,
    );
  }

  res.json({
    windowDays: days,
    activeUsers: { d7: activeByWindow(7), d30: activeByWindow(30) },
    totalCostAud: [...costByDay.values()].reduce((a, b) => a + b, 0),
    costByDay: [...costByDay.entries()]
      .sort()
      .map(([date, costAud]) => ({ date, costAud })),
    costByModel: [...costByModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.costAud - a.costAud),
    costBySource: [...costBySource.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.costAud - a.costAud),
    costByProject: [...costByProject.entries()]
      .map(([projectId, v]) => ({ projectId, ...v }))
      .sort((a, b) => b.costAud - a.costAud)
      .slice(0, 25),
    toolUsage: [...toolUsage.entries()]
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    eventTypes: [...eventTypes.entries()].map(([type, count]) => ({
      type,
      count,
    })),
    cohorts: [...byCohort.entries()]
      .map(([cohort, v]) => ({
        cohort,
        users: v.users.size,
        costAud: v.costAud,
        calls: v.calls,
      }))
      .sort((a, b) => b.costAud - a.costAud),
  });
});

// PATCH /admin/users/:userId/cohort { cohort } — C004 cohort tagging.
adminRouter.patch("/users/:userId/cohort", async (req, res) => {
  const db = createServerSupabase();
  const cohort =
    typeof req.body?.cohort === "string" && req.body.cohort.trim()
      ? req.body.cohort.trim().slice(0, 100)
      : null;
  const { error } = await db
    .from("user_profiles")
    .update({ cohort })
    .eq("user_id", req.params.userId);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ ok: true, cohort });
});
