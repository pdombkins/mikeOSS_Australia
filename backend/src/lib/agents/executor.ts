/**
 * P1 — Agent run executor (C013 sub-agents, C030 parallel DAG execution).
 *
 * Each step is one invocation of the existing chat engine (runLLMStream)
 * with a role prompt and a role-scoped tool allowlist. Steps whose
 * depends_on are all complete run concurrently (cap 3). Step outputs are
 * appended to a bounded shared run context that later steps receive.
 * All usage lands in query_costs (source 'agent_step'); completion fires
 * a P2 notification; every step start/finish is audit-logged (P3).
 */

import { createServerSupabase } from "../supabase";
import { runLLMStream } from "../chat/streaming";
import type { DocIndex, DocStore } from "../chat/types";
import { buildDocContext } from "../chat/contextBuilders";
import { getUserApiKeys } from "../userApiKeys";
import { resolveModel, DEFAULT_MAIN_MODEL } from "../llm";
import { getOrgContextForUser } from "../orgContext";
import { notify } from "../notifications";
import { recordAudit } from "../audit";
import { buildRolePrompt } from "./rolePrompts";
import { publishRunEvent } from "./events";
import type { AgentRole } from "./types";

type Db = ReturnType<typeof createServerSupabase>;

type StepRow = {
    id: string;
    run_id: string;
    position: number;
    depends_on: number[];
    role: AgentRole;
    instruction: string;
    tool_allowlist: string[];
    status: string;
    output_text: string | null;
};

type RunRow = {
    id: string;
    owner_id: string;
    project_id: string | null;
    kind: string;
    status: string;
    title: string | null;
    request: string;
    model: string | null;
    document_ids: string[] | null;
};

const MAX_CONCURRENT = 3;
const RUN_CONTEXT_BUDGET = 24_000; // chars (~8k tokens) of shared context

const activeRuns = new Set<string>();

export function isRunActive(runId: string): boolean {
    return activeRuns.has(runId);
}

/** Fire-and-forget entry point — call after a run flips to 'running'. */
export function executeRunInBackground(runId: string): void {
    if (activeRuns.has(runId)) return;
    activeRuns.add(runId);
    void executeRun(runId)
        .catch(async (err) => {
            const db = createServerSupabase();
            await db
                .from("agent_runs")
                .update({
                    status: "failed",
                    error: err instanceof Error ? err.message : String(err),
                    finished_at: new Date().toISOString(),
                })
                .eq("id", runId);
            publishRunEvent({
                type: "agent_error",
                runId,
                payload: err instanceof Error ? err.message : String(err),
            });
        })
        .finally(() => activeRuns.delete(runId));
}

