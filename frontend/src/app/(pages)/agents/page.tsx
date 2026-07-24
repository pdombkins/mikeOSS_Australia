"use client";

/**
 * P1 — Agents page (C013 orchestration, C030 plan approval + parallel runs).
 * List of runs, run creation, plan review/edit/approve, live step progress.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Bot,
    Check,
    ChevronDown,
    ChevronRight,
    CircleDashed,
    Loader2,
    Play,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import {
    approveAgentRun,
    cancelAgentRun,
    createAgentRun,
    getAgentRun,
    exportOutput,
    getLibrary,
    listAgentRuns,
    type AgentPlan,
    type AgentRunSummary,
    type AgentStepDetail,
} from "@/app/lib/mikeApi";
import type { Document } from "@/app/components/shared/types";

const ROLES = ["intake", "research", "drafting", "review", "verify"] as const;

// Per-role reference (mirrors backend ROLE_TOOLSETS). Makes clear which roles
// draw on playbooks / knowledge / documents before a run is approved.
const ROLE_CAPABILITIES: Record<
    (typeof ROLES)[number],
    { blurb: string; playbooks: boolean; knowledge: boolean; documents: boolean }
> = {
    intake: {
        blurb: "Characterises the matter, parties, jurisdiction and inputs.",
        playbooks: false,
        knowledge: false,
        documents: true,
    },
    research: {
        blurb: "Researches via the knowledge base, clauses, playbooks and Jade.io.",
        playbooks: true,
        knowledge: true,
        documents: true,
    },
    drafting: {
        blurb: "Produces or edits documents, consulting playbooks and clauses.",
        playbooks: true,
        knowledge: true,
        documents: true,
    },
    review: {
        blurb: "Reviews documents against your playbooks and AU law.",
        playbooks: true,
        knowledge: true,
        documents: true,
    },
    verify: {
        blurb: "Validates citations and checks they support assertions.",
        playbooks: false,
        knowledge: false,
        documents: true,
    },
};

const STATUS_STYLES: Record<string, string> = {
    planning: "bg-amber-100 text-amber-800",
    awaiting_approval: "bg-blue-100 text-blue-800",
    running: "bg-indigo-100 text-indigo-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
    paused: "bg-gray-100 text-gray-600",
};

function StatusChip({ status }: { status: string }) {
    return (
        <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}
        >
            {status.replaceAll("_", " ")}
        </span>
    );
}

function StepStatusIcon({ status }: { status: string }) {
    if (status === "completed")
        return <Check className="h-4 w-4 text-green-600" />;
    if (status === "running")
        return <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />;
    if (status === "failed") return <X className="h-4 w-4 text-red-600" />;
    if (status === "skipped")
        return <CircleDashed className="h-4 w-4 text-gray-400" />;
    return <CircleDashed className="h-4 w-4 text-gray-300" />;
}

// Per-run transparency: what a step actually consulted.
function StepSources({
    sources,
    role,
}: {
    sources?: import("@/app/lib/mikeApi").AgentStepSources;
    role: string;
}) {
    const playbooks = sources?.playbooks ?? [];
    const documents = sources?.documents ?? [];
    const searches = sources?.knowledge_searches ?? [];
    const canUsePlaybooks =
        ROLE_CAPABILITIES[role as (typeof ROLES)[number]]?.playbooks;
    if (
        playbooks.length === 0 &&
        documents.length === 0 &&
        searches.length === 0
    ) {
        // Only note "no sources" for roles that could have used them.
        if (!canUsePlaybooks) return null;
        return (
            <p className="mb-2 text-[11px] text-gray-400">
                No playbooks or knowledge were consulted in this step.
            </p>
        );
    }
    const Row = ({ label, items }: { label: string; items: string[] }) =>
        items.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {label}
                </span>
                {items.map((it, i) => (
                    <span
                        key={`${label}-${i}`}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
                    >
                        {it}
                    </span>
                ))}
            </div>
        );
    return (
        <div className="mb-3 space-y-1.5 rounded-lg bg-gray-50 p-2.5">
            <p className="text-[11px] font-medium text-gray-500">
                Sources used in this step
            </p>
            <Row label="Playbooks" items={playbooks} />
            <Row label="Documents" items={documents} />
            <Row label="Knowledge" items={searches} />
        </div>
    );
}

function AgentsPageInner() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedId = searchParams.get("run");

    const [runs, setRuns] = useState<AgentRunSummary[]>([]);
    const [request, setRequest] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Document attachment (C022 precedent + general runs)
    const [showDocs, setShowDocs] = useState(false);
    const [docs, setDocs] = useState<Document[]>([]);
    const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
    const [draftFromPrecedent, setDraftFromPrecedent] = useState(false);
    const [showRoleRef, setShowRoleRef] = useState(false);

    useEffect(() => {
        if (!showDocs || docs.length > 0) return;
        void Promise.all([getLibrary("files"), getLibrary("templates")])
            .then(([files, templates]) => {
                const all = [...templates.documents, ...files.documents];
                const seen = new Set<string>();
                setDocs(
                    all.filter((d) =>
                        seen.has(d.id) ? false : (seen.add(d.id), true),
                    ),
                );
            })
            .catch(() => {});
    }, [showDocs, docs.length]);

    const [detail, setDetail] = useState<{
        run: AgentRunSummary & {
            plan: AgentPlan | null;
            error: string | null;
            result: unknown;
        };
        steps: AgentStepDetail[];
    } | null>(null);
    const [editPlan, setEditPlan] = useState<AgentPlan | null>(null);
    const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
    const [exportFormat, setExportFormat] = useState<"docx" | "pdf" | "md">("docx");
    const [exportStyle, setExportStyle] = useState<"as_written" | "aglc4">("as_written");
    const [exporting, setExporting] = useState(false);

    // C040 — export the run's combined step outputs.
    const handleExport = async () => {
        if (!detail || exporting) return;
        setExporting(true);
        try {
            const content = detail.steps
                .filter((s) => s.output_text)
                .map((s) => `## Step ${s.position} (${s.role})\n\n${s.output_text}`)
                .join("\n\n");
            const blob = await exportOutput({
                title: detail.run.title ?? "Agent run",
                content,
                format: exportFormat,
                citation_style: exportStyle,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${(detail.run.title ?? "agent-run").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "agent-run"}.${exportFormat}`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    // Prefill from ?new= (e.g. Playbooks → "Build with AI").
    useEffect(() => {
        const seed = searchParams.get("new");
        if (seed) setRequest(seed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshList = useCallback(async () => {
        try {
            const { runs } = await listAgentRuns();
            setRuns(runs);
        } catch {
            /* transient */
        }
    }, []);

    const refreshDetail = useCallback(async () => {
        if (!selectedId) return;
        try {
            const d = await getAgentRun(selectedId);
            setDetail(d);
            if (d.run.status === "awaiting_approval" && d.run.plan) {
                setEditPlan((prev) => prev ?? d.run.plan);
            } else if (d.run.status !== "awaiting_approval") {
                setEditPlan(null);
            }
        } catch {
            /* transient */
        }
    }, [selectedId]);

    useEffect(() => {
        if (!user) return;
        void refreshList();
    }, [user, refreshList]);

    useEffect(() => {
        setDetail(null);
        setEditPlan(null);
        setExpandedSteps(new Set());
        if (!selectedId) return;
        void refreshDetail();
    }, [selectedId, refreshDetail]);

    // Poll while active.
    const activeStatus =
        detail?.run.status === "planning" || detail?.run.status === "running";
    useEffect(() => {
        if (!activeStatus) return;
        const t = setInterval(() => {
            void refreshDetail();
            void refreshList();
        }, 2500);
        return () => clearInterval(t);
    }, [activeStatus, refreshDetail, refreshList]);

    const handleCreate = async () => {
        const text = request.trim();
        if (!text || creating) return;
        setCreating(true);
        setError(null);
        try {
            const { run_id } = await createAgentRun({
                request: text,
                document_ids: [...selectedDocs],
                kind: draftFromPrecedent ? "draft_from_precedent" : undefined,
            });
            setRequest("");
            setSelectedDocs(new Set());
            setDraftFromPrecedent(false);
            await refreshList();
            router.push(`/agents?run=${run_id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create run");
        } finally {
            setCreating(false);
        }
    };

    const handleApprove = async () => {
        if (!selectedId) return;
        try {
            await approveAgentRun(selectedId, editPlan ?? undefined);
            setEditPlan(null);
            await refreshDetail();
            await refreshList();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Approve failed");
        }
    };

    const handleCancel = async () => {
        if (!selectedId) return;
        await cancelAgentRun(selectedId);
        await refreshDetail();
        await refreshList();
    };

    const stepByPosition = useMemo(() => {
        const m = new Map<number, AgentStepDetail>();
        for (const s of detail?.steps ?? []) m.set(s.position, s);
        return m;
    }, [detail]);

    return (
        <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-8">
            {/* Left: create + run list */}
            <div className="w-80 shrink-0">
                <h1 className="mb-3 flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <Bot className="h-5 w-5" /> Agents
                </h1>
                <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
                    <textarea
                        value={request}
                        onChange={(e) => setRequest(e.target.value)}
                        placeholder="Describe the multi-step task, e.g. 'Research WHS obligations for NSW labour-hire, then draft a compliance memo and review it against our playbook.'"
                        rows={4}
                        className="w-full resize-none rounded-md border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => setShowDocs((v) => !v)}
                        className="mb-1 text-[11px] text-gray-500 hover:text-gray-800"
                    >
                        {showDocs ? "Hide documents" : `Attach documents${selectedDocs.size ? ` (${selectedDocs.size})` : ""}`}
                    </button>
                    {showDocs && (
                        <div className="mb-2 max-h-40 overflow-auto rounded-md border border-gray-100">
                            {docs.length === 0 ? (
                                <p className="p-2 text-[11px] text-gray-400">
                                    No Library documents found.
                                </p>
                            ) : (
                                docs.map((d) => (
                                    <label
                                        key={d.id}
                                        className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedDocs.has(d.id)}
                                            onChange={(e) => {
                                                const next = new Set(
                                                    selectedDocs,
                                                );
                                                if (e.target.checked)
                                                    next.add(d.id);
                                                else next.delete(d.id);
                                                setSelectedDocs(next);
                                            }}
                                        />
                                        <span className="truncate">
                                            {d.filename}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    )}
                    <label className="mb-1 flex items-center gap-2 text-[11px] text-gray-600">
                        <input
                            type="checkbox"
                            checked={draftFromPrecedent}
                            onChange={(e) =>
                                setDraftFromPrecedent(e.target.checked)
                            }
                        />
                        Draft from precedent (attach the precedent above; fixed
                        analyse → draft → review plan)
                    </label>
                    <button
                        onClick={() => void handleCreate()}
                        disabled={creating || !request.trim()}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                    >
                        {creating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4" />
                        )}
                        Plan agent run
                    </button>
                    {error && (
                        <p className="mt-2 text-xs text-red-600">{error}</p>
                    )}
                    <p className="mt-2 text-[11px] leading-snug text-gray-400">
                        You review and approve the plan before anything runs.
                        Independent steps run in parallel; you are notified when
                        results are ready.
                    </p>
                </div>
                {/* Per-role reference — what each agent role can draw on. */}
                <div className="mb-4 rounded-xl border border-gray-200 bg-white">
                    <button
                        onClick={() => setShowRoleRef((v) => !v)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-600"
                    >
                        {showRoleRef ? (
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        What each agent role uses
                    </button>
                    {showRoleRef && (
                        <ul className="space-y-2 border-t border-gray-100 px-3 py-2.5">
                            {ROLES.map((role) => {
                                const cap = ROLE_CAPABILITIES[role];
                                return (
                                    <li key={role} className="text-[11px]">
                                        <span className="font-semibold uppercase tracking-wider text-gray-500">
                                            {role}
                                        </span>
                                        <p className="mt-0.5 text-gray-600">
                                            {cap.blurb}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {cap.playbooks && (
                                                <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                                                    Playbooks
                                                </span>
                                            )}
                                            {cap.knowledge && (
                                                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
                                                    Knowledge base
                                                </span>
                                            )}
                                            {cap.documents && (
                                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600">
                                                    Documents
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                            <li className="pt-1 text-[11px] text-gray-400">
                                Expand any completed step to see exactly which
                                playbooks and documents it relied on.
                            </li>
                        </ul>
                    )}
                </div>

                <ul className="space-y-1.5">
                    {runs.map((r) => (
                        <li key={r.id}>
                            <button
                                onClick={() => router.push(`/agents?run=${r.id}`)}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                    r.id === selectedId
                                        ? "border-gray-400 bg-gray-50"
                                        : "border-gray-200 bg-white hover:bg-gray-50"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-gray-900">
                                        {r.title ?? r.request}
                                    </span>
                                    <StatusChip status={r.status} />
                                </div>
                                <p className="mt-0.5 truncate text-xs text-gray-500">
                                    {new Date(r.created_at).toLocaleString()}
                                </p>
                            </button>
                        </li>
                    ))}
                    {runs.length === 0 && (
                        <li className="text-sm text-gray-400">No runs yet.</li>
                    )}
                </ul>
            </div>

            {/* Right: run detail */}
            <div className="min-w-0 flex-1">
                {!detail ? (
                    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
                        {selectedId
                            ? "Loading run…"
                            : "Select or create a run to see its plan and progress."}
                    </div>
                ) : (
                    <div>
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-xl font-medium font-serif text-gray-900">
                                    {detail.run.title ?? detail.run.request}
                                </h2>
                                <div className="mt-1 flex items-center gap-2">
                                    <StatusChip status={detail.run.status} />
                                    {detail.run.model && (
                                        <span className="text-xs text-gray-400">
                                            {detail.run.model}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {detail.run.status === "completed" && (
                                    <>
                                        <select
                                            value={exportFormat}
                                            onChange={(e) =>
                                                setExportFormat(
                                                    e.target.value as
                                                        | "docx"
                                                        | "pdf"
                                                        | "md",
                                                )
                                            }
                                            className="rounded-md border border-gray-300 px-1.5 py-1.5 text-xs"
                                        >
                                            <option value="docx">DOCX</option>
                                            <option value="pdf">PDF</option>
                                            <option value="md">Markdown</option>
                                        </select>
                                        <select
                                            value={exportStyle}
                                            onChange={(e) =>
                                                setExportStyle(
                                                    e.target.value as
                                                        | "as_written"
                                                        | "aglc4",
                                                )
                                            }
                                            className="rounded-md border border-gray-300 px-1.5 py-1.5 text-xs"
                                        >
                                            <option value="as_written">
                                                Citations as written
                                            </option>
                                            <option value="aglc4">
                                                AGLC4 citations
                                            </option>
                                        </select>
                                        <button
                                            onClick={() => void handleExport()}
                                            disabled={exporting}
                                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        >
                                            {exporting ? "Exporting…" : "Export"}
                                        </button>
                                    </>
                                )}
                                {(detail.run.status === "running" ||
                                    detail.run.status === "awaiting_approval" ||
                                    detail.run.status === "planning") && (
                                    <button
                                        onClick={() => void handleCancel()}
                                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* C030 — plan approval editor */}
                        {detail.run.status === "awaiting_approval" &&
                            editPlan && (
                                <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                                    <p className="mb-3 text-sm font-medium text-gray-900">
                                        Review the agent&apos;s plan before it
                                        runs. Edit instructions, change roles,
                                        or remove steps.
                                    </p>
                                    <ol className="space-y-2">
                                        {editPlan.steps.map((s, i) => (
                                            <li
                                                key={i}
                                                className="rounded-lg border border-gray-200 bg-white p-3"
                                            >
                                                <div className="mb-1.5 flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-gray-500">
                                                        Step {s.position}
                                                    </span>
                                                    <select
                                                        value={s.role}
                                                        onChange={(e) => {
                                                            const steps = [
                                                                ...editPlan.steps,
                                                            ];
                                                            steps[i] = {
                                                                ...s,
                                                                role: e.target
                                                                    .value as (typeof ROLES)[number],
                                                            };
                                                            setEditPlan({
                                                                ...editPlan,
                                                                steps,
                                                            });
                                                        }}
                                                        className="rounded border border-gray-200 px-1.5 py-0.5 text-xs"
                                                    >
                                                        {ROLES.map((r) => (
                                                            <option
                                                                key={r}
                                                                value={r}
                                                            >
                                                                {r}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {s.depends_on.length > 0 && (
                                                        <span className="text-[11px] text-gray-400">
                                                            after step
                                                            {s.depends_on.length >
                                                            1
                                                                ? "s"
                                                                : ""}{" "}
                                                            {s.depends_on.join(
                                                                ", ",
                                                            )}
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            const steps =
                                                                editPlan.steps
                                                                    .filter(
                                                                        (
                                                                            _,
                                                                            j,
                                                                        ) =>
                                                                            j !==
                                                                            i,
                                                                    )
                                                                    .map(
                                                                        (
                                                                            st,
                                                                            j,
                                                                        ) => ({
                                                                            ...st,
                                                                            position:
                                                                                j +
                                                                                1,
                                                                            depends_on:
                                                                                st.depends_on.filter(
                                                                                    (
                                                                                        d,
                                                                                    ) =>
                                                                                        d !==
                                                                                            s.position &&
                                                                                        d <=
                                                                                            j,
                                                                                ),
                                                                        }),
                                                                    );
                                                            setEditPlan({
                                                                ...editPlan,
                                                                steps,
                                                            });
                                                        }}
                                                        className="ml-auto text-gray-400 hover:text-red-600"
                                                        title="Remove step"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={s.instruction}
                                                    onChange={(e) => {
                                                        const steps = [
                                                            ...editPlan.steps,
                                                        ];
                                                        steps[i] = {
                                                            ...s,
                                                            instruction:
                                                                e.target.value,
                                                        };
                                                        setEditPlan({
                                                            ...editPlan,
                                                            steps,
                                                        });
                                                    }}
                                                    rows={2}
                                                    className="w-full resize-y rounded-md border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                                                />
                                            </li>
                                        ))}
                                    </ol>
                                    <button
                                        onClick={() => void handleApprove()}
                                        disabled={editPlan.steps.length === 0}
                                        className="mt-3 flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                                    >
                                        <Play className="h-4 w-4" /> Approve &
                                        run
                                    </button>
                                </div>
                            )}

                        {/* Steps progress */}
                        {detail.run.status !== "awaiting_approval" && (
                            <ol className="space-y-2">
                                {detail.steps.map((s) => {
                                    const open = expandedSteps.has(s.position);
                                    return (
                                        <li
                                            key={s.position}
                                            className="rounded-xl border border-gray-200 bg-white"
                                        >
                                            <button
                                                onClick={() => {
                                                    const next = new Set(
                                                        expandedSteps,
                                                    );
                                                    if (open)
                                                        next.delete(s.position);
                                                    else next.add(s.position);
                                                    setExpandedSteps(next);
                                                }}
                                                className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
                                            >
                                                <StepStatusIcon
                                                    status={s.status}
                                                />
                                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                    {s.role}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                                                    {s.instruction}
                                                </span>
                                                {s.depends_on.length > 0 && (
                                                    <span className="hidden text-[11px] text-gray-400 sm:block">
                                                        ⇠ {s.depends_on.join(",")}
                                                    </span>
                                                )}
                                                {open ? (
                                                    <ChevronDown className="h-4 w-4 text-gray-400" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-gray-400" />
                                                )}
                                            </button>
                                            {open && (
                                                <div className="border-t border-gray-100 px-4 py-3">
                                                    <StepSources
                                                        sources={s.sources}
                                                        role={s.role}
                                                    />
                                                    {s.output_text ? (
                                                        <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm text-gray-700">
                                                            {s.output_text}
                                                        </pre>
                                                    ) : (
                                                        <p className="text-sm text-gray-400">
                                                            {s.status ===
                                                            "running"
                                                                ? "Working…"
                                                                : "No output yet."}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}

                        {detail.run.error && (
                            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                                {detail.run.error}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function AgentsPage() {
    return (
        <Suspense fallback={null}>
            <AgentsPageInner />
        </Suspense>
    );
}
