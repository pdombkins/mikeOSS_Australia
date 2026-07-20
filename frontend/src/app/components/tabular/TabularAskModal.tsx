"use client";

/**
 * C025 — Tabular Analysis: one question across many documents.
 * Picks Library files, creates a single-column review via /tabular-review/ask,
 * then navigates to the review (generation starts from the review page).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Grid2x2Check, Loader2, X } from "lucide-react";
import { getLibrary, tabularAsk } from "@/app/lib/mikeApi";
import type { Document } from "@/app/components/shared/types";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function TabularAskModal({ open, onClose }: Props) {
    const router = useRouter();
    const [question, setQuestion] = useState("");
    const [docs, setDocs] = useState<Document[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState("");
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoadingDocs(true);
        getLibrary("files")
            .then(({ documents }) => setDocs(documents))
            .catch(() => setDocs([]))
            .finally(() => setLoadingDocs(false));
    }, [open]);

    const filtered = useMemo(
        () =>
            filter.trim()
                ? docs.filter((d) =>
                      d.filename
                          .toLowerCase()
                          .includes(filter.trim().toLowerCase()),
                  )
                : docs,
        [docs, filter],
    );

    if (!open) return null;

    const submit = async () => {
        if (!question.trim() || selected.size === 0 || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const { review_id } = await tabularAsk({
                question: question.trim(),
                document_ids: [...selected],
            });
            onClose();
            router.push(`/tabular-reviews/${review_id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create analysis");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/30 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-lg font-medium font-serif text-gray-900">
                        <Grid2x2Check className="h-5 w-5" />
                        Ask across documents
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={2}
                    placeholder="e.g. What is the termination notice period?"
                    className="mb-3 w-full resize-none rounded-md border border-gray-200 p-2 text-sm outline-none focus:border-gray-400"
                />
                <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter documents…"
                    className="mb-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                />
                <div className="mb-3 max-h-56 overflow-auto rounded-md border border-gray-100">
                    {loadingDocs ? (
                        <div className="flex items-center justify-center p-6">
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="p-4 text-xs text-gray-400">
                            No documents in your Library files.
                        </p>
                    ) : (
                        filtered.map((d) => (
                            <label
                                key={d.id}
                                className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.has(d.id)}
                                    onChange={(e) => {
                                        const next = new Set(selected);
                                        if (e.target.checked) next.add(d.id);
                                        else next.delete(d.id);
                                        setSelected(next);
                                    }}
                                />
                                <span className="truncate">{d.filename}</span>
                            </label>
                        ))
                    )}
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {selected.size} selected (max 20)
                    </span>
                    <button
                        onClick={() => void submit()}
                        disabled={
                            !question.trim() ||
                            selected.size === 0 ||
                            selected.size > 20 ||
                            submitting
                        }
                        className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                        {submitting && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Create analysis
                    </button>
                </div>
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </div>
        </div>
    );
}
