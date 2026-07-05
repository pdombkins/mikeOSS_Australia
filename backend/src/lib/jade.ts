/**
 * Jade.io integration for Mike OSS
 *
 * Provides Australian case-law citation validation, judgment retrieval and
 * AGLC4 citation formatting via Jade.io (BarNet).
 *
 * ⚠️  PERMISSION REQUIRED — RESEARCH & EDUCATIONAL USE ONLY.
 * Jade.io's Acceptable Use Policy prohibits automated access without BarNet's
 * prior written permission. This module is provided for research and
 * educational purposes only. Obtain written permission from Jade.io before
 * enabling it in any deployment. Requests are rate-limited out of respect for
 * Jade's servers.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const JADE_BASE = "https://jade.io";
const JADE_TIMEOUT_MS = 12_000;
const JADE_MAX_RESULTS = 20;
const JADE_USER_AGENT =
  "Mike-Legal-Assistant/1.0 (research and educational use; contact: " +
  (process.env.ADMIN_EMAIL ?? "admin@example.com") +
  "; respectful-bot; https://mikeoss.com)";

/** Neutral citation pattern — e.g. [2024] HCA 26 */
const NEUTRAL_CITATION_RE = /\[(\d{4})\]\s*([A-Za-z0-9]+)\s*(\d+)/;

/** Court codes recognised for neutral-citation validation. */
export const SUPPORTED_COURTS = new Set<string>([
  "HCA", "FCAFC", "FCA", "FedCFamC1F", "FedCFamC2F",
  "NSWSC", "NSWCA", "NSWCCA", "NSWDC",
  "VSC", "VSCA", "VCC",
  "QSC", "QCA", "QDC",
  "SASC", "SASCFC", "WASC", "WASCA",
  "TASSC", "TASFC", "NTSC", "ACTSC",
  "NZHC", "NZCA", "NZSC",
]);

// ── Rate limiter ───────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
let rateTokens = RATE_LIMIT_MAX;
let rateWindowStart = Date.now();

