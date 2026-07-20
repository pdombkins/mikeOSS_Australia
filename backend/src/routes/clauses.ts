/**
 * C026 — My Clauses REST API (Library → Clauses tab).
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { saveClause, searchClauses } from "../lib/clauses";
import { getUserApiKeys } from "../lib/userApiKeys";
import { recordAudit } from "../lib/audit";

export const clausesRouter = Router();

// GET /clauses?q=<query>&agreement_type=<t>
clausesRouter.get("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    const apiKeys = await getUserApiKeys(userId, db);
    const results = await searchClauses(db, userId, q, {
      k: 20,
      agreementType:
        typeof req.query.agreement_type === "string"
          ? req.query.agreement_type
          : null,
      apiKeys,
    });
    return void res.json({ clauses: results });
  }
  const { data, error } = await db
    .from("clauses")
    .select(
      "id, title, agreement_type, body, guidance, tags, source_document_id, project_id, created_at",
    )
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ clauses: data ?? [] });
});

// POST /clauses
clausesRouter.post("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!title || !body)
    return void res.status(400).json({ detail: "title and body are required" });
  try {
    const apiKeys = await getUserApiKeys(userId, db);
    const clause = await saveClause(
      db,
      userId,
      {
        title,
        body,
        agreement_type:
          typeof req.body?.agreement_type === "string"
            ? req.body.agreement_type
            : null,
        guidance:
          typeof req.body?.guidance === "string" ? req.body.guidance : null,
        tags: Array.isArray(req.body?.tags)
          ? (req.body.tags as unknown[]).filter(
              (t): t is string => typeof t === "string",
            )
          : [],
        source_document_id:
          typeof req.body?.source_document_id === "string"
            ? req.body.source_document_id
            : null,
      },
      apiKeys,
    );
    recordAudit({
      actorId: userId,
      eventType: "doc_edit",
      resourceType: "clause",
      resourceId: clause.id,
      detail: { action: "create", title },
    });
    res.status(201).json({ clause });
  } catch (err) {
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Failed to save clause",
    });
  }
});

// PUT /clauses/:id — update text fields (re-embedding skipped for simplicity;
// title/body edits re-embed by delete+recreate in the UI if needed).
clausesRouter.put("/:id", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const field of ["title", "body", "guidance", "agreement_type"]) {
    if (typeof req.body?.[field] === "string") updates[field] = req.body[field];
  }
  if (Array.isArray(req.body?.tags)) {
    updates.tags = (req.body.tags as unknown[]).filter(
      (t): t is string => typeof t === "string",
    );
  }
  const { error } = await db
    .from("clauses")
    .update(updates)
    .eq("id", req.params.id)
    .eq("owner_id", userId);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ ok: true });
});

// DELETE /clauses/:id
clausesRouter.delete("/:id", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const { error } = await db
    .from("clauses")
    .delete()
    .eq("id", req.params.id)
    .eq("owner_id", userId);
  if (error) return void res.status(500).json({ detail: error.message });
  recordAudit({
    actorId: userId,
    eventType: "doc_edit",
    resourceType: "clause",
    resourceId: req.params.id,
    detail: { action: "delete" },
  });
  res.json({ ok: true });
});
