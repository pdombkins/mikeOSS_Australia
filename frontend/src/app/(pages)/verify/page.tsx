"use client";

/**
 * C024 — Deep-verify page. Paste text (or arrive from a chat/agent link),
 * see per-assertion verdicts. When Jade content access is off, each open
 * assertion shows outbound Jade/AustLII search links (the USER opens them —
 * Mike never fetches AustLII) and a verdict control; the report completes
 * only when every assertion is adjudicated.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BadgeCheck,
    ExternalLink,
    Loader2,
    ShieldCheck,
    User,
} from "lucide-react";
import { apiVerifyText, getVerifyReport, listVerifyReports, setAssertionVerdict } from "@/app/lib/mikeApi";
import type { VerifyAssertion, VerifyReportSummary } from "@/app/lib/mikeApi";

const VERDICT_LABELS: Record<string, string> = {
    supported: "Supported",
    partially_supported: "Partially supported",
    not_supported: "Not supported",
    misattributed: "Misattributed",
    not_content_verified: "Not content-verified",
};

const VERDICT_STYLES: Record<string, string> = {
    supported: "bg-green-100 text-green-800",
    partially_supported: "bg-amber-100 text-amber-800",
    not_supported: "bg-red-100 text-red-700",
    misattributed: "bg-red-100 text-red-700",
    not_content_verified: "bg-gray-100 text-gray-600",
};

function VerifyPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reportId = searchParams.get("report");

    const [text, setText] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reports, setReports] = useState<VerifyReportSummary[]>([]);
    const [report, setReport] = useState<{
        status: string;
        assertions: VerifyAssertion[];
        jadeChecking?: boolean;
    } | null>(null);

    const refreshReport = useCallback(async () => {
        if (!reportId) return;
        try {
            const d = await getVerifyReport(reportId);
            setReport({
                status: d.report.status,
                assertions: d.assertions,
            });
        } catch {
            /* transient */
        }
    }, [reportId]);

    useEffect(() => {
        void listVerifyReports()
            .then(({ reports }) => setReports(reports))
            .catch(() => {});
    }, [reportId]);

    useEffect(() => {
        setReport(null);
        void refreshReport();
    }, [reportId, refreshReport]);

    const run = async () => {
        if (!text.trim() || running) return;
        setRunning(true);
        setError(null);
        try {
            const { report_id } = await apiVerifyText(text.trim());
            setText("");
            router.push(`/verify?report=${report_id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Verification failed");
        } finally {
            setRunning(false);
        }
    };

    const recordVerdict = async (
        assertionId: string,
        verdict: string,
        note?: string,
    ) => {
        if (!reportId) return;
        await setAssertionVerdict(reportId, assertionId, verdict, note);
        await refreshReport();
    };

    return (
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
            <h1 className="mb-2 flex items-center gap-2 text-2xl font-medium font-serif text-gray-900">
                <ShieldCheck className="h-5 w-5" /> Verify citations
            </h1>
            <p className="mb-5 text-sm text-gray-500">
                Deep-verify checks that every cited authority exists and — where
                judgment text is accessible — that it supports the assertion
                made. Where content checking is unavailable, verify each
                authority yourself using the search links, then record your
                verdict. A report is complete only when every assertion is
                adjudicated.
            </p>

            {!reportId && (
                <>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={6}
                        placeholder="Paste the passage to verify, e.g. a research memo section containing citations like [2024] HCA 5…"
                        className="mb-2 w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                        onClick={() => void run()}
                        disabled={!text.trim() || running}
                        className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                        {running && <Loader2 className="h-4 w-4 animate-spin" />}
                        Verify
                    </button>
                    {error && (
                        <p className="mt-2 text-xs text-red-600">{error}</p>
                    )}
                    {reports.length > 0 && (
                        <div className="mt-8">
                            <h2 className="mb-2 text-sm font-semibold text-gray-700">
                                Previous reports
                            </h2>
                            <ul className="space-y-1.5">
                                {reports.map((r) => (
                                    <li key={r.id}>
                                        <button
                                            onClick={() =>
                                                router.push(
                                                    `/verify?report=${r.id}`,
                                                )
                                            }
                                            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50"
                                        >
                                            <span className="truncate text-gray-700">
                                                {r.source_excerpt?.slice(0, 80) ??
                                                    r.id}
                                            </span>
                                            <span
                                                className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === "complete" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                                            >
                                                {r.status}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            {reportId && !report && (
                <div className="flex justify-center p-10">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
            )}

            {reportId && report && (
                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <button
                            onClick={() => router.push("/verify")}
                            className="text-sm text-gray-500 hover:text-gray-800"
                        >
                            ← New verification
                        </button>
                        <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${report.status === "complete" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
                        >
                            {report.status === "complete"
                                ? "Complete"
                                : "Awaiting validation"}
                        </span>
                    </div>
                    {report.assertions.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
                            No assertion–citation pairs were found in the text.
                        </p>
                    ) : (
                        <ol className="space-y-3">
                            {report.assertions.map((a) => (
                                <li
                                    key={a.id}
                                    className="rounded-xl border border-gray-200 bg-white p-4"
                                >
                                    <div className="mb-1 flex items-start justify-between gap-3">
                                        <p className="text-sm text-gray-800">
                                            <span className="font-semibold">
                                                {a.position}.
                                            </span>{" "}
                                            {a.assertion}
                                        </p>
                                        {a.verdict && (
                                            <span
                                                className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT_STYLES[a.verdict] ?? "bg-gray-100 text-gray-600"}`}
                                            >
                                                {a.verifier === "human" ? (
                                                    <User className="h-3 w-3" />
                                                ) : (
                                                    <BadgeCheck className="h-3 w-3" />
                                                )}
                                                {VERDICT_LABELS[a.verdict] ??
                                                    a.verdict}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mb-2 text-xs text-gray-500">
                                        Citation:{" "}
                                        <span className="font-mono">
                                            {a.citation}
                                        </span>
                                        {a.citation_valid === true && (
                                            <span className="ml-2 text-green-600">
                                                citation exists (Jade)
                                            </span>
                                        )}
                                        {a.citation_valid === false && (
                                            <span className="ml-2 text-red-600">
                                                citation NOT found (Jade)
                                            </span>
                                        )}
                                    </p>
                                    {a.supporting_passage && (
                                        <blockquote className="mb-2 border-l-2 border-gray-300 pl-3 text-xs italic text-gray-600">
                                            {a.supporting_passage}
                                        </blockquote>
                                    )}
                                    {a.note && (
                                        <p className="mb-2 text-xs text-gray-500">
                                            Note: {a.note}
                                        </p>
                                    )}
                                    {!a.verdict && (
                                        <div className="mt-2 rounded-lg bg-blue-50/60 p-3">
                                            <p className="mb-2 text-xs font-medium text-gray-700">
                                                Verify this authority yourself,
                                                then record a verdict:
                                            </p>
                                            <div className="mb-2 flex flex-wrap gap-2">
                                                {a.jade_url && (
                                                    <a
                                                        href={a.jade_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Search Jade{" "}
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                                {a.austlii_url && (
                                                    <a
                                                        href={a.austlii_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Search AustLII{" "}
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Object.entries(VERDICT_LABELS)
                                                    .filter(
                                                        ([v]) =>
                                                            v !==
                                                            "not_content_verified",
                                                    )
                                                    .map(([v, label]) => (
                                                        <button
                                                            key={v}
                                                            onClick={() =>
                                                                void recordVerdict(
                                                                    a.id,
                                                                    v,
                                                                )
                                                            }
                                                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80 ${VERDICT_STYLES[v]} border-transparent`}
                                                        >
                                                            {label}
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={null}>
            <VerifyPageInner />
        </Suspense>
    );
}
