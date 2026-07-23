/**
 * C079 — minimal dependency-free CSV parsing (RFC 4180-ish).
 * Handles quoted fields, escaped quotes ("") and newlines inside quotes.
 * Used by the bulk-import endpoints (clauses, playbook rules).
 */

export function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    // Strip BOM.
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(field);
            field = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
        } else {
            field += ch;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    // Drop fully-empty trailing rows.
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Parse a CSV with a header row into records keyed by normalised header name
 * (lowercased, spaces → underscores). Returns null when there is no header.
 */
export function parseCsvRecords(
    text: string,
): { headers: string[]; records: Record<string, string>[] } | null {
    const rows = parseCsv(text);
    if (rows.length === 0) return null;
    const headers = rows[0].map((h) =>
        h.trim().toLowerCase().replace(/\s+/g, "_"),
    );
    const records = rows.slice(1).map((r) => {
        const rec: Record<string, string> = {};
        headers.forEach((h, i) => {
            if (h) rec[h] = (r[i] ?? "").trim();
        });
        return rec;
    });
    return { headers, records };
}