async function executeRun(runId: string): Promise<void> {
    const db = createServerSupabase();
    const { data: runData } = await db
        .from("agent_runs")
        .select(
            "id, owner_id, project_id, kind, status, title, request, model, document_ids",
        )
        .eq("id", runId)
        .single();
    const run = runData as RunRow | null;
    if (!run || run.status !== "running") return;

    const { data: stepData } = await db
        .from("agent_steps")
        .select(
            "id, run_id, position, depends_on, role, instruction, tool_allowlist, status, output_text",
        )
        .eq("run_id", runId)
        .order("position", { ascending: true });
    const steps = (stepData ?? []) as StepRow[];
    if (steps.length === 0) {
        await finishRun(db, run, "failed", "Run has no steps");
        return;
    }

    const apiKeys = await getUserApiKeys(run.owner_id, db);
    const model = resolveModel(run.model, DEFAULT_MAIN_MODEL);
    const orgContext = await getOrgContextForUser(run.owner_id, db);

    // Shared doc context: input documents bound at creation.
    const docIds = Array.isArray(run.document_ids) ? run.document_ids : [];
    const { docIndex, docStore } = await buildDocContext(
        [
            {
                role: "user",
                content: run.request,
                files: docIds.map((id) => ({ filename: "", document_id: id })),
            },
        ],
        run.owner_id,
        db,
        null,
    );

    // Bounded shared run memory (step outputs, in position order).
    const contextParts = new Map<number, string>();
    const runContext = () => {
        const ordered = [...contextParts.entries()].sort(
            (a, b) => a[0] - b[0],
        );
        let text = ordered
            .map(([pos, out]) => `--- Step ${pos} output ---\n${out}`)
            .join("\n\n");
        if (text.length > RUN_CONTEXT_BUDGET) {
            text = `…(earlier output truncated)\n${text.slice(-RUN_CONTEXT_BUDGET)}`;
        }
        return text;
    };

    const done = new Set<number>();
    const failed = new Set<number>();
    for (const s of steps) {
        if (s.status === "completed") {
            done.add(s.position);
            if (s.output_text) contextParts.set(s.position, s.output_text);
        }
    }

    while (done.size + failed.size < steps.length) {
        // Cancelled mid-flight?
        const { data: fresh } = await db
            .from("agent_runs")
            .select("status")
            .eq("id", runId)
            .single();
        if ((fresh as { status?: string } | null)?.status !== "running") return;

        const ready = steps.filter(
            (s) =>
                s.status === "pending" &&
                !done.has(s.position) &&
                !failed.has(s.position) &&
                s.depends_on.every((d) => done.has(d)),
        );
        // Steps whose dependencies failed are skipped.
        const blocked = steps.filter(
            (s) =>
                s.status === "pending" &&
                s.depends_on.some((d) => failed.has(d)),
        );
        for (const s of blocked) {
            s.status = "skipped";
            failed.add(s.position);
            await db
                .from("agent_steps")
                .update({ status: "skipped" })
                .eq("id", s.id);
            publishRunEvent({
                type: "agent_step_done",
                runId,
                position: s.position,
                status: "skipped",
            });
        }
        if (ready.length === 0) {
            if (blocked.length === 0) break; // nothing runnable — deadlock guard
            continue;
        }

        const batch = ready.slice(0, MAX_CONCURRENT);
        await Promise.allSettled(
            batch.map((step) =>
                runStep(db, run, step, {
                    model,
                    apiKeys,
                    orgContext,
                    docIndex,
                    docStore,
                    runContext: runContext(),
                }).then(
                    (output) => {
                        step.status = "completed";
                        done.add(step.position);
                        if (output) contextParts.set(step.position, output);
                    },
                    async (err) => {
                        step.status = "failed";
                        failed.add(step.position);
                        await db
                            .from("agent_steps")
                            .update({
                                status: "failed",
                                output_text:
                                    err instanceof Error
                                        ? err.message
                                        : String(err),
                                finished_at: new Date().toISOString(),
                            })
                            .eq("id", step.id);
                        publishRunEvent({
                            type: "agent_step_done",
                            runId,
                            position: step.position,
                            status: "failed",
                        });
                    },
                ),
            ),
        );
    }

    const anyFailed = failed.size > 0;
    const finalText = runContext();
    await finishRun(
        db,
        run,
        anyFailed && done.size === 0 ? "failed" : "completed",
        anyFailed && done.size === 0 ? "All steps failed" : null,
        { summary: finalText.slice(-12_000) },
    );
}

