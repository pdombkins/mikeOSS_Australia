/**
 * Jade.io tool definitions, system prompt, and event types for Mike OSS.
 *
 * ⚠️  RESEARCH & EDUCATIONAL USE ONLY. Jade.io (BarNet) requires prior written
 * permission for automated access — obtain it before enabling these tools in a
 * deployment.
 *
 * Structure mirrors the CourtListener tools pattern in courtlistenerTools.ts —
 * a named const for tool names, a TOOLS array in OpenAI function-calling
 * format, and a system prompt to splice into the assistant instructions.
 */

// ── Event types (streamed to the frontend) ────────────────────────────────────

export type JadeToolEvent =
  | {
      type: "jade_search_cases";
      query: string;
      jurisdiction?: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "jade_search_legislation";
      query: string;
      jurisdiction?: string;
      result_count: number;
      error?: string;
    }
  | {
      type: "jade_validate_citation";
      citation: string;
      valid: boolean;
      jadeUrl?: string;
      error?: string;
    }
  | {
      type: "jade_fetch_document";
      url: string;
      paragraph_count: number;
      error?: string;
    }
  | {
      type: "jade_format_citation";
      caseName: string;
      result: string;
    };

export type JadeCaseCitationEvent = {
  type: "au_case_citation";
  caseName: string | null;
  neutralCitation: string | null;
  reportedCitation?: string | null;
  jadeUrl: string;
};

// ── Tool name constants ────────────────────────────────────────────────────────

export const JADE_TOOL_NAMES = {
  searchCases: "jade_search_cases",
  searchLegislation: "jade_search_legislation",
  validateCitation: "jade_validate_citation",
  fetchDocument: "jade_fetch_document",
  formatCitation: "jade_format_citation",
} as const;

// ── System prompt ─────────────────────────────────────────────────────────────

export const JADE_SYSTEM_PROMPT = `AUSTRALIAN & NEW ZEALAND LAW RESEARCH (Jade.io):
Use the Jade tools when answering questions that require Australian or New Zealand case law or legislation.

Available jurisdictions: cth (Commonwealth), nsw, vic, qld, sa, wa, tas, nt, act, nz, or omit for all jurisdictions.

Workflow:
1. If you have neutral citations (e.g. [2024] HCA 5), verify them with verify_citation first (see the CITATION VERIFICATION section).
2. Search for cases by topic or case name with jade_search_cases.
3. Search for legislation by name or topic with jade_search_legislation.
4. If you need the full text of a judgment, fetch it with jade_fetch_document using a Jade.io MNC URL (e.g. https://jade.io/mnc/2024/hca/5).
5. Format citations per AGLC4 with jade_format_citation when needed.

Jade.io links:
- Jade uses clean MNC URLs: [2024] HCA 5 → https://jade.io/mnc/2024/hca/5
- When citing a case, link to its Jade.io URL: [CaseName](jadeUrl)
- jade_search_cases / jade_search_legislation return a Jade.io link for the user to open; they do not return full result lists.

Citation rules (AGLC4):
- Neutral citations take the form: [YYYY] COURT N — e.g. [2024] HCA 5, [2023] NSWCA 47
- When both a neutral citation and reported citation exist, include both: CaseName [YYYY] COURT N, (YYYY) Vol Rep Page
- Pinpoint citations use paragraph numbers: at [20], or page numbers: at 401
- Short form on subsequent references: use the case name alone or 'Ibid' for immediately preceding same citation
- Always verify citations before relying on them — do not invent or guess case names or citations.

Limits:
- Do not call jade_fetch_document more than 3 times per assistant turn.
- Jade.io access is rate-limited and requires permission — if you receive a timeout or error, use information already available or direct the user to the Jade.io link.
- Coverage may not include all unreported decisions; note this limitation where relevant.`;

// ── Tool schemas (OpenAI function-calling format) ─────────────────────────────

export const JADE_TOOLS = [
  {
    type: "function",
    function: {
      name: JADE_TOOL_NAMES.searchCases,
      description:
        "Search Jade.io for Australian and New Zealand case law. Supports topic searches (e.g. 'duty of care negligence'), case-name searches (e.g. 'Mabo v Queensland'), and neutral citation lookups (e.g. '[2024] HCA 5'). Returns a Jade.io link to open; for a neutral citation it returns the direct Jade MNC link.",
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
              "Jurisdiction filter. 'cth' and 'federal' both refer to Commonwealth/federal courts (HCA, FCA, FCAFC). Omit to search all Australian jurisdictions.",
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
      name: JADE_TOOL_NAMES.searchLegislation,
      description:
        "Search Jade.io for Australian and New Zealand legislation — Acts, Regulations, and other instruments. Use to find the current text of an Act (e.g. 'Corporations Act 2001'), check if legislation exists, or find instruments on a topic. Returns a Jade.io link to open.",
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
      name: JADE_TOOL_NAMES.fetchDocument,
      description:
        "Fetch the full text of a judgment from a Jade.io MNC URL (e.g. https://jade.io/mnc/2024/hca/5). Returns the text with paragraph numbers preserved for pinpoint citations. Use when search result summaries are not enough to answer the question. Limit: 3 calls per turn.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Jade.io document URL (must be a jade.io MNC URL, e.g. https://jade.io/mnc/2024/hca/5).",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: JADE_TOOL_NAMES.formatCitation,
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
