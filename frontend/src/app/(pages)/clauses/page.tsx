"use client";

/**
 * C026 — My Clauses: personal preferred-provision library.
 * List / semantic search / add / delete. Clauses are also saved from chat
 * via the save_clause tool and reused by drafting agents.
 */

import { useCallback, useEffect, useState } from "react";
import { BookMarked, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import {
    createClause,
    deleteClause,
    listClauses,
    type Clause,
} from "@/app/lib/mikeApi";

const AGREEMENT_TYPES = [
    "",
    "NDA",
    "MSA",
    "CRO",
    "work_order",
    "distribution",
    "other",
];

export default function ClausesPage() {
    const { user } = useAuth();
    const [clauses, setClauses] = useState<Clause[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [draft, setDraft] = useState({
        title: "",
        body: "",
        agreement_type: "",
        guidance: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (q?: string) => {
        setLoading(true);
        try {
            const { clauses } = await listClauses(q);
            setClauses(clauses);
        } catch {
            /* transient */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) void refresh();
    }, [user, refresh]);

    const submitNew = async () => {
        if (!draft.title.trim() || !draft.body.trim() || saving) return;
        setSaving(true);
        setError(null);
        try {
            await createClause({
                title: draft.title.trim(),
                body: draft.body.trim(),
                agreement_type: draft.agreement_type || null,
                guidance: draft.guidance.trim() || null,
            });
            setShowNew(false);
            setDraft({ title: "", body: "", agreement_type: "", guidance: "" });
            await refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save clause");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
            <div className="mb-5 flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                    <BookMarked className="h-5 w-5" /> My Clauses
                </h1>
                <button
                    onClick={() => setShowNew(true)}
                    className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                >
                    <Plus className="h-4 w-4" /> New clause
                </button>
            </div>
            <p className="mb-4 text-sm text-gray-500">
                Your preferred contract provisions. Drafting agents and playbook
                reviews reuse these automatically; you can also save clauses
                from chat (&ldquo;save this clause&rdquo;).
            </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    void refresh(query.trim() || undefined);
                }}
                className="mb-4 flex items-center gap-2"
            >
                <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search clauses semantically, e.g. 'liability cap'"
                        className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-gray-400"
                    />
                </div>
                <button
                    type="submit"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                    Search
                </button>
            </form>

            {loading ? (
                <div className="flex justify-center p-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
            ) : clauses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
                    No clauses yet — add your first preferred provision.
                </p>
            ) : (
                <ul className="space-y-3">
                    {clauses.map((c) => (
                        <li
                            key={c.id}
                            className="rounded-xl border border-gray-200 bg-white p-4"
                        >
                            <div className="mb-1 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {c.title}
                                    {c.agreement_type && (
                                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                            {c.agreement_type}
                                        </span>
                                    )}
                                </h3>
                                <button
                                    onClick={() =>
                                        void deleteClause(c.id).then(() =>
                                            refresh(),
                                        )
                                    }
                                    className="text-gray-300 hover:text-red-600"
                                    title="Delete clause"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                                {c.body}
                            </pre>
                            {c.guidance && (
                                <p className="mt-2 text-xs text-gray-500">
                                    <span className="font-medium">Guidance:</span>{" "}
                                    {c.guidance}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {showNew && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-medium font-serif text-gray-900">
                                New clause
                            </h3>
                            <button
                                onClick={() => setShowNew(false)}
                                className="text-gray-400 hover:text-gray-700"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <input
                            value={draft.title}
                            onChange={(e) =>
                                setDraft({ ...draft, title: e.target.value })
                            }
                            placeholder="Title, e.g. 'Mutual limitation of liability (AUD cap)'"
                            className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <select
                            value={draft.agreement_type}
                            onChange={(e) =>
                                setDraft({
                                    ...draft,
                                    agreement_type: e.target.value,
                                })
                            }
                            className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700"
                        >
                            {AGREEMENT_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {t || "Agreement type (optional)"}
                                </option>
                            ))}
                        </select>
                        <textarea
                            value={draft.body}
                            onChange={(e) =>
                                setDraft({ ...draft, body: e.target.value })
                            }
                            rows={6}
                            placeholder="The clause text…"
                            className="mb-2 w-full resize-y rounded-md border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                        />
                        <textarea
                            value={draft.guidance}
                            onChange={(e) =>
                                setDraft({ ...draft, guidance: e.target.value })
                            }
                            rows={2}
                            placeholder="Usage guidance (optional)…"
                            className="mb-3 w-full resize-y rounded-md border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                        />
                        {error && (
                            <p className="mb-2 text-xs text-red-600">{error}</p>
                        )}
                        <button
                            onClick={() => void submitNew()}
                            disabled={
                                !draft.title.trim() ||
                                !draft.body.trim() ||
                                saving
                            }
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            {saving && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            Save clause
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
