/**
 * AustLII integration for Mike OSS
 *
 * Searches the Australasian Legal Information Institute (AustLII) for
 * Australian and New Zealand case law and legislation via the SINO CGI
 * search engine. No API key required — AustLII is freely accessible.
 *
 * Respects AustLII's servers with a 10 req/min rate limit.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const AUSTLII_SEARCH_BASE = "https://www.austlii.edu.au/cgi-bin/sinosrch.cgi";
const AUSTLII_DOC_BASE = "https://www.austlii.edu.au";
const AUSTLII_USER_AGENT =
  "Mike-Legal-Assistant/1.0 (Australian law firm; contact: " +
  (process.env.ADMIN_EMAIL ?? "admin@example.com") +
  "; respectful-bot; https://mikeoss.com)";
const AUSTLII_TIMEOUT_MS = 15_000;
const AUSTLII_MAX_RESULTS = 20;

/** Jade.io base URL — used as fallback when AustLII blocks or times out */
const JADE_BASE = "https://jade.io";
const JADE_TIMEOUT_MS = 12_000;

/** Neutral citation pattern — e.g. [2024] HCA 26 */
const NEUTRAL_CITATION_RE = /\[(\d{4})\]\s*([A-Za-z0-9]+)\s*(\d+)/;

/** Maps neutral citation court codes to AustLII document URL paths */
export const COURT_TO_AUSTLII_PATH: Record<string, string> = {
  HCA: "au/cases/cth/HCA",
  FCAFC: "au/cases/cth/FCAFC",
  FCA: "au/cases/cth/FCA",
  FedCFamC1F: "au/cases/cth/FedCFamC1F",
  FedCFamC2F: "au/cases/cth/FedCFamC2F",
  NSWSC: "au/cases/nsw/NSWSC",
  NSWCA: "au/cases/nsw/NSWCA",
  NSWCCA: "au/cases/nsw/NSWCCA",
  NSWDC: "au/cases/nsw/NSWDC",
  VSC: "au/cases/vic/VSC",
  VSCA: "au/cases/vic/VSCA",
  VCC: "au/cases/vic/VCC",
  QSC: "au/cases/qld/QSC",
  QCA: "au/cases/qld/QCA",
  QDC: "au/cases/qld/QDC",
  SASC: "au/cases/sa/SASC",
  SASCFC: "au/cases/sa/SASCFC",
  WASC: "au/cases/wa/WASC",
  WASCA: "au/cases/wa/WASCA",
  TASSC: "au/cases/tas/TASSC",
  TASFC: "au/cases/tas/TASFC",
  NTSC: "au/cases/nt/NTSC",
  ACTSC: "au/cases/act/ACTSC",
  NZHC: "nz/cases/NZHC",
  NZCA: "nz/cases/NZCA",
  NZSC: "nz/cases/NZSC",
};

