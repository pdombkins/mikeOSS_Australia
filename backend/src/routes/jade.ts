/**
 * /jade — REST endpoints for Jade.io case law and legislation lookups.
 *
 * These endpoints are consumed by the frontend and are also called internally
 * from the AI tool dispatch in chatTools.ts.
 *
 * ⚠️  RESEARCH & EDUCATIONAL USE ONLY. Jade.io requires prior written
 * permission for automated access — obtain it before enabling in a deployment.
 *
 * All routes require authentication via the standard Mike requireAuth middleware.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  searchJadeCases,
  searchJadeLegislation,
  validateJadeCitation,
  fetchJadeDocument,
  formatAGLC4Citation,
  type Jurisdiction,
} from "../lib/jade";

export const jadeRouter = Router();
jadeRouter.use(requireAuth);

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

// ── GET /jade/search/cases ────────────────────────────────────────────────────

jadeRouter.get("/search/cases", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.status(400).json({ detail: "query is required" });
  }

  const jurisdiction = parseJurisdiction(req.query.jurisdiction);
  const limit = parseLimit(req.query.limit);
  const sortBy = req.query.sortBy === "relevance" || req.query.sortBy === "date"
    ? req.query.sortBy
    : "auto";

  devLog("[jade/search/cases]", { query, jurisdiction, limit, sortBy });

  try {
    const results = await searchJadeCases({
      query,
      jurisdiction,
      limit,
      sortBy: sortBy as "auto" | "relevance" | "date",
    });
    return res.json({ query, jurisdiction, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jade.io search failed";
    devLog("[jade/search/cases] error", message);
    return res.status(502).json({ detail: message });
  }
});

// ── GET /jade/search/legislation ──────────────────────────────────────────────

jadeRouter.get("/search/legislation", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    return res.status(400).json({ detail: "query is required" });
  }

  const jurisdiction = parseJurisdiction(req.query.jurisdiction);
  const limit = parseLimit(req.query.limit);

  devLog("[jade/search/legislation]", { query, jurisdiction, limit });

  try {
    const results = await searchJadeLegislation({ query, jurisdiction, limit });
    return res.json({ query, jurisdiction, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jade.io legislation search failed";
    return res.status(502).json({ detail: message });
  }
});

// ── GET /jade/validate-citation ───────────────────────────────────────────────

jadeRouter.get("/validate-citation", async (req, res) => {
  const citation =
    typeof req.query.citation === "string" ? req.query.citation.trim() : "";
  if (!citation) {
    return res.status(400).json({ detail: "citation is required" });
  }

  devLog("[jade/validate-citation]", { citation });

  try {
    const result = await validateJadeCitation(citation);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Citation validation failed";
    return res.status(502).json({ detail: message });
  }
});

// ── POST /jade/fetch-document ─────────────────────────────────────────────────

jadeRouter.post("/fetch-document", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return res.status(400).json({ detail: "url is required" });
  }

  devLog("[jade/fetch-document]", { url });

  try {
    const result = await fetchJadeDocument(url);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Document fetch failed";
    if (message.includes("Only jade.io")) {
      return res.status(400).json({ detail: message });
    }
    return res.status(502).json({ detail: message });
  }
});

// ── POST /jade/format-citation ────────────────────────────────────────────────

jadeRouter.post("/format-citation", async (req, res) => {
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
