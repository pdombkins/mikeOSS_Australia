"use client";

/**
 * Deploy-target note: DocxView, PdfView, and SpreadsheetView each pull in a
 * heavy client-only rendering library (docx-preview, pdfjs-dist,
 * @fortune-sheet/react + luckyexcel respectively). Those libraries already
 * lazy-load themselves at runtime (inside useEffect), but on Cloudflare
 * Workers (via OpenNext) the whole app is bundled into a single worker
 * script with no on-demand chunk loading — so anything reachable from a
 * component that's part of the SSR render tree gets inlined into that one
 * file, blowing well past the Workers size limit (3 MiB free / 10 MiB paid).
 *
 * next/dynamic with `ssr: false` is a build-time signal Next.js understands:
 * it excludes the component (and everything it imports) from the SSR/server
 * bundle entirely, loading it purely client-side instead. Import these
 * wrappers instead of the view components directly wherever they're used.
 */

import dynamic from "next/dynamic";

export const DocxView = dynamic(
    () => import("./DocxView").then((m) => m.DocxView),
    { ssr: false },
);

export const PdfView = dynamic(
    () => import("./PdfView").then((m) => m.PdfView),
    { ssr: false },
);

export const SpreadsheetView = dynamic(
    () => import("./SpreadsheetView").then((m) => m.SpreadsheetView),
    { ssr: false },
);
