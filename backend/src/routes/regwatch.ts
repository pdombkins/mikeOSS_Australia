/**
 * C018 — Regulatory monitoring API.
 *   GET    /regwatch/sources        — curated official feed list
 *   GET    /regwatch                — caller's watches (+ unseen counts)
 *   POST   /regwatch                — create watch
 *   PATCH  /regwatch/:id            — update watch (topics/sources/active)
 *   DELETE /regwatch/:id            — delete watch
 *   GET    /regwatch/:id/events     — events feed
 *   POST   /regwatch/:id/events/seen — mark all events seen
 *   POST   /regwatch/scan           — manual scan trigger
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { REG_SOURCES } from "../lib/regwatch/sources";
import { runRegwatchScan } from "../lib/regwatch/scan";

export const regwatchRouter = Router();

function strArray(v: unknown): string[] {
  return Array.isArray(v)
    ? (v as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
}

regwatchRouter.get("/sources", requireAuth, (_req, res) => {
  res.json({ sources: REG_SOURCES });
});

regwatchRouter.get("/", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data: watches, error } = await db
    .from("regulatory_watches")
    .select("id, name, topics, jurisdictions, sources, active, created_at")
    .eq("owner_id", res.locals.userId)
    .order("created_at", { ascending: true });
  if (error) return void res.status(500).json({ detail: error.message });
  const ids = (watches ?? []).map((w) => w.id as string);
  const newCounts = new Map<string, number>();
  if (ids.length) {
    const { data: events } = await db
      .from("regulatory_events")
      .select("watch_id")
      .in("watch_id", ids)
      .eq("status", "new");
    for (const e of events ?? []) {
      newCounts.set(
        e.watch_id as string,
        (newCounts.get(e.watch_id as string) ?? 0) + 1,
      );
    }
  }
  res.json({
    watches: (watches ?? []).map((w) => ({
      ...w,
      new_count: newCounts.get(w.id as string) ?? 0,
    })),
  });
});

regwatchRouter.post("/", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return void res.status(400).json({ detail: "name is required" });
  const validSources = new Set(REG_SOURCES.map((s) => s.id));
  const { data, error } = await db
    .from("regulatory_watches")
    .insert({
      owner_id: res.locals.userId,
      name,
      topics: strArray(req.body?.topics),
      jurisdictions: strArray(req.body?.jurisdictions),
      sources: strArray(req.body?.sources).filter((s) => validSources.has(s)),
    })
    .select("*")
    .single();
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(201).json({ watch: data });
});

regwatchRouter.patch("/:id", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.name === "string" && req.body.name.trim())
    updates.name = req.body.name.trim();
  if (req.body?.topics !== undefined) updates.topics = strArray(req.body.topics);
  if (req.body?.jurisdictions !== undefined)
    updates.jurisdictions = strArray(req.body.jurisdictions);
  if (req.body?.sources !== undefined) {
    const validSources = new Set(REG_SOURCES.map((s) => s.id));
    updates.sources = strArray(req.body.sources).filter((s) =>
      validSources.has(s),
    );
  }
  if (typeof req.body?.active === "boolean") updates.active = req.body.active;
  const { error } = await db
    .from("regulatory_watches")
    .update(updates)
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ ok: true });
});

regwatchRouter.delete("/:id", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  await db
    .from("regulatory_watches")
    .delete()
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId);
  res.json({ ok: true });
});

regwatchRouter.get("/:id/events", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: watch } = await db
    .from("regulatory_watches")
    .select("id")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!watch) return void res.status(404).json({ detail: "Watch not found" });
  const { data } = await db
    .from("regulatory_events")
    .select("*")
    .eq("watch_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(200);
  res.json({ events: data ?? [] });
});

regwatchRouter.post("/:id/events/seen", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: watch } = await db
    .from("regulatory_watches")
    .select("id")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!watch) return void res.status(404).json({ detail: "Watch not found" });
  await db
    .from("regulatory_events")
    .update({ status: "seen" })
    .eq("watch_id", req.params.id)
    .eq("status", "new");
  res.json({ ok: true });
});

regwatchRouter.post("/scan", requireAuth, async (_req, res) => {
  try {
    const result = await runRegwatchScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Scan failed",
    });
  }
});
