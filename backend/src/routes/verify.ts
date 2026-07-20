/**
 * C024 — Deep-verify API.
 *   POST  /verify                       { text } → run verification, return report
 *   GET   /verify                       → list caller's reports
 *   GET   /verify/:id                   → report + assertions
 *   PATCH /verify/:id/assertions/:aid   { verdict, note? } → record human verdict
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { runAssertionVerification } from "../lib/verification/assertionCheck";

export const verifyRouter = Router();

const HUMAN_VERDICTS = new Set([
  "supported",
  "partially_supported",
  "not_supported",
  "misattributed",
]);

verifyRouter.post("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return void res.status(400).json({ detail: "text is required" });
  try {
    const result = await runAssertionVerification({
      db,
      userId,
      text,
      sourceKind:
        req.body?.source_kind === "chat_message" ||
        req.body?.source_kind === "agent_run"
          ? req.body.source_kind
          : "text",
      sourceRef:
        typeof req.body?.source_ref === "string" ? req.body.source_ref : null,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Verification failed",
    });
  }
});

verifyRouter.get("/", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data } = await db
    .from("verification_reports")
    .select("id, source_kind, source_ref, status, created_at, source_excerpt")
    .eq("owner_id", res.locals.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  res.json({ reports: data ?? [] });
});

verifyRouter.get("/:id", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: report } = await db
    .from("verification_reports")
    .select("*")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!report) return void res.status(404).json({ detail: "Report not found" });
  const { data: assertions } = await db
    .from("verification_assertions")
    .select("*")
    .eq("report_id", req.params.id)
    .order("position", { ascending: true });
  res.json({ report, assertions: assertions ?? [] });
});

verifyRouter.patch(
  "/:id/assertions/:assertionId",
  requireAuth,
  async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const verdict = req.body?.verdict;
    if (typeof verdict !== "string" || !HUMAN_VERDICTS.has(verdict))
      return void res.status(400).json({
        detail:
          "verdict must be supported | partially_supported | not_supported | misattributed",
      });

    const { data: report } = await db
      .from("verification_reports")
      .select("id")
      .eq("id", req.params.id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (!report)
      return void res.status(404).json({ detail: "Report not found" });

    const { error } = await db
      .from("verification_assertions")
      .update({
        verdict,
        verifier: "human",
        note: typeof req.body?.note === "string" ? req.body.note : null,
        verified_by: userId,
        verified_at: new Date().toISOString(),
      })
      .eq("id", req.params.assertionId)
      .eq("report_id", req.params.id);
    if (error) return void res.status(500).json({ detail: error.message });

    // A report is complete only when every assertion is adjudicated.
    const { data: remaining } = await db
      .from("verification_assertions")
      .select("id")
      .eq("report_id", req.params.id)
      .is("verdict", null);
    if (!remaining || remaining.length === 0) {
      await db
        .from("verification_reports")
        .update({ status: "complete" })
        .eq("id", req.params.id);
    }
    res.json({ ok: true, complete: !remaining || remaining.length === 0 });
  },
);
