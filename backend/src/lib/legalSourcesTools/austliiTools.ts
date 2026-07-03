/**
 * AustLII tool definitions, system prompt, and event types for Mike OSS.
 *
 * These mirror the CourtListener tools pattern in courtlistenerTools.ts —
 * a named const for tool names, a TOOLS array in OpenAI function-calling
 * format, and a system prompt to splice into the assistant instructions.
 */

// ── Event types (streamed to the frontend) ────────────────────────────────────

export type AustliiToolEvent =
  | {
      type: "austlii_search_cases";
      query: string;
      jurisdiction?: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "austlii_search_legislation";
      query: string;
      jurisdiction?: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "austlii_validate_citation";
      citation: string;
      valid: boolean;
      austliiUrl?: string;
      error?: string;
    }
  | {
      type: "austlii_fetch_document";
      url: string;
      paragraph_count: number;
      error?: string;
    }
  | {
      type: "austlii_format_citation";
      caseName: string;
      result: string;
    };

export type AustliiCaseCitationEvent = {
  type: "au_case_citation";
  caseName: string | null;
  neutralCitation: string | null;
  reportedCitation?: string | null;
  austliiUrl: string;
};

// ── Tool name constants ────────────────────────────────────────────────────────

export const AUSTLII_TOOL_NAMES = {
  searchCases: "austlii_search_cases",
  searchLegislation: "austlii_search_legislation",
  validateCitation: "austlii_validate_citation",
  fetchDocument: "austlii_fetch_document",
  formatCitation: "austlii_format_citation",
} as const;

// ── System prompt ─────────────────────────────────────────────────────────────

export const AUSTLII_SYSTEM_PROMPT = `AUSTRALIAN & NEW ZEALAND LAW RESEARCH (AustLII + Jade.io fallback):
Use AustLII tools when answering questions that require Australian or New Zealand case law or legislation.

Available jurisdictions: cth (Commonwealth), nsw, vic, qld, sa, wa, tas, nt, act, nz, or omit for all jurisdictions.

Workflow:
1. If you have neutral citations (e.g. [2024] HCA 5), verify them with austlii_validate_citation first.
2. Search for cases by topic or case name with austlii_search_cases.
3. Search for legislation by name or topic with austlii_search_legislation.
4. If you need the full text of a judgment or legislation, fetch it with austlii_fetch_document using the AustLII URL.
5. Format citations per AGLC4 with austlii_format_citation when needed.

Jade.io fallback:
- Search results include a jadeUrl field alongside the AustLII URL. If AustLII is unavailable, use the jadeUrl.
- Citation validation results include jadeUrl and jadeVerified fields. If source is "jade", the citation was verified on Jade.io.
- Jade.io uses clean MNC URLs: [2024] HCA 5 → https://jade.io/mnc/2024/hca/5
- When citing a case, prefer linking to AustLII but fall back to Jade.io if the austliiUrl is unavailable:
  [CaseName](austliiUrl) or [CaseName](jadeUrl)
- If austlii_fetch_document fails and returns a Jade.io URL in the error message, direct the user to that URL.

Citation rules (AGLC4):
- Neutral citations take the form: [YYYY] COURT N — e.g. [2024] HCA 5, [2023] NSWCA 47
- When both a neutral citation and reported citation exist, include both: CaseName [YYYY] COURT N, (YYYY) Vol Rep Page
- Pinpoint citations use paragraph numbers: at [20], or page numbers: at 401
- Short form on subsequent references: use the case name alone or 'Ibid' for immediately preceding same citation
- Always verify citations before relying on them — do not invent or guess case names or citations.

Limits:
- Do not call austlii_fetch_document more than 3 times per assistant turn.
- AustLII is rate-limited — if you receive a timeout or error, use information already available or direct the user to Jade.io.
- AustLII does not include all unreported decisions; for comprehensive coverage of a matter, note this limitation.`;

// ── Tool schemas (OpenAI function-calling format) ─────────────────────────────

