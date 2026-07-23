"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Plus,
    Trash2,
    ScrollText,
    ChevronDown,
    ChevronRight,
    Loader2,
    GripVertical,
    Upload,
} from "lucide-react";
import { parseCsvRecords } from "@/app/lib/csv";
import {
    listPlaybooks,
    getPlaybook,
    createPlaybook,
    updatePlaybook,
    deletePlaybook,
    type Playbook,
    type PlaybookSummary,
    type PlaybookRule,
    type PlaybookSeverity,
} from "@/app/lib/mikeApi";
import { PageHeader } from "@/app/components/shared/PageHeader";
import { useRouter } from "next/navigation";
import { PillButton } from "@/app/components/ui/pill-button";

const SEVERITY_STYLES: Record<PlaybookSeverity, string> = {
    low: "bg-gray-100 text-gray-600 border-gray-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-red-50 text-red-700 border-red-200",
};

const emptyRule = (): PlaybookRule => ({
    topic: "",
    preferred: null,
    acceptable_fallback: null,
    dealbreaker: null,
    severity: "medium",
    notes: null,
});

type DraftRule = {
    topic: string;
    preferred: string;
    acceptable_fallback: string;
    dealbreaker: string;
    severity: PlaybookSeverity;
    notes: string;
    _open: boolean;
};

type Draft = {
    id: string | null;
    name: string;
    agreement_type: string;
    description: string;
    rules: DraftRule[];
};

function toDraftRule(r: PlaybookRule): DraftRule {
    return {
        topic: r.topic ?? "",
        preferred: r.preferred ?? "",
        acceptable_fallback: r.acceptable_fallback ?? "",
        dealbreaker: r.dealbreaker ?? "",
        severity: r.severity ?? "medium",
        notes: r.notes ?? "",
        _open: false,
    };
}

function toDraft(pb: Playbook | null): Draft {
    if (!pb) {
        return {
            id: null,
            name: "",
            agreement_type: "",
            description: "",
            rules: [{ ...toDraftRule(emptyRule()), _open: true }],
        };
    }
    return {
        id: pb.id,
        name: pb.name,
        agreement_type: pb.agreement_type ?? "",
        description: pb.description ?? "",
        rules: pb.rules.length ? pb.rules.map(toDraftRule) : [],
    };
}

function draftToInput(d: Draft) {
    return {
        name: d.name.trim(),
        agreement_type: d.agreement_type.trim() || null,
        description: d.description.trim() || null,
        rules: d.rules
            .filter((r) => r.topic.trim())
            .map((r) => ({
                topic: r.topic.trim(),
                preferred: r.preferred.trim() || null,
                acceptable_fallback: r.acceptable_fallback.trim() || null,
                dealbreaker: r.dealbreaker.trim() || null,
                severity: r.severity,
                notes: r.notes.trim() || null,
            })),
    };
}

const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-100";
const labelClass =
    "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";

