/**
 * AustLII verification source (human-in-the-loop).
 *
 * The server never fetches AustLII. It builds an ordinary AustLII search link;
 * the user's own browser opens AustLII in a new tab (permitted individual
 * end-use), the user verifies the citation themselves, and records the outcome
 * in the UI. Nothing from AustLII is fetched, cached or passed to the model —
 * only the user's verified/not-verified decision.
 */

import type {
  VerificationRequest,
  VerificationResult,
  VerificationSource,
} from "../types";

const ID = "austlii";
const LABEL = "AustLII";
const AUSTLII_SEARCH_BASE = "https://www.austlii.edu.au/cgi-bin/sinosrch.cgi";

/** Build a human-facing AustLII search URL (opened by the user's browser). */
export function buildAustliiSearchUrl(query: string): string {
  const params = new URLSearchParams({ method: "auto", query });
  return `${AUSTLII_SEARCH_BASE}?${params.toString()}`;
}

export const austliiSource: VerificationSource = {
  id: ID,
  label: LABEL,
  mode: "human",
  async verify(req: VerificationRequest): Promise<VerificationResult> {
    const query =
      req.caseName && req.caseName.trim() ? req.caseName.trim() : req.citation;
    return {
      status: "needs_human",
      sourceId: ID,
      sourceLabel: LABEL,
      mode: "human",
      citation: req.citation,
      searchUrl: buildAustliiSearchUrl(query),
      message:
        "Open AustLII, confirm this citation yourself, then record the outcome (Verified / Not verified).",
    };
  },
};