/** Court authority scores for ranking search results */
const AUTHORITY_SCORES: Array<[RegExp, number]> = [
  [/\/HCA\//, 100],
  [/\/NZSC\//, 75],
  [/\/FCAFC\//, 70],
  [/\/NZCA\//, 65],
  [/\/FCA\//, 60],
  [/\/FedCFamC1F\//, 55],
  [/\/NSWCA\/|\/VSCA\/|\/QCA\/|\/SASCFC\/|\/WASCA\/|\/TASFC\//, 50],
  [/\/NZHC\//, 45],
  [/\/NSWSC\/|\/VSC\/|\/QSC\/|\/SASC\/|\/WASC\/|\/TASSC\/|\/NTSC\/|\/ACTSC\//, 30],
  [/\/FedCFamC2F\//, 25],
  [/\/NSWDC\/|\/VCC\/|\/QDC\/|\/SADC\/|\/WADC\//, 15],
];

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

export interface AustliiSearchResult {
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
  austliiUrl?: string;
  jadeUrl?: string;
  jadeVerified?: boolean;
  message: string;
  source?: "austlii" | "jade";
}

export interface AustliiDocumentResult {
  text: string;
  url: string;
  paragraphs: Array<{ number: number; text: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCaseNameQuery(query: string): boolean {
  if (/\b\w+\s+v\.?\s+\w+/i.test(query)) return true;
  if (/\b(re|in\s+re)\s+\w+/i.test(query)) return true;
  if (/\[\d{4}\]\s*[A-Z]+\s*\d+/.test(query)) return true;
  return false;
}

function normaliseAustliiUrl(raw: string): string | null {
  try {
    const u = new URL(raw, AUSTLII_DOC_BASE);
    if (!u.hostname.endsWith("austlii.edu.au")) return null;
    u.protocol = "https:";
    u.hostname = "www.austlii.edu.au";
    for (const p of ["stem", "synonyms", "num", "mask_path", "meta", "query", "method"]) {
      u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function authorityScore(url: string): number {
  for (const [re, score] of AUTHORITY_SCORES) {
    if (re.test(url)) return score;
  }
  return 0;
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

function jurisdictionFromUrl(url: string): string | undefined {
  const au = url.match(/\/au\/cases\/(cth|vic|nsw|qld|sa|wa|tas|nt|act)\//i);
  if (au?.[1]) return au[1].toLowerCase();
  if (/\/nz\/cases\//.test(url)) return "nz";
  return undefined;
}

function buildMaskPath(
  type: "case" | "legislation",
  jurisdiction?: Jurisdiction,
): string {
  const jurMap: Record<string, string> = {
    cth: "cth",
    federal: "cth",
    vic: "vic",
    nsw: "nsw",
    qld: "qld",
    sa: "sa",
    wa: "wa",
    tas: "tas",
    nt: "nt",
    act: "act",
  };
  const country =
    jurisdiction === "nz" ? "nz" : "au";
  const kind = type === "case" ? "cases" : "legis";
  const jur =
    jurisdiction &&
    jurisdiction !== "nz" &&
    jurisdiction !== "other" &&
    jurMap[jurisdiction]
      ? `/${jurMap[jurisdiction]}`
      : "";
  return `${country}/${kind}${jur}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) =>
      String.fromCharCode(parseInt(c, 16)),
    );
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim());
}

// ── HTML parsing ──────────────────────────────────────────────────────────────

/**
 * Parse AustLII SINO search results from raw HTML.
 * Results appear in <li data-count="N." class="multi"> elements.
 */
function parseSearchResultsHtml(
  html: string,
  type: "case" | "legislation",
): AustliiSearchResult[] {
  const results: AustliiSearchResult[] = [];

  // Match each result <li> item
  const liPattern =
    /<li[^>]+data-count="[^"]*"[^>]*class="[^"]*multi[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;

  while ((liMatch = liPattern.exec(html)) !== null) {
    const liHtml = liMatch[1] ?? "";

    // First <a> tag is the result link
    const aMatch = liHtml.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const rawHref = aMatch[1] ?? "";
    const rawTitle = stripTags(aMatch[2] ?? "");
    const url = normaliseAustliiUrl(rawHref);
    if (!url || !rawTitle) continue;

    // Filter by content type
    if (type === "case" && !url.includes("/cases/")) continue;
    if (type === "legislation" && !url.includes("/legis/")) continue;
    if (url.includes("/journals/")) continue;

    const neutralMatch = rawTitle.match(NEUTRAL_CITATION_RE);
    const neutralCitation = neutralMatch ? neutralMatch[0] : undefined;
    const year = neutralMatch ? neutralMatch[1] : undefined;

    // Court/source from <p class="meta">
    const metaMatch = liHtml.match(/<p[^>]+class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const metaText = metaMatch ? stripTags(metaMatch[1]) : "";
    const court = metaText.split(/[-|]/)[0]?.trim().slice(0, 80);

    results.push({
      title: rawTitle,
      url,
      jadeUrl: neutralCitation ? jadeUrlFromCitation(neutralCitation) : undefined,
      neutralCitation,
      reportedCitation: extractReportedCitation(rawTitle),
      jurisdiction: jurisdictionFromUrl(url),
      year,
      court: court || undefined,
      type,
    });
  }

  return results;
}

/**
 * Extract readable text and paragraph blocks from an AustLII HTML judgment.
 */
function parseDocumentHtml(html: string): {
  text: string;
  paragraphs: Array<{ number: number; text: string }>;
} {
  // Strip scripts, styles, navigation
  const cleaned = html
    .replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");

  const text = decodeHtmlEntities(cleaned).trim().slice(0, 60_000);

  // Extract numbered paragraphs — AustLII marks them as [N] at line start
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

// ── Jade.io helpers ───────────────────────────────────────────────────────────

/**
 * Convert a parsed neutral citation to a Jade.io MNC URL.
 * [2024] HCA 5 → https://jade.io/mnc/2024/hca/5
 */
function buildJadeUrl(year: string, court: string, num: string): string {
  return `${JADE_BASE}/mnc/${year}/${court.toLowerCase()}/${num}`;
}

/**
 * Build a Jade.io URL from a neutral citation string, if parseable.
 */
function jadeUrlFromCitation(citation: string): string | undefined {
  const m = citation.match(/\[(\d{4})\]\s*([A-Za-z0-9]+)\s*(\d+)/);
  if (!m) return undefined;
  return buildJadeUrl(m[1]!, m[2]!, m[3]!);
}

/**
 * Check whether Jade.io has a case at the given MNC URL.
 * Returns true if the response is 200 or a redirect.
 */
async function verifyJadeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": AUSTLII_USER_AGENT,
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(JADE_TIMEOUT_MS),
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch a judgment from Jade.io's HTML endpoint.
 * Uses /content/ext/mnc/{year}/{court}/{num} for a server-rendered version.
 */
async function fetchJadeDocument(
  year: string,
  court: string,
  num: string,
): Promise<AustliiDocumentResult | null> {
  const htmlUrl = `${JADE_BASE}/content/ext/mnc/${year}/${court.toLowerCase()}/${num}`;
  const jadeUrl = buildJadeUrl(year, court, num);
  try {
    const res = await fetch(htmlUrl, {
      headers: {
        "User-Agent": AUSTLII_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Referer: JADE_BASE,
      },
      signal: AbortSignal.timeout(JADE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const html = await res.text();
    // If the response looks like a SPA shell, bail out gracefully
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
 * Search AustLII for Australian or New Zealand case law.
 */
export async function searchAustliiCases(args: {
  query: string;
  jurisdiction?: Jurisdiction;
  limit?: number;
  sortBy?: "relevance" | "date" | "auto";
  method?: "auto" | "title" | "phrase" | "all" | "any" | "near" | "boolean";
}): Promise<AustliiSearchResult[]> {
  const limit = Math.min(args.limit ?? 10, AUSTLII_MAX_RESULTS);
  const isCaseName = isCaseNameQuery(args.query);
  const sortBy =
    !args.sortBy || args.sortBy === "auto"
      ? isCaseName
        ? "relevance"
        : "date"
      : args.sortBy;

  const maskPath = buildMaskPath("case", args.jurisdiction);
  const meta = args.jurisdiction === "nz" ? "/austlii" : "/au";

  const params = new URLSearchParams({
    method: args.method ?? "auto",
    query: args.query,
    meta,
    results: String(limit),
    mask_path: maskPath,
    view: sortBy === "relevance" ? "relevance" : "date-latest",
  });

  await throttle();

  const response = await fetch(`${AUSTLII_SEARCH_BASE}?${params}`, {
    headers: {
      "User-Agent": AUSTLII_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-AU,en;q=0.9",
      Referer: "https://www.austlii.edu.au/",
    },
    signal: AbortSignal.timeout(AUSTLII_TIMEOUT_MS),
  });

  if (!response.ok) {
    // AustLII blocked or unavailable — return a Jade.io search stub
    if (response.status === 403 || response.status === 429 || response.status === 503) {
      const jadeSearchUrl = `${JADE_BASE}/search?query=${encodeURIComponent(args.query)}&type=cases`;
      return [{
        title: `AustLII unavailable (HTTP ${response.status}) — search Jade.io instead`,
        url: jadeSearchUrl,
        jadeUrl: jadeSearchUrl,
        type: "case",
      }];
    }
    throw new Error(`AustLII search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  let results = parseSearchResultsHtml(html, "case");

  // Re-rank by authority score for case-name queries
  if (isCaseName) {
    results = results
      .map((r, i) => ({ r, i, score: authorityScore(r.url) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.r);
  }

  return results.slice(0, limit);
}

/**
 * Search AustLII for Australian or New Zealand legislation.
 */
export async function searchAustliiLegislation(args: {
  query: string;
  jurisdiction?: Jurisdiction;
  limit?: number;
}): Promise<AustliiSearchResult[]> {
  const limit = Math.min(args.limit ?? 10, AUSTLII_MAX_RESULTS);
  const maskPath = buildMaskPath("legislation", args.jurisdiction);
  const meta = args.jurisdiction === "nz" ? "/austlii" : "/au";

  const params = new URLSearchParams({
    method: "legis",
    query: args.query,
    meta,
    results: String(limit),
    mask_path: maskPath,
    view: "relevance",
  });

  await throttle();

  const response = await fetch(`${AUSTLII_SEARCH_BASE}?${params}`, {
    headers: {
      "User-Agent": AUSTLII_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-AU,en;q=0.9",
      Referer: "https://www.austlii.edu.au/",
    },
    signal: AbortSignal.timeout(AUSTLII_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`AustLII legislation search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  return parseSearchResultsHtml(html, "legislation").slice(0, limit);
}

/**
 * Validate an Australian neutral citation by checking it exists on AustLII.
 * Example: "[2024] HCA 5"
 */
export async function validateAustliiCitation(
  citation: string,
): Promise<CitationValidationResult> {
  const normalised = citation.replace(/\s+/g, " ").trim();
  const match = normalised.match(/\[(\d{4})\]\s*([A-Za-z0-9]+)\s*(\d+)/);
  if (!match) {
    return {
      valid: false,
      message:
        "Not a recognised neutral citation format. Expected format: [YYYY] COURT N (e.g. [2024] HCA 5)",
    };
  }

  const [, year, court, num] = match;
  const path = COURT_TO_AUSTLII_PATH[court!];
  if (!path) {
    return {
      valid: false,
      message: `Unknown court code: ${court}. Supported codes: ${Object.keys(COURT_TO_AUSTLII_PATH).join(", ")}`,
    };
  }

  const url = `${AUSTLII_DOC_BASE}/cgi-bin/viewdoc/${path}/${year}/${num}.html`;

  await throttle();

  const jadeUrl = buildJadeUrl(year!, court!, num!);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": AUSTLII_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok || response.status === 301 || response.status === 302) {
      return {
        valid: true,
        neutralCitation: normalised,
        austliiUrl: url,
        jadeUrl,
        message: "Citation verified — document exists on AustLII",
        source: "austlii",
      };
    }

    // AustLII returned an error — try Jade.io as fallback
    const jadeVerified = await verifyJadeUrl(jadeUrl);
    if (jadeVerified) {
      return {
        valid: true,
        neutralCitation: normalised,
        austliiUrl: url,
        jadeUrl,
        jadeVerified: true,
        message: `Citation not found on AustLII (HTTP ${response.status}) but verified on Jade.io`,
        source: "jade",
      };
    }

    return {
      valid: false,
      neutralCitation: normalised,
      austliiUrl: url,
      jadeUrl,
      jadeVerified: false,
      message: `Citation not found on AustLII (HTTP ${response.status}) or Jade.io`,
    };
  } catch {
    // AustLII unreachable — try Jade.io
    const jadeVerified = await verifyJadeUrl(jadeUrl);
    return {
      valid: jadeVerified,
      neutralCitation: normalised,
      austliiUrl: url,
      jadeUrl,
      jadeVerified,
      message: jadeVerified
        ? "AustLII unreachable — citation verified on Jade.io instead"
        : "Could not reach AustLII or Jade.io to verify citation",
      source: jadeVerified ? "jade" : undefined,
    };
  }
}

/**
 * Fetch the text of an AustLII document (judgment or legislation section).
 * Only AustLII URLs are permitted.
 */
export async function fetchAustliiDocument(
  url: string,
): Promise<AustliiDocumentResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!parsed.hostname.endsWith("austlii.edu.au")) {
    throw new Error("Only austlii.edu.au URLs are permitted for document fetch");
  }

  await throttle();

  const response = await fetch(url, {
    headers: {
      "User-Agent": AUSTLII_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: "https://www.austlii.edu.au/",
    },
    signal: AbortSignal.timeout(AUSTLII_TIMEOUT_MS),
  });

  if (!response.ok) {
    // AustLII blocked — try to derive a Jade.io MNC URL and fetch from there
    const mncMatch = url.match(/\/(\d{4})\/(\d+)\.html/) ??
      url.match(/viewdoc\/([a-z]+\/cases\/[a-z]+\/([A-Za-z]+))\/(\d{4})\/(\d+)/i);
    const courtFromPath = url.match(/\/cases\/(?:cth|nsw|vic|qld|sa|wa|tas|nt|act|nz)\/([A-Za-z0-9]+)\//i)?.[1];
    const yearFromPath = url.match(/\/(\d{4})\/\d+\.html/)?.[1];
    const numFromPath = url.match(/\/(\d+)\.html$/)?.[1];

    if (courtFromPath && yearFromPath && numFromPath) {
      const jadeDoc = await fetchJadeDocument(yearFromPath, courtFromPath, numFromPath);
      if (jadeDoc) return jadeDoc;
    }

    throw new Error(
      `Failed to fetch AustLII document (HTTP ${response.status}). ` +
      `Try Jade.io instead: ${JADE_BASE}/t/browse`,
    );
  }

  const html = await response.text();
  const { text, paragraphs } = parseDocumentHtml(html);
  return { text, url, paragraphs };
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