export function PlaybookManager() {
    const router = useRouter();
    const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [draft, setDraft] = useState<Draft | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setPlaybooks(await listPlaybooks());
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load playbooks.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const openNew = useCallback(() => {
        setDraft(toDraft(null));
        setSaveError(null);
        setEditorOpen(true);
    }, []);

    const openExisting = useCallback(async (id: string) => {
        setSaveError(null);
        setEditorOpen(true);
        setDraft({ id, name: "", agreement_type: "", description: "", rules: [] });
        try {
            const pb = await getPlaybook(id);
            setDraft(toDraft(pb));
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Failed to load playbook.");
        }
    }, []);

    const closeEditor = useCallback(() => {
        setEditorOpen(false);
        setDraft(null);
    }, []);

    const save = useCallback(async () => {
        if (!draft) return;
        if (!draft.name.trim()) {
            setSaveError("Give the playbook a name.");
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const input = draftToInput(draft);
            if (draft.id) await updatePlaybook(draft.id, input);
            else await createPlaybook(input);
            await refresh();
            closeEditor();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Failed to save playbook.");
        } finally {
            setSaving(false);
        }
    }, [draft, refresh, closeEditor]);

    const remove = useCallback(
        async (id: string) => {
            if (!window.confirm("Delete this playbook and all its rules?")) return;
            setDeletingId(id);
            try {
                await deletePlaybook(id);
                await refresh();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to delete playbook.");
            } finally {
                setDeletingId(null);
            }
        },
        [refresh],
    );

    // ── draft mutators ────────────────────────────────────────────────────────
    const setField = (patch: Partial<Draft>) =>
        setDraft((d) => (d ? { ...d, ...patch } : d));
    const setRule = (i: number, patch: Partial<DraftRule>) =>
        setDraft((d) =>
            d
                ? { ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }
                : d,
        );
    const addRule = () =>
        setDraft((d) =>
            d ? { ...d, rules: [...d.rules, { ...toDraftRule(emptyRule()), _open: true }] } : d,
        );
    const removeRule = (i: number) =>
        setDraft((d) => (d ? { ...d, rules: d.rules.filter((_, j) => j !== i) } : d));

    const headerActions = useMemo(
        () => [
            {
                label: "Build with AI",
                onClick: () =>
                    router.push(
                        `/agents?new=${encodeURIComponent(
                            "Build a negotiation playbook with me conversationally. Ask me about the agreement type and my standard positions (or review a precedent I attach), then propose rules (topic, preferred position, fallback, dealbreaker, severity) and create the playbook with create_playbook / upsert_playbook_rule once I confirm.",
                        )}`,
                    ),
                title: "Build a playbook conversationally with an agent",
            },
            { type: "new" as const, onClick: openNew, title: "New playbook" },
        ],
        [openNew, router],
    );

    return (
        <div className="flex h-full flex-col">
            <PageHeader shrink loading={loading} actions={headerActions}>
                <h1 className="font-serif text-2xl font-medium text-gray-900">
                    Playbooks
                </h1>
            </PageHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-16 md:px-8">
                <p className="mx-auto mt-2 max-w-3xl text-sm text-gray-500">
                    Playbooks encode your standard negotiating positions for an agreement
                    type. The assistant uses them via{" "}
                    <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">
                        review_against_playbook
                    </code>{" "}
                    to check a document clause-by-clause and flag deviations by severity.
                </p>

                {error && (
                    <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="mx-auto mt-6 max-w-3xl">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : playbooks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-14 text-center">
                            <ScrollText className="mx-auto h-8 w-8 text-gray-300" />
                            <p className="mt-3 text-sm font-medium text-gray-700">
                                No playbooks yet
                            </p>
                            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                                Create your first playbook to give the assistant a set of
                                standard positions to review contracts against.
                            </p>
                            <div className="mt-5 flex justify-center">
                                <PillButton tone="black" size="normal" onClick={openNew}>
                                    <Plus className="h-4 w-4" /> New playbook
                                </PillButton>
                            </div>
                        </div>
                    ) : (
                        <ul className="space-y-2">
                            {playbooks.map((pb) => (
                                <li
                                    key={pb.id}
                                    className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300 hover:shadow-sm"
                                >
                                    <button
                                        onClick={() => openExisting(pb.id)}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                    >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                                            <ScrollText className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-2">
                                                <span className="truncate text-sm font-medium text-gray-900">
                                                    {pb.name}
                                                </span>
                                                {pb.agreement_type && (
                                                    <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                                                        {pb.agreement_type}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-gray-500">
                                                {pb.rule_count}{" "}
                                                {pb.rule_count === 1 ? "position" : "positions"}
                                                {pb.description ? ` · ${pb.description}` : ""}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => remove(pb.id)}
                                        disabled={deletingId === pb.id}
                                        title="Delete playbook"
                                        className="shrink-0 rounded-lg p-2 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-40"
                                    >
                                        {deletingId === pb.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {editorOpen && draft && (
                <PlaybookEditor
                    draft={draft}
                    saving={saving}
                    error={saveError}
                    onClose={closeEditor}
                    onSave={save}
                    setField={setField}
                    setRule={setRule}
                    addRule={addRule}
                    removeRule={removeRule}
                />
            )}
        </div>
    );
}

interface EditorProps {
    draft: Draft;
    saving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: () => void;
    setField: (patch: Partial<Draft>) => void;
    setRule: (i: number, patch: Partial<DraftRule>) => void;
    addRule: () => void;
    removeRule: (i: number) => void;
}

const RULE_SEVERITIES = new Set(["low", "medium", "high"]);

function PlaybookEditor({
    draft,
    saving,
    error,
    onClose,
    onSave,
    setField,
    setRule,
    addRule,
    removeRule,
}: EditorProps) {
    const csvRef = useRef<HTMLInputElement>(null);
    const [importNote, setImportNote] = useState<string | null>(null);

    // C079 — append CSV rows to the draft; nothing persists until Save.
    // Columns: topic*, preferred, acceptable_fallback, dealbreaker,
    //          severity (low|medium|high), notes.
    const importCsv = async (file: File) => {
        setImportNote(null);
        const parsed = parseCsvRecords(await file.text());
        if (!parsed || parsed.records.length === 0) {
            setImportNote("No data rows found (a header row is required).");
            return;
        }
        if (!parsed.headers.includes("topic")) {
            setImportNote('CSV must have a "topic" column.');
            return;
        }
        let skipped = 0;
        const rules: DraftRule[] = [];
        for (const rec of parsed.records) {
            if (!rec.topic) {
                skipped++;
                continue;
            }
            const sev = (rec.severity || "medium").toLowerCase();
            rules.push({
                topic: rec.topic,
                preferred: rec.preferred ?? "",
                acceptable_fallback: rec.acceptable_fallback ?? "",
                dealbreaker: rec.dealbreaker ?? "",
                severity: (RULE_SEVERITIES.has(sev)
                    ? sev
                    : "medium") as PlaybookSeverity,
                notes: rec.notes ?? "",
                _open: false,
            });
        }
        setField({ rules: [...draft.rules, ...rules] });
        setImportNote(
            `${rules.length} position${rules.length === 1 ? "" : "s"} added${
                skipped ? `, ${skipped} skipped (missing topic)` : ""
            } — review and Save to keep.`,
        );
    };

    const downloadTemplate = () => {
        const blob = new Blob(
            [
                "topic,preferred,acceptable_fallback,dealbreaker,severity,notes\n",
            ],
            { type: "text/csv" },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "playbook-rules-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-gray-900/30 backdrop-blur-sm">
            <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                    <h2 className="text-base font-semibold text-gray-900">
                        {draft.id ? "Edit playbook" : "New playbook"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                    >
                        Close
                    </button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className={labelClass}>Name</label>
                            <input
                                className={inputClass}
                                value={draft.name}
                                placeholder="e.g. Standard NDA"
                                onChange={(e) => setField({ name: e.target.value })}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelClass}>Agreement type (optional)</label>
                            <input
                                className={inputClass}
                                value={draft.agreement_type}
                                placeholder="e.g. NDA, Consultancy Agreement, MSA"
                                onChange={(e) =>
                                    setField({ agreement_type: e.target.value })
                                }
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelClass}>Description (optional)</label>
                            <textarea
                                className={`${inputClass} min-h-[64px] resize-y`}
                                value={draft.description}
                                placeholder="When to use this playbook and any general guidance."
                                onChange={(e) =>
                                    setField({ description: e.target.value })
                                }
                            />
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-800">
                                Standard positions
                            </h3>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => csvRef.current?.click()}
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                                    title="Append positions from a CSV file"
                                >
                                    <Upload className="h-4 w-4" /> Import CSV
                                </button>
                                <button
                                    onClick={downloadTemplate}
                                    className="text-xs text-gray-400 underline hover:text-gray-600"
                                >
                                    template
                                </button>
                                <input
                                    ref={csvRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void importCsv(f);
                                        e.target.value = "";
                                    }}
                                />
                                <button
                                    onClick={addRule}
                                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
                                >
                                    <Plus className="h-4 w-4" /> Add position
                                </button>
                            </div>
                        </div>

                        {importNote && (
                            <p className="mb-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                                {importNote}
                            </p>
                        )}

                        {draft.rules.length === 0 && (
                            <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
                                No positions yet. Add the clauses you want the assistant to
                                check against.
                            </p>
                        )}

                        <div className="space-y-2">
                            {draft.rules.map((rule, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl border border-gray-200 bg-white"
                                >
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                                        <button
                                            onClick={() =>
                                                setRule(i, { _open: !rule._open })
                                            }
                                            className="text-gray-400 hover:text-gray-600"
                                            title={rule._open ? "Collapse" : "Expand"}
                                        >
                                            {rule._open ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </button>
                                        <input
                                            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400"
                                            value={rule.topic}
                                            placeholder="Topic — e.g. Indemnification, Governing law"
                                            onChange={(e) =>
                                                setRule(i, { topic: e.target.value })
                                            }
                                        />
                                        <select
                                            value={rule.severity}
                                            onChange={(e) =>
                                                setRule(i, {
                                                    severity: e.target
                                                        .value as PlaybookSeverity,
                                                })
                                            }
                                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-medium capitalize outline-none ${SEVERITY_STYLES[rule.severity]}`}
                                        >
                                            <option value="low">low</option>
                                            <option value="medium">medium</option>
                                            <option value="high">high</option>
                                        </select>
                                        <button
                                            onClick={() => removeRule(i)}
                                            title="Remove position"
                                            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {rule._open && (
                                        <div className="space-y-3 border-t border-gray-100 px-3 py-3">
                                            <div>
                                                <label className={labelClass}>
                                                    Preferred position
                                                </label>
                                                <textarea
                                                    className={`${inputClass} min-h-[48px] resize-y`}
                                                    value={rule.preferred}
                                                    placeholder="What you want the clause to say."
                                                    onChange={(e) =>
                                                        setRule(i, {
                                                            preferred: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>
                                                    Acceptable fallback
                                                </label>
                                                <textarea
                                                    className={`${inputClass} min-h-[48px] resize-y`}
                                                    value={rule.acceptable_fallback}
                                                    placeholder="What you can live with."
                                                    onChange={(e) =>
                                                        setRule(i, {
                                                            acceptable_fallback:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>
                                                    Dealbreaker
                                                </label>
                                                <textarea
                                                    className={`${inputClass} min-h-[48px] resize-y`}
                                                    value={rule.dealbreaker}
                                                    placeholder="What you must reject."
                                                    onChange={(e) =>
                                                        setRule(i, {
                                                            dealbreaker: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Notes</label>
                                                <textarea
                                                    className={`${inputClass} min-h-[40px] resize-y`}
                                                    value={rule.notes}
                                                    placeholder="Any extra context for the assistant."
                                                    onChange={(e) =>
                                                        setRule(i, {
                                                            notes: e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
                    <span className="text-sm text-red-600">{error}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="rounded-full px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                        >
                            Cancel
                        </button>
                        <PillButton
                            tone="black"
                            size="normal"
                            onClick={onSave}
                            disabled={saving}
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {draft.id ? "Save changes" : "Create playbook"}
                        </PillButton>
                    </div>
                </div>
            </div>
        </div>
    );
}