async function runStep(
    db: Db,
    run: RunRow,
    step: StepRow,
    ctx: {
        model: string;
        apiKeys: Awaited<ReturnType<typeof getUserApiKeys>>;
        orgContext: string | null;
        docIndex: DocIndex;
        docStore: DocStore;
        runContext: string;
    },
): Promise<string> {
    await db
        .from("agent_steps")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", step.id);
    publishRunEvent({
        type: "agent_step_start",
        runId: run.id,
        position: step.position,
        role: step.role,
    });
    recordAudit({
        actorId: run.owner_id,
        eventType: "agent_step",
        projectId: run.project_id,
        resourceType: "agent_run",
        resourceId: run.id,
        detail: { position: step.position, role: step.role, status: "start" },
    });

    const systemPrompt = buildRolePrompt(step.role, {
        orgContext: ctx.orgContext,
        runContext: ctx.runContext,
    });
    const docAvailability = Object.entries(ctx.docIndex).map(
        ([doc_id, info]) => ({ doc_id, filename: info.filename }),
    );
    const userContent = [
        `RUN REQUEST:\n${run.request}`,
        docAvailability.length
            ? `AVAILABLE DOCUMENTS:\n${docAvailability
                  .map((d) => `- ${d.doc_id}: ${d.filename}`)
                  .join("\n")}`
            : null,
        `YOUR STEP (${step.role}):\n${step.instruction}`,
    ]
        .filter(Boolean)
        .join("\n\n");

    // Capture streamed deltas for live subscribers; discard SSE plumbing.
    const write = (s: string) => {
        const m = s.match(/^data: (.*)\n\n$/s);
        if (!m) return;
        try {
            const ev = JSON.parse(m[1]) as {
                type?: string;
                delta?: string;
                content?: string;
            };
            if (ev.type === "content_delta" && typeof ev.delta === "string") {
                publishRunEvent({
                    type: "agent_step_delta",
                    runId: run.id,
                    position: step.position,
                    delta: ev.delta,
                });
            }
        } catch {
            /* non-JSON payloads ignored */
        }
    };

    const { fullText, events } = await runLLMStream({
        apiMessages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
        ],
        docStore: ctx.docStore,
        docIndex: ctx.docIndex,
        userId: run.owner_id,
        db,
        write,
        includeResearchTools: true,
        model: ctx.model,
        apiKeys: ctx.apiKeys,
        chatId: null,
        costSource: "agent_step",
        projectId: run.project_id,
        toolAllowlist: step.tool_allowlist,
    });

    await db
        .from("agent_steps")
        .update({
            status: "completed",
            output_text: fullText,
            output: { events: (events ?? []).slice(0, 50) },
            finished_at: new Date().toISOString(),
        })
        .eq("id", step.id);
    publishRunEvent({
        type: "agent_step_done",
        runId: run.id,
        position: step.position,
        status: "completed",
    });
    recordAudit({
        actorId: run.owner_id,
        eventType: "agent_step",
        projectId: run.project_id,
        resourceType: "agent_run",
        resourceId: run.id,
        detail: { position: step.position, role: step.role, status: "done" },
    });
    return fullText;
}

async function finishRun(
    db: Db,
    run: RunRow,
    status: "completed" | "failed",
    error: string | null,
    result?: unknown,
): Promise<void> {
    await db
        .from("agent_runs")
        .update({
            status,
            error,
            result: result ?? null,
            finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    publishRunEvent({
        type: "agent_done",
        runId: run.id,
        status,
    });
    await notify({
        userId: run.owner_id,
        kind: "agent_run",
        title:
            status === "completed"
                ? `Agent run finished: ${run.title ?? run.request.slice(0, 60)}`
                : `Agent run failed: ${run.title ?? run.request.slice(0, 60)}`,
        body:
            status === "completed"
                ? "Results are ready for review."
                : (error ?? "See the run page for details."),
        link: `/agents?run=${run.id}`,
    });
}

/**
 * Boot recovery: runs left in 'running' by a server restart are resumed.
 * Completed steps are preserved (executeRun skips them); pending/failed-in-
 * flight steps re-run. Called once from index.ts shortly after startup.
 */
export async function recoverOrphanedRuns(): Promise<number> {
    const db = createServerSupabase();
    // Steps stuck in 'running' from the old process are reset to pending so
    // the executor re-runs them.
    const { data: runs } = await db
        .from("agent_runs")
        .select("id")
        .eq("status", "running");
    const ids = (runs ?? []).map((r) => r.id as string);
    for (const runId of ids) {
        await db
            .from("agent_steps")
            .update({ status: "pending", started_at: null })
            .eq("run_id", runId)
            .eq("status", "running");
        executeRunInBackground(runId);
    }
    return ids.length;
}
