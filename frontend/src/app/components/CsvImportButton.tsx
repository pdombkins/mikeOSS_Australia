"use client";

/**
 * C079 — shared bulk CSV import button. Reads a local .csv file, hands the
 * text to the caller's import function, and shows a per-row outcome summary.
 * Used on My Clauses and the playbook editor.
 */

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import type { ImportResult } from "@/app/lib/mikeApi";

export default function CsvImportButton({
    onImport,
    templateHeaders,
    templateFilename,
    label = "Import CSV",
}: {
    onImport: (csv: string) => Promise<ImportResult>;
    /** Header row offered as a downloadable starter template. */
    templateHeaders: string[];
    templateFilename: string;
    label?: string;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFile = async (file: File) => {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const text = await file.text();
            setResult(await onImport(text));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Import failed");
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const downloadTemplate = () => {
        const blob = new Blob([templateHeaders.join(",") + "\n"], {
            type: "text/csv",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = templateFilename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="inline-flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Upload className="h-4 w-4" />
                    )}
                    {label}
                </button>
                <button
                    type="button"
                    onClick={downloadTemplate}
                    className="text-xs text-gray-500 underline hover:text-gray-700"
                >
                    template
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                    }}
                />
            </div>
            {(result || error) && (
                <div
                    className={`relative max-w-md rounded-md border px-3 py-2 pr-8 text-xs ${
                        error
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-gray-200 bg-gray-50 text-gray-700"
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => {
                            setResult(null);
                            setError(null);
                        }}
                        className="absolute right-1.5 top-1.5 text-gray-400 hover:text-gray-600"
                        aria-label="Dismiss"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                    {error ? (
                        error
                    ) : (
                        <>
                            <span className="font-medium">
                                {result!.imported} imported
                            </span>
                            {result!.skipped.length > 0 && (
                                <>
                                    , {result!.skipped.length} skipped:
                                    <ul className="mt-1 list-disc pl-4">
                                        {result!.skipped
                                            .slice(0, 8)
                                            .map((s) => (
                                                <li key={s.row}>
                                                    row {s.row}: {s.reason}
                                                </li>
                                            ))}
                                        {result!.skipped.length > 8 && (
                                            <li>
                                                …and{" "}
                                                {result!.skipped.length - 8}{" "}
                                                more
                                            </li>
                                        )}
                                    </ul>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
