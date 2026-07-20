/**
 * C007 — Personal access token management for the Mike MCP server.
 * Tokens are shown once at creation; only sha256 hashes are stored.
 */
import crypto from "crypto";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { recordAudit } from "../lib/audit";

export const patsRouter = Router();

patsRouter.get("/", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data } = await db
    .from("user_pats")
    .select("id, name, last_used_at, revoked_at, created_at")
    .eq("user_id", res.locals.userId)
    .order("created_at", { ascending: false });
  res.json({ tokens: data ?? [] });
});

patsRouter.post("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const name =
    typeof req.body?.name === "string" && req.body.name.trim()
      ? req.body.name.trim().slice(0, 100)
      : "MCP token";
  const token = `mike_pat_${crypto.randomBytes(24).toString("hex")}`;
  const { data, error } = await db
    .from("user_pats")
    .insert({
      user_id: userId,
      name,
      token_hash: crypto.createHash("sha256").update(token).digest("hex"),
    })
    .select("id, name, created_at")
    .single();
  if (error) return void res.status(500).json({ detail: error.message });
  recordAudit({
    actorId: userId,
    eventType: "member_change",
    detail: { action: "pat_created", name },
  });
  // The plaintext token is returned exactly once.
  res.status(201).json({ token, pat: data });
});

patsRouter.delete("/:id", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  await db
    .from("user_pats")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", res.locals.userId);
  recordAudit({
    actorId: res.locals.userId as string,
    eventType: "member_change",
    detail: { action: "pat_revoked", id: req.params.id },
  });
  res.json({ ok: true });
});