async function throttle(): Promise<void> {
  const now = Date.now();
  if (now - rateWindowStart >= RATE_LIMIT_WINDOW_MS) {
    rateTokens = RATE_LIMIT_MAX;
    rateWindowStart = now;
  }
  if (rateTokens <= 0) {
    const waitMs = RATE_LIMIT_WINDOW_MS - (Date.now() - rateWindowStart) + 100;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    rateTokens = RATE_LIMIT_MAX;
    rateWindowStart = Date.now();
  }
  rateTokens--;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Jurisdiction =
  | "cth"
  | "vic"
  | "nsw"
  | "qld"
  | "sa"
  | "wa"
  | "tas"
  | "nt"
  | "act"
  | "federal"
  | "nz"
  | "other";

export interface JadeSearchResult {
  title: string;
  url: string;
  jadeUrl?: string;
  neutralCitation?: string;
  reportedCitation?: string;
  jurisdiction?: string;
  year?: string;
  court?: string;
  type: "case" | "legislation";
}

export interface CitationValidationResult {
  valid: boolean;
  neutralCitation?: string;
  jadeUrl?: string;
  jadeVerified?: boolean;
  message: string;
  source?: "jade";
}

export interface JadeDocumentResult {
  text: string;
  url: string;
  paragraphs: Array<{ number: number; text: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

function extractReportedCitation(text: string): string | undefined {
  const patterns = [
    /\(\d{4}\)\s+\d+\s+[A-Za-z]{2,8}\s+\d+/,
    /\[\d{4}\]\s+\d+\s+[A-Za-z]{2,8}\s+\d+/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return undefined;
}

/**
 * Convert a parsed neutral citation to a Jade.io MNC URL.
 * [2024] HCA 5 → https://jade.io/mnc/2024/hca/5
 */
function buildJadeUrl(year: string, court: string, num: string): string {
  return `${JADE_BASE}/mnc/${year}/${court.toLowerCase()}/${num}`;
}

/** Build a Jade.io URL from a neutral citation string, if parseable. */
function jadeUrlFromCitation(citation: string): string | undefined {
  const m = citation.match(NEUTRAL_CITATION_RE);
  if (!m) return undefined;
  return buildJadeUrl(m[1]!, m[2]!, m[3]!);
}

/** Extract MNC components (year, court, num) from a jade.io URL, if present. */
function mncFromJadeUrl(url: string): { year: string; court: string; num: string } | null {
  const m = url.match(/\/(?:mnc|content\/ext\/mnc)\/(\d{4})\/([A-Za-z0-9]+)\/(\d+)/i);
  if (!m) return null;
  return { year: m[1]!, court: m[2]!, num: m[3]! };
}

/** Extract readable text and numbered paragraphs from a Jade HTML judgment. */
function parseDocumentHtml(html: string): {
  text: string;
  paragraphs: Array<{ number: number; text: string }>;
} {
  const cleaned = html
    .replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const text = decodeHtmlEntities(cleaned).trim().slice(0, 60_000);

  const paragraphs: Array<{ number: number; text: string }> = [];
  const paraRe = /\[(\d+)\]\s+([^\n]{10,500})/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(text)) !== null) {
    const n = parseInt(pm[1]!, 10);
    if (n > 0 && n < 10_000) {
      paragraphs.push({ number: n, text: pm[2]!.trim() });
    }
  }

  return { text, paragraphs };
}

/** Check whether Jade.io has a case at the given MNC URL (HEAD request). */
async function verifyJadeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": JADE_USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(JADE_TIMEOUT_MS),
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a judgment from Jade.io's server-rendered HTML endpoint.
 * Uses /content/ext/mnc/{year}/{court}/{num}.
 */
async function fetchJadeDocumentByMnc(
  year: string,
  court: string,
  num: string,
): Promise<JadeDocumentResult | null> {
  const htmlUrl = `${JADE_BASE}/content/ext/mnc/${year}/${court.toLowerCase()}/${num}`;
  const jadeUrl = buildJadeUrl(year, court, num);
  try {
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent": JADE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Referer: JADE_BASE,
      },
      signal: AbortSignal.timeout(JADE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // If the response looks like a SPA shell, bail out gracefully.
    if (html.length < 500 || /<div id="root"[^>]*>\s*<\/div>/.test(html)) {
      return null;
    }
    const { text, paragraphs } = parseDocumentHtml(html);
    return { text, url: jadeUrl, paragraphs };
  } catch {
    return null;
  }
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Search Jade.io for Australian case law.
 *
 * Jade.io does not expose a machine search interface that may be used without
 * BarNet's written permission, so this returns a Jade.io search link for the
 * user to open, plus a direct Jade MNC link when the query contains a neutral
 * citation. Once written permission is obtained, a parser for authorised
 * search results can be added here.
 */
export async function searchJadeCases(args: {
  query: string;
  jurisdiction?: Jurisdiction;
  limit?: number;
  sortBy?: "relevance" | "date" | "auto";
}): Promise<JadeSearchResult[]> {
  const query = args.query.trim();
  const jadeSearchUrl = `${JADE_BASE}/search?query=${encodeURIComponent(query)}&type=cases`;
  const citationMatch = query.match(NEUTRAL_CITATION_RE);
  const jadeUrl = citationMatch ? jadeUrlFromCitation(citationMatch[0]) : undefined;

  return [
    {
      title: citationMatch
        ? `Open ${citationMatch[0]} on Jade.io`
        : `Search “${query}” on Jade.io`,
      url: jadeUrl ?? jadeSearchUrl,
      jadeUrl: jadeUrl ?? jadeSearchUrl,
      neutralCitation: citationMatch ? citationMatch[0] : undefined,
      year: citationMatch ? citationMatch[1] : undefined,
      type: "case",
    },
  ];
}

/**
 * Search Jade.io for Australian legislation.
 * Returns a Jade.io search link (see searchJadeCases for the rationale).
 */
export async function searchJadeLegislation(args: {
  query: string;
  jurisdiction?: Jurisdiction;
  limit?: number;
}): Promise<JadeSearchResult[]> {
  const query = args.query.trim();
  const jadeSearchUrl = `${JADE_BASE}/search?query=${encodeURIComponent(query)}&type=legislation`;
  return [
    {
      title: `Search “${query}” on Jade.io`,
      url: jadeSearchUrl,
      jadeUrl: jadeSearchUrl,
      type: "legislation",
    },
  ];
}

/**
 * Validate an Australian neutral citation against Jade.io.
 *
 * Jade.io reliably returns HTTP 200 for valid MNC URLs, so it is used as the
 * verification source. The canonical Jade.io URL is always included for
 * human-readable linking. Example: "[2024] HCA 5".
 */
export async function validateJadeCitation(
  citation: string,
): Promise<CitationValidationResult> {
  const normalised = citation.replace(/\s+/g, " ").trim();
  const match = normalised.match(NEUTRAL_CITATION_RE);
  if (!match) {
    return {
      valid: false,
      message:
        "Not a recognised neutral citation format. Expected format: [YYYY] COURT N (e.g. [2024] HCA 5)",
    };
  }

  const [, year, court, num] = match;
  if (!SUPPORTED_COURTS.has(court!)) {
    return {
      valid: false,
      message: `Unknown court code: ${court}. Supported codes: ${[...SUPPORTED_COURTS].join(", ")}`,
    };
  }

  const jadeUrl = buildJadeUrl(year!, court!, num!);

  await throttle();
  const jadeVerified = await verifyJadeUrl(jadeUrl);

  if (jadeVerified) {
    return {
      valid: true,
      neutralCitation: normalised,
      jadeUrl,
      jadeVerified: true,
      message: "Citation verified on Jade.io",
      source: "jade",
    };
  }

  return {
    valid: false,
    neutralCitation: normalised,
    jadeUrl,
    jadeVerified: false,
    message: "Citation could not be verified on Jade.io",
  };
}

/**
 * Fetch the text of a judgment from Jade.io.
 * Only jade.io URLs are permitted (an MNC link such as
 * https://jade.io/mnc/2024/hca/5, or a /content/ext/mnc/... link).
 */
export async function fetchJadeDocument(url: string): Promise<JadeDocumentResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!parsed.hostname.endsWith("jade.io")) {
    throw new Error("Only jade.io URLs are permitted for document fetch");
  }

  const mnc = mncFromJadeUrl(url);
  if (!mnc) {
    throw new Error(
      "Could not parse a neutral citation from the Jade.io URL. " +
        "Expected a link like https://jade.io/mnc/2024/hca/5",
    );
  }

  await throttle();
  const doc = await fetchJadeDocumentByMnc(mnc.year, mnc.court, mnc.num);
  if (doc) return doc;

  throw new Error(
    `Failed to fetch judgment from Jade.io. Open it directly: ${buildJadeUrl(mnc.year, mnc.court, mnc.num)}`,
  );
}

/**
 * Format a citation per AGLC4 (Australian Guide to Legal Citation, 4th ed).
 *
 * Examples:
 *   Mabo v Queensland (No 2) [1992] HCA 23, (1992) 175 CLR 1 at [64]
 *   Donoghue v Stevenson [1932] AC 562 at 580
 */
export function formatAGLC4Citation(args: {
  caseName: string;
  neutralCitation?: string;
  reportedCitation?: string;
  pinpoint?: string;
}): string {
  let result = args.caseName.trim();

  if (args.neutralCitation) {
    const nc = args.neutralCitation.replace(/\s+/g, " ").trim();
    if (!result.includes(nc)) result += ` ${nc}`;
  }

  if (args.reportedCitation) {
    const rc = args.reportedCitation.replace(/\s+/g, " ").trim();
    if (!result.includes(rc)) {
      result += args.neutralCitation ? `, ${rc}` : ` ${rc}`;
    }
  }

  if (args.pinpoint) {
    result += ` at ${args.pinpoint.trim()}`;
  }

  return result;
}
