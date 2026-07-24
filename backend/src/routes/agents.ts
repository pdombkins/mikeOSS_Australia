/**
 * P1 — Agent runs API (C013/C030).
 *   POST   /agents                — create run + generate plan
 *   GET    /agents                — list caller's runs
 *   GET    /agents/:id            — run + steps (polling)
 *   POST   /agents/:id/approve    — approve (optionally edited) plan → execute
 *   POST   /agents/:id/cancel     — cancel a run
 *   GET    /agents/:id/events     — live SSE while the run executes in-process
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { checkProjectAccess, filterAccessibleDocumentIds } from "../lib/access";
import { can } from "../lib/rbac";
import { getUserApiKeys } from "../lib/userApiKeys";
import { resolveModel, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { planRun, sanitizePlan } from "../lib/agents/planner";
import { planNeedsApproval, ROLE_TOOLSETS } from "../lib/agents/types";
import type { AgentPlan } from "../lib/agents/types";
import { executeRunInBackground } from "../lib/agents/executor";
import { subscribeRun } from "../lib/agents/events";

export const agentsRouter = Router();

/** C022 — fixed 3-step plan for precedent-driven drafting. */
function buildDraftFromPrecedentPlan(request: string): AgentPlan {
  return {
    title: "Draft from precedent",
    steps: [
      {
        position: 1,
        depends_on: [],
        role: "intake",
        instruction: `Read the attached precedent document and produce a structural analysis: document type, parties/roles, section-by-section skeleton, defined terms, style conventions (numbering, headings, boilerplate) and jurisdiction markers. Also summarise the matter details from this request: ${request}`,
        tool_allowlist: ROLE_TOOLSETS.intake,
      },
      {
        position: 2,
        depends_on: [1],
        role: "drafting",
        instruction: `Using the precedent's structure and style from step 1 and the matter details in the run request, produce a tailored multi-page first draft as a Word document (generate_docx). Reuse preferred clauses (search_clauses) and any relevant playbook positions where they fit. Follow Australian drafting conventions and AGLC4 for any citations.`,
        tool_allowlist: ROLE_TOOLSETS.drafting,
      },
      {
        position: 3,
        depends_on: [2],
        role: "review",
        instruction: `Review the generated draft against the relevant playbook (if one exists — use list_playbooks) and Australian-law sanity checks (correct jurisdiction, execution blocks, defined-term consistency, cross-references). Output redline notes with severity for each issue.`,
        tool_allowlist: ROLE_TOOLSETS.review,
      },
    ],
  };
}

async function insertSteps(
  db: ReturnType<typeof createServerSupabase>,
  runId: string,
  plan: AgentPlan,
): Promise<void> {
  await db.from("agent_steps").delete().eq("run_id", runId);
  const rows = plan.steps.map((s) => ({
    run_id: runId,
    position: s.position,
    depends_on: s.depends_on,
    role: s.role,
    instruction: s.instruction,
    tool_allowlist: ROLE_TOOLSETS[s.role],
  }));
  const { error } = await db.from("agent_steps").insert(rows);
  if (error) throw new Error(error.message);
}

// POST /agents { request, kind?, project_id?, document_ids?, model? }
agentsRouter.post("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const userEmail = res.locals.userEmail as string | undefined;
  const db = createServerSupabase();
  const request =
    typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request)
    return void res.status(400).json({ detail: "request is required" });

  const projectId =
    typeof req.body?.project_id === "string" ? req.body.project_id : null;
  if (projectId) {
    const access = await checkProjectAccess(projectId, userId, userEmail, db);
    if (!access.ok || !can(access.role, "run"))
      return void res
        .status(403)
        .json({ detail: "No run access to that project" });
  }
  const rawDocIds = Array.isArray(req.body?.document_ids)
    ? (req.body.document_ids as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const documentIds = await filterAccessibleDocumentIds(
    rawDocIds,
    userId,
    userEmail,
    db,
  );
  const model = resolveModel(req.body?.model, DEFAULT_MAIN_MODEL);

  const kind =
    req.body?.kind === "draft_from_precedent"
      ? "draft_from_precedent"
      : "assistant";

  const { data: created, error } = await db
    .from("agent_runs")
    .insert({
      owner_id: userId,
      project_id: projectId,
      kind,
      status: "planning",
      request,
      model,
      document_ids: documentIds,
    })
    .select("id")
    .single();
  if (error || !created)
    return void res
      .status(500)
      .json({ detail: error?.message ?? "insert failed" });
  const runId = created.id as string;

  try {
    // C022 — draft-from-precedent uses a fixed specialist plan (no planner
    // call): analyse the precedent, draft from it, self-review.
    const plan =
      kind === "draft_from_precedent"
        ? buildDraftFromPrecedentPlan(request)
        : await planRun({
            request,
            model,
            apiKeys: await getUserApiKeys(userId, db),
          });
    await insertSteps(db, runId, plan);
    const needsApproval = planNeedsApproval(plan);
    await db
      .from("agent_runs")
      .update({
        title: plan.title,
        plan,
        status: needsApproval ? "awaiting_approval" : "running",
        started_at: needsApproval ? null : new Date().toISOString(),
      })
      .eq("id", runId);
    if (!needsApproval) executeRunInBackground(runId);
    res.status(201).json({ run_id: runId, plan, needs_approval: needsApproval });
  } catch (err) {
    await db
      .from("agent_runs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", runId);
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Planning failed",
    });
  }
});

