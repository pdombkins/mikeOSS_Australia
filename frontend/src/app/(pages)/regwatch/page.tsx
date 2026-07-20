"use client";

/**
 * C018 — Regulatory monitoring. Watch CRUD + event feed.
 * Sources are official government/regulator RSS feeds only.
 */

import { useCallback, useEffect, useState } from "react";
import {
    ExternalLink,
    Loader2,
    Plus,
    Radar,
    RefreshCw,
    Trash2,
    X,
} from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import {
    createRegWatch,
    deleteRegWatch,
    getRegWatchEvents,
    listRegSources,
    listRegWatches,
    markRegEventsSeen,
    triggerRegScan,
    type RegEvent,
    type RegSource,
    type RegWatch,
} from "@/app/lib/mikeApi";

function timeAgo(iso: string | null): string {
    if (!iso) return "";
    const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

export default function RegwatchPage() {
    const { user } = useAuth();
    const [watches, setWatches] = useState<RegWatch[]>([]);
    const [sources, setSources] = useState<RegSource[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [events, setEvents] = useState<RegEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [draft, setDraft] = useState({
        name: "",
        topics: "",
        sources: new Set<string>(),
    });
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const { watches } = await listRegWatches();
            setWatches(watches);
        } catch {
            /* transient */
        }
    }, []);

    useEffect(() => {
        if (!user) return;
        void refresh();
        void listRegSources()
            .then(({ sources }) => setSources(sources))
            .catch(() => {});
    }, [user, refresh]);

    useEffect(() => {
        if (!selected) return setEvents([]);
        setLoadingEvents(true);
        void getRegWatchEvents(selected)
            .then(({ events }) => setEvents(events))
            .catch(() => setEvents([]))
            .finally(() => setLoadingEvents(false));
    }, [selected]);

    const scanNow = async () => {
        setScanning(true);
        try {
            await triggerRegScan();
            await refresh();
            if (selected) {
                const { events } = await getRegWatchEvents(selected);
                setEvents(events);
            }
        } finally {
            setScanning(false);
        }
    };

    const createWatch = async () => {
        if (!draft.name.trim() || saving) return;
        setSaving(true);
        try {
            await createRegWatch({
                name: draft.name.trim(),
                topics: draft.topics
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                sources: [...draft.sources],
            });
            setShowNew(false);
            setDraft({ name: "", topics: "", sources: new Set() });
            await refresh();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-8">
            <div className="w-80 shrink-0">
                <div className="mb-3 flex items-center justify-between">
                    <h1 className="flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                        <Radar className="h-5 w-5" /> Regulatory
                    </h1>
                    <button
                        onClick={() => void scanNow()}
                        disabled={scanning}
                        title="Scan feeds now"
                        className="rounded-md border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                        {scanning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                    </button>
                </div>
                <p className="mb-3 text-xs text-gray-500">
                    Monitors official government and regulator feeds
                    (legislation.gov.au, ASIC, ACCC, OAIC, APRA, FWO,
                    legislation.govt.nz) for topics you watch.
                </p>
                <button
                    onClick={() => setShowNew(true)}
                    className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white"
                >
                    <Plus className="h-4 w-4" /> New watch
                </button>
                <ul className="space-y-1.5">
                    {watches.map((w) => (
                        <li key={w.id}>
                            <button
                                onClick={() => setSelected(w.id)}
                                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${selected === w.id ? "border-gray-400 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-900">
                                        {w.name}
                                    </p>
                                    <p className="truncate text-xs text-gray-400">
                                        {w.topics.join(", ") || "All items"}
                                    </p>
                                </div>
                                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                                    {w.new_count > 0 && (
                                        <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                            {w.new_count}
                                        </span>
                                    )}
                                    <Trash2
                                        className="h-3.5 w-3.5 text-gray-300 hover:text-red-600"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void deleteRegWatch(w.id).then(
                                                () => {
                                                    if (selected === w.id)
                                                        setSelected(null);
                                                    void refresh();
                                                },
                                            );
                                        }}
                                    />
                                </div>
                            </button>
                        </li>
                    ))}
                    {watches.length === 0 && (
                        <li className="text-sm text-gray-400">
                            No watches yet.
                        </li>
                    )}
                </ul>
            </div>

            <div className="min-w-0 flex-1">
                {!selected ? (
                    <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
                        Select a watch to see its events.
                    </div>
                ) : loadingEvents ? (
                    <div className="flex justify-center p-10">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <div>
                        <div className="mb-3 flex justify-end">
                            <button
                                onClick={() =>
                                    void markRegEventsSeen(selected).then(() => {
                                        void refresh();
                                        void getRegWatchEvents(selected).then(
                                            ({ events }) => setEvents(events),
                                        );
                                    })
                                }
                                className="text-xs text-gray-500 hover:text-gray-800"
                            >
                                Mark all seen
                            </button>
                        </div>
                        {events.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
                                No events yet — feeds are scanned every 6 hours
                                (or scan now).
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {events.map((e) => (
                                    <li
                                        key={e.id}
                                        className={`rounded-xl border p-4 ${e.status === "new" ? "border-blue-200 bg-blue-50/50" : "border-gray-200 bg-white"}`}
                                    >
                                        <div className="mb-1 flex items-start justify-between gap-3">
                                            <a
                                                href={e.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:underline"
                                            >
                                                {e.title}
                                                <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                                            </a>
                                            <span className="shrink-0 text-xs text-gray-400">
                                                {timeAgo(
                                                    e.published_at ??
                                                        e.created_at,
                                                )}
                                            </span>
                                        </div>
                                        {e.relevance && (
                                            <p className="text-xs font-medium text-blue-700">
                                                {e.relevance}
                                            </p>
                                        )}
                                        {e.summary && (
                                            <p className="mt-1 text-xs text-gray-600">
                                                {e.summary}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {showNew && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/30 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-lg font-medium font-serif text-gray-900">
                                New regulatory watch
                            </h3>
                            <button
                                onClick={() => setShowNew(false)}
                                className="text-gray-400 hover:text-gray-700"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <input
                            value={draft.name}
                            onChange={(e) =>
                                setDraft({ ...draft, name: e.target.value })
                            }
                            placeholder="Name, e.g. 'Privacy & data'"
                            className="mb-2 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <input
                            value={draft.topics}
                            onChange={(e) =>
                                setDraft({ ...draft, topics: e.target.value })
                            }
                            placeholder="Topics, comma-separated (e.g. privacy, data breach, APP)"
                            className="mb-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                        />
                        <p className="mb-1 text-xs font-medium text-gray-700">
                            Sources (all if none selected)
                        </p>
                        <div className="mb-3 max-h-40 overflow-auto rounded-md border border-gray-100">
                            {sources.map((s) => (
                                <label
                                    key={s.id}
                                    className="flex cursor-pointer items-center gap-2 border-b border-gray-50 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={draft.sources.has(s.id)}
                                        onChange={(e) => {
                                            const next = new Set(draft.sources);
                                            if (e.target.checked)
                                                next.add(s.id);
                                            else next.delete(s.id);
                                            setDraft({
                                                ...draft,
                                                sources: next,
                                            });
                                        }}
                                    />
                                    <span>
                                        {s.label}{" "}
                                        <span className="text-gray-400">
                                            ({s.jurisdiction})
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <button
                            onClick={() => void createWatch()}
                            disabled={!draft.name.trim() || saving}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                        >
                            {saving && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            Create watch
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
