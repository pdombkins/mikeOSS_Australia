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
    redirectTo: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login`,
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
