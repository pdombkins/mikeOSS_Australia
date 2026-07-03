/**
 * /austlii — REST endpoints for AustLII case law and legislation search.
 *
 * These endpoints are consumed by the frontend for displaying search results
 * and are also called internally from the AI tool dispatch in chatTools.ts.
 *
 * All routes require authentication via the standard Mike requireAuth middleware.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  searchAustliiCases,
  searchAustliiLegislation,
  validateAustliiCitation,
  fetchAustliiDocument,
  formatAGLC4Citation,
  type Jurisdiction,
} from "../lib/austlii";

export const austliiRouter = Router();
austliiRouter.use(requireAuth);

const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: Parameters<typeof console.log>) => {
  if (isDev) console.log(...args);
};

const VALID_JURISDICTIONS = new Set<string>([
  "cth", "federal", "nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act", "nz", "other",
]);

function parseJurisdiction(value: unknown): Jurisdiction | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.toLowerCase().trim();
  return VALID_JURISDICTIONS.has(v) ? (v as Jurisdiction) : undefined;
}

function parseLimit(value: unknown): number {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 10;
}

// ── GET /austlii/search/cases ─────────────────────────────────────────────────

austliiRouter.get("/search/cases", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.status(400).json({ detail: "query is required" });
  }

  const jurisdiction = parseJurisdiction(req.query.jurisdiction);
  const limit = parseLimit(req.query.limit);
  const sortBy = req.query.sortBy === "relevance" || req.query.sortBy === "date"
    ? req.query.sortBy
    : "auto";

  devLog("[austlii/search/cases]", { query, jurisdiction, limit, sortBy });

  try {
    const results = await searchAustliiCases({
      query,
      jurisdiction,
      limit,
      sortBy: sortBy as "auto" | "relevance" | "date",
    });
    return res.json({ query, jurisdiction, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AustLII search failed";
    devLog("[austlii/search/cases] error", message);
    return res.status(502).json({ detail: message });
  }
});

// ── GET /austlii/search/legislation ──────────────────────────────────────────

austliiRouter.get("/search/legislation", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.status(400).json({ detail: "query is required" });
  }

  const jurisdiction = parseJurisdiction(req.query.jurisdiction);
  const limit = parseLimit(req.query.limit);

  devLog("[austlii/search/legislation]", { query, jurisdiction, limit });

  try {
    const results = await searchAustliiLegislation({ query, jurisdiction, limit });
    return res.json({ query, jurisdiction, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AustLII legislation search failed";
    return res.status(502).json({ detail: message });
  }
});

// ── GET /austlii/validate-citation ────────────────────────────────────────────

austliiRouter.get("/validate-citation", async (req, res) => {
  const citation =
    typeof req.query.citation === "string" ? req.query.citation.trim() : "";
  if (!citation) {
    return res.status(400).json({ detail: "citation is required" });
  }

  devLog("[austlii/validate-citation]", { citation });

  try {
    const result = await validateAustliiCitation(citation);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Citation validation failed";
    return res.status(502).json({ detail: message });
  }
});

// ── POST /austlii/fetch-document ──────────────────────────────────────────────

austliiRouter.post("/fetch-document", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return res.status(400).json({ detail: "url is required" });
  }

  devLog("[austlii/fetch-document]", { url });

  try {
    const result = await fetchAustliiDocument(url);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document fetch failed";
    if (message.includes("Only austlii.edu.au")) {
      return res.status(400).json({ detail: message });
    }
    return res.status(502).json({ detail: message });
  }
});

// ── POST /austlii/format-citation ─────────────────────────────────────────────

austliiRouter.post("/format-citation", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const caseName = typeof body.caseName === "string" ? body.caseName.trim() : "";
  if (!caseName) {
    return res.status(400).json({ detail: "caseName is required" });
  }

  const formatted = formatAGLC4Citation({
    caseName,
    neutralCitation: typeof body.neutralCitation === "string" ? body.neutralCitation : undefined,
    reportedCitation: typeof body.reportedCitation === "string" ? body.reportedCitation : undefined,
    pinpoint: typeof body.pinpoint === "string" ? body.pinpoint : undefined,
  });

  return res.json({ citation: formatted });
});