export const AUSTLII_TOOLS = [
  {
    type: "function",
    function: {
      name: AUSTLII_TOOL_NAMES.searchCases,
      description:
        "Search AustLII for Australian and New Zealand case law. Supports topic searches (e.g. 'duty of care negligence'), case-name searches (e.g. 'Mabo v Queensland'), and neutral citation lookups (e.g. '[2024] HCA 5'). Results are ranked by court hierarchy (HCA > FCAFC > FCA > state courts) for case-name queries, and by date for topic queries.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query. Can be a case name ('Donoghue v Stevenson'), a topic ('misleading and deceptive conduct ACL'), or a neutral citation ('[2024] HCA 5').",
          },
          jurisdiction: {
            type: "string",
            enum: [
              "cth",
              "federal",
              "nsw",
              "vic",
              "qld",
              "sa",
              "wa",
              "tas",
              "nt",
              "act",
              "nz",
              "other",
            ],
            description:
              "Jurisdiction filter. 'cth' and 'federal' both return Commonwealth/federal court decisions (HCA, FCA, FCAFC). Omit to search all Australian jurisdictions.",
          },
          limit: {
            type: "integer",
            description: "Maximum results to return. Default 10, max 20.",
          },
          sortBy: {
            type: "string",
            enum: ["auto", "relevance", "date"],
            description:
              "Sort order. 'auto' detects case-name queries and sorts by relevance, or by date for topic searches. Default: auto.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AUSTLII_TOOL_NAMES.searchLegislation,
      description:
        "Search AustLII for Australian and New Zealand legislation — Acts, Regulations, and other instruments. Use to find the current text of an Act (e.g. 'Corporations Act 2001'), check if legislation exists, or find instruments on a topic.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query, e.g. 'Privacy Act', 'workplace health and safety', 'Competition and Consumer Act 2010 s 18'.",
          },
          jurisdiction: {
            type: "string",
            enum: ["cth", "nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act", "nz", "other"],
            description: "Jurisdiction filter. Omit to search all Australian jurisdictions.",
          },
          limit: {
            type: "integer",
            description: "Maximum results to return. Default 10, max 20.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AUSTLII_TOOL_NAMES.validateCitation,
      description:
        "Verify that an Australian neutral citation exists on AustLII. Pass a neutral citation in the format [YYYY] COURT N (e.g. '[2024] HCA 5', '[2023] NSWCA 47'). Returns whether the citation is valid and the canonical AustLII URL. Use before citing any case to confirm it exists.",
      parameters: {
        type: "object",
        properties: {
          citation: {
            type: "string",
            description:
              "Neutral citation to validate. Format: [YYYY] COURT N — e.g. '[2024] HCA 5' or '[2023] NSWCA 47'. Do not pass case names or reported citations to this tool.",
          },
        },
        required: ["citation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AUSTLII_TOOL_NAMES.fetchDocument,
      description:
        "Fetch the full text of an AustLII judgment or legislation document from a URL returned by austlii_search_cases or austlii_search_legislation. Returns the text with paragraph numbers preserved for pinpoint citations. Use when search result summaries are not enough to answer the question. Limit: 3 calls per turn.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "AustLII document URL (must be a www.austlii.edu.au URL from a prior search result).",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: AUSTLII_TOOL_NAMES.formatCitation,
      description:
        "Format an Australian case citation per AGLC4 (Australian Guide to Legal Citation, 4th edition). Combines case name, neutral citation, reported citation, and pinpoint reference into the correct format.",
      parameters: {
        type: "object",
        properties: {
          caseName: {
            type: "string",
            description: "Full case name, e.g. 'Mabo v Queensland (No 2)'.",
          },
          neutralCitation: {
            type: "string",
            description: "Neutral citation, e.g. '[1992] HCA 23'.",
          },
          reportedCitation: {
            type: "string",
            description: "Reported citation, e.g. '(1992) 175 CLR 1'.",
          },
          pinpoint: {
            type: "string",
            description:
              "Pinpoint reference — paragraph number '[64]', page number '401', or legislative ref 's 5(2)(a)'. Do not include 'at' — it will be added automatically.",
          },
        },
        required: ["caseName"],
      },
    },
  },
];
