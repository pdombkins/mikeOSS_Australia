/**
 * Playbooks CRUD — Mike (Australia).
 *
 * Manages the `playbooks` + `playbook_rules` tables that back the assistant's
 * `list_playbooks` / `review_against_playbook` tools. Owner-scoped by the
 * authenticated user (owner_id = auth user id). Backend uses the service role,
 * which bypasses RLS, so every query is explicitly filtered by owner_id.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { parseCsvRecords } from "../lib/csv";
import { recordAudit } from "../lib/audit";

export const playbooksRouter = Router();

type Db = ReturnType<typeof createServerSupabase>;

const SEVERITIES = new Set(["low", "medium", "high"]);

interface IncomingRule {
  topic?: unknown;
  preferred?: unknown;
  acceptable_fallback?: unknown;
  dealbreaker?: unknown;
  severity?: unknown;
  notes?: unknown;
}

function str(v: unknown, max = 8000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function normalizeRules(raw: unknown): {
  topic: string;
  preferred: string | null;
  acceptable_fallback: string | null;
  dealbreaker: string | null;
  severity: string;
  notes: string | null;
  position: number;
}[] {
  if (!Array.isArray(raw)) return [];
  const rules: ReturnType<typeof normalizeRules> = [];
  raw.forEach((r: IncomingRule, i) => {
    const topic = str(r?.topic, 300);
    if (!topic) return; // a rule with no topic is dropped
    const severityRaw = typeof r?.severity === "string" ? r.severity.toLowerCase() : "medium";
    rules.push({
      topic,
      preferred: str(r?.preferred),
      acceptable_fallback: str(r?.acceptable_fallback),
      dealbreaker: str(r?.dealbreaker),
      severity: SEVERITIES.has(severityRaw) ? severityRaw : "medium",
      notes: str(r?.notes),
      position: i,
    });
  });
  return rules;
}

async function loadPlaybookWithRules(db: Db, ownerId: string, id: string) {
  const { data: pb, error } = await db
    .from("playbooks")
    .select("id, name, agreement_type, description, created_at, updated_at")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pb) return null;
  const { data: rules, error: rErr } = await db
    .from("playbook_rules")
    .select(
      "id, topic, preferred, acceptable_fallback, dealbreaker, severity, notes, position",
    )
    .eq("playbook_id", (pb as { id: string }).id)
    .order("position");
  if (rErr) throw new Error(rErr.message);
  return { ...(pb as object), rules: rules ?? [] };
}

/** Replace the full rule set for a playbook (delete-then-insert, kept simple). */
async function replaceRules(db: Db, ownerId: string, playbookId: string, rulesRaw: unknown) {
  const rules = normalizeRules(rulesRaw);
  const { error: delErr } = await db
    .from("playbook_rules")
    .delete()
    .eq("playbook_id", playbookId);
  if (delErr) throw new Error(delErr.message);
  if (rules.length === 0) return;
  const rows = rules.map((r) => ({ ...r, playbook_id: playbookId, owner_id: ownerId }));
  const { error: insErr } = await db.from("playbook_rules").insert(rows);
  if (insErr) throw new Error(insErr.message);
}

// GET /playbooks — list all playbooks (with rule counts) for the user.
playbooksRouter.get("/", requireAuth, async (_req, res) => {
  const ownerId = res.locals.userId as string;
  const db = createServerSupabase();
  const { data, error } = await db
    .from("playbooks")
    .select(
      "id, name, agreement_type, description, created_at, updated_at, playbook_rules(count)",
    )
    .eq("owner_id", ownerId)
    .order("name");
  if (error) return void res.status(500).json({ detail: error.message });
  const playbooks = (data ?? []).map((p) => {
    const row = p as {
      id: string;
      name: string;
      agreement_type: string | null;
      description: string | null;
      created_at: string;
      updated_at: string;
      playbook_rules?: { count: number }[];
    };
    return {
      id: row.id,
      name: row.name,
      agreement_type: row.agreement_type,
      description: row.description,
      created_at: row.created_at,
      updated_at: row.updated_at,
      rule_count: row.playbook_rules?.[0]?.count ?? 0,
    };
  });
  res.json({ playbooks });
});

// GET /playbooks/:id — one playbook with its rules.
playbooksRouter.get("/:id", requireAuth, async (req, res) => {
  const ownerId = res.locals.userId as string;
  const db = createServerSupabase();
  try {
    const pb = await loadPlaybookWithRules(db, ownerId, req.params.id);
    if (!pb) return void res.status(404).json({ detail: "Playbook not found" });
    res.json({ playbook: pb });
  } catch (err) {
    res.status(500).json({ detail: (err as Error).message });
  }
});

