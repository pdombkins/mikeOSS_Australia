/**
 * P2 — Notifications API. In-app bell feed + mark-read.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";

export const notificationsRouter = Router();

// GET /notifications?unread=1 — latest notifications for the caller.
notificationsRouter.get("/", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  let query = db
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .eq("user_id", res.locals.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (req.query.unread === "1") query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", res.locals.userId)
    .is("read_at", null);
  res.json({ notifications: data ?? [], unreadCount: count ?? 0 });
});

// POST /notifications/read { ids?: string[] } — mark given ids (or all) read.
notificationsRouter.post("/read", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : null;
  let query = db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", res.locals.userId)
    .is("read_at", null);
  if (ids && ids.length > 0) query = query.in("id", ids);
  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});