// GET /agents
agentsRouter.get("/", requireAuth, async (_req, res) => {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("agent_runs")
    .select(
      "id, kind, status, title, request, model, project_id, created_at, started_at, finished_at",
    )
    .eq("owner_id", res.locals.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ runs: data ?? [] });
});

// GET /agents/:id
agentsRouter.get("/:id", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: run } = await db
    .from("agent_runs")
    .select("*")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!run) return void res.status(404).json({ detail: "Run not found" });
  const { data: steps } = await db
    .from("agent_steps")
    .select(
      "position, depends_on, role, instruction, status, output_text, output, started_at, finished_at",
    )
    .eq("run_id", req.params.id)
    .order("position", { ascending: true });
  // Summarise which knowledge sources each step actually used, from the
  // persisted tool events — so the UI can show "what this agent relied on".
  const withSources = (steps ?? []).map((s) => {
    const { output, ...rest } = s as Record<string, unknown>;
    return { ...rest, sources: summariseStepSources(output) };
  });
  res.json({ run, steps: withSources });
});

/** Compact "sources used" summary derived from a step's persisted events. */
function summariseStepSources(output: unknown): {
  playbooks: string[];
  documents: string[];
  knowledge_searches: string[];
} {
  const events =
    output &&
    typeof output === "object" &&
    Array.isArray((output as { events?: unknown }).events)
      ? ((output as { events: unknown[] }).events as Record<string, unknown>[])
      : [];
  const playbooks = new Set<string>();
  const documents = new Set<string>();
  const knowledgeSearches: string[] = [];
  for (const ev of events) {
    const type = ev.type as string | undefined;
    if (type === "playbook_reviewed" && typeof ev.name === "string") {
      playbooks.add(ev.name);
    } else if (type === "playbook_listed" && Array.isArray(ev.names)) {
      for (const n of ev.names as unknown[])
        if (typeof n === "string") playbooks.add(n);
    } else if (
      (type === "doc_read" || type === "doc_find") &&
      typeof ev.filename === "string"
    ) {
      documents.add(ev.filename);
    } else if (type === "knowledge_search" && typeof ev.query === "string") {
      const hits = typeof ev.hits === "number" ? ev.hits : 0;
      knowledgeSearches.push(`${ev.query} (${hits})`);
    }
  }
  return {
    playbooks: [...playbooks],
    documents: [...documents],
    knowledge_searches: knowledgeSearches,
  };
}

// POST /agents/:id/approve { plan? } — approve, optionally with edited steps.
agentsRouter.post("/:id/approve", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: run } = await db
    .from("agent_runs")
    .select("id, status, request, owner_id")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!run) return void res.status(404).json({ detail: "Run not found" });
  if (run.status !== "awaiting_approval")
    return void res
      .status(400)
      .json({ detail: `Run is ${run.status}, not awaiting approval` });

  try {
    if (req.body?.plan) {
      const edited = sanitizePlan(req.body.plan, run.request as string);
      await insertSteps(db, run.id as string, edited);
      await db
        .from("agent_runs")
        .update({ plan: edited, title: edited.title })
        .eq("id", run.id);
    }
    await db
      .from("agent_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", run.id);
    executeRunInBackground(run.id as string);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      detail: err instanceof Error ? err.message : "Approve failed",
    });
  }
});

// POST /agents/:id/cancel
agentsRouter.post("/:id/cancel", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { error } = await db
    .from("agent_runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .in("status", ["planning", "awaiting_approval", "running", "paused"]);
  if (error) return void res.status(500).json({ detail: error.message });
  res.json({ ok: true });
});

// GET /agents/:id/events — SSE tail for a run executing in-process.
agentsRouter.get("/:id/events", requireAuth, async (req, res) => {
  const db = createServerSupabase();
  const { data: run } = await db
    .from("agent_runs")
    .select("id")
    .eq("id", req.params.id)
    .eq("owner_id", res.locals.userId)
    .maybeSingle();
  if (!run) return void res.status(404).json({ detail: "Run not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const unsubscribe = subscribeRun(req.params.id, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === "agent_done" || event.type === "agent_error") {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });
  const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(keepalive);
    unsubscribe();
  });
});