// POST /playbooks — create a playbook (optionally with rules).
playbooksRouter.post("/", requireAuth, async (req, res) => {
  const ownerId = res.locals.userId as string;
  const name = str(req.body?.name, 200);
  if (!name) return void res.status(400).json({ detail: "A playbook name is required." });
  const db = createServerSupabase();
  const { data, error } = await db
    .from("playbooks")
    .insert({
      owner_id: ownerId,
      name,
      agreement_type: str(req.body?.agreement_type, 100),
      description: str(req.body?.description, 2000),
    })
    .select("id")
    .single();
  if (error) {
    const conflict = error.code === "23505";
    return void res
      .status(conflict ? 409 : 500)
      .json({ detail: conflict ? "You already have a playbook with that name." : error.message });
  }
  const id = (data as { id: string }).id;
  try {
    await replaceRules(db, ownerId, id, req.body?.rules);
    const pb = await loadPlaybookWithRules(db, ownerId, id);
    res.status(201).json({ playbook: pb });
  } catch (err) {
    res.status(500).json({ detail: (err as Error).message });
  }
});

// PUT /playbooks/:id — update a playbook and replace its rules.
playbooksRouter.put("/:id", requireAuth, async (req, res) => {
  const ownerId = res.locals.userId as string;
  const id = req.params.id;
  const name = str(req.body?.name, 200);
  if (!name) return void res.status(400).json({ detail: "A playbook name is required." });
  const db = createServerSupabase();

  const { data: existing } = await db
    .from("playbooks")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  if (!existing) return void res.status(404).json({ detail: "Playbook not found" });

  const { error } = await db
    .from("playbooks")
    .update({
      name,
      agreement_type: str(req.body?.agreement_type, 100),
      description: str(req.body?.description, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId)
    .eq("id", id);
  if (error) {
    const conflict = error.code === "23505";
    return void res
      .status(conflict ? 409 : 500)
      .json({ detail: conflict ? "You already have a playbook with that name." : error.message });
  }
  try {
    if (req.body?.rules !== undefined) {
      await replaceRules(db, ownerId, id, req.body.rules);
    }
    const pb = await loadPlaybookWithRules(db, ownerId, id);
    res.json({ playbook: pb });
  } catch (err) {
    res.status(500).json({ detail: (err as Error).message });
  }
});

// POST /playbooks/:id/rules/import — C079 bulk CSV import (append, ≤500 rows).
// Body: { csv: string }
// CSV columns: topic*, preferred, acceptable_fallback, dealbreaker,
//              severity (low|medium|high), notes.
playbooksRouter.post("/:id/rules/import", requireAuth, async (req, res) => {
  const ownerId = res.locals.userId as string;
  const id = req.params.id;
  const db = createServerSupabase();

  const { data: existing } = await db
    .from("playbooks")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle();
  if (!existing) return void res.status(404).json({ detail: "Playbook not found" });

  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  if (!csv.trim()) return void res.status(400).json({ detail: "csv is required" });
  const parsed = parseCsvRecords(csv);
  if (!parsed || parsed.records.length === 0)
    return void res
      .status(400)
      .json({ detail: "CSV has no data rows (a header row is required)" });
  if (!parsed.headers.includes("topic"))
    return void res.status(400).json({ detail: 'CSV must have a "topic" column' });
  if (parsed.records.length > 500)
    return void res
      .status(400)
      .json({ detail: `Too many rows (${parsed.records.length}); maximum is 500` });

  const skipped: { row: number; reason: string }[] = [];
  const candidate = parsed.records
    .map((rec, i) => ({ rec, row: i + 1 }))
    .filter(({ rec, row }) => {
      if (!rec.topic) {
        skipped.push({ row, reason: "missing topic" });
        return false;
      }
      return true;
    });

  // Append after the current max position instead of replacing.
  const { data: maxRow } = await db
    .from("playbook_rules")
    .select("position")
    .eq("playbook_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (maxRow?.position ?? -1) + 1;

  const rules = normalizeRules(candidate.map(({ rec }) => rec)).map((r, i) => ({
    ...r,
    position: base + i,
    playbook_id: id,
    owner_id: ownerId,
  }));
  if (rules.length > 0) {
    const { error: insErr } = await db.from("playbook_rules").insert(rules);
    if (insErr) return void res.status(500).json({ detail: insErr.message });
  }
  recordAudit({
    actorId: ownerId,
    eventType: "doc_edit",
    resourceType: "playbook",
    resourceId: id,
    detail: { action: "bulk_import_rules", imported: rules.length, skipped: skipped.length },
  });
  try {
    const pb = await loadPlaybookWithRules(db, ownerId, id);
    res.json({ imported: rules.length, skipped, playbook: pb });
  } catch (err) {
    res.status(500).json({ detail: (err as Error).message });
  }
});

// DELETE /playbooks/:id — remove a playbook (rules cascade).
playbooksRouter.delete("/:id", requireAuth, async (req, res) => {
  const ownerId = res.locals.userId as string;
  const db = createServerSupabase();
  const { error } = await db
    .from("playbooks")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", req.params.id);
  if (error) return void res.status(500).json({ detail: error.message });
  res.status(204).end();
});
