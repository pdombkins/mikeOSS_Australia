/**
 * Knowledge-base + playbook tool schemas (adopted from jmclark-lab/mike F211,
 * harmonised for Mike (Australia): descriptions genericised, embeddings via
 * Gemini, documents ingested from the Library).
 */

export const KNOWLEDGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Search the user's private knowledge base (their own Library documents: contracts, templates, and reference material) for passages relevant to a question, and ground the answer in them. Use this before answering questions about their standard terms, past agreements, templates, or how a clause has been handled before. Returns cited passages ([KB1], [KB2], \u2026) \u2014 cite them in your answer and don't invent content that isn't returned.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What to look for (a question or topic, e.g. 'our standard indemnification cap in MSAs').",
          },
          doc_type: {
            type: "string",
            description: "Optional filter: contract | template | regulatory | other.",
          },
          k: {
            type: "integer",
            description: "Number of passages to retrieve (default 6).",
          },
        },
        required: ["query"],
      },
    },
  },
];

export const PLAYBOOK_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_playbooks",
      description:
        "List the user's available negotiation playbooks (standard positions per agreement type). Call this to discover which playbooks exist before reviewing a document against one.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "review_against_playbook",
      description:
        "Fetch a named playbook's standard positions so you can review a contract against them clause-by-clause and flag deviations with severity. Use when the user asks to review/redline a document against their standard positions. Optionally pass a doc_id to pull an attached document's text; otherwise compare against the document already in the conversation.",
      parameters: {
        type: "object",
        properties: {
          playbook_name: {
            type: "string",
            description:
              "The playbook to use (e.g. 'Standard NDA', 'Consultancy Agreement'). Use list_playbooks if unsure.",
          },
          doc_id: {
            type: "string",
            description:
              "Optional document ID (e.g. 'doc-0') to review; if omitted, review the document in the conversation.",
          },
        },
        required: ["playbook_name"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// C026 — My Clauses tools.
// ---------------------------------------------------------------------------
export const CLAUSE_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_clauses",
      description:
        "Search the user's personal library of preferred contract provisions ('My Clauses') for provisions matching a topic or agreement type. Use during drafting or review to reuse the user's preferred language instead of inventing new wording. Returns the clause text plus usage guidance.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Topic or provision to look for (e.g. 'limitation of liability cap').",
          },
          agreement_type: {
            type: "string",
            description:
              "Optional filter: NDA | MSA | CRO | work_order | distribution | other.",
          },
          k: { type: "integer", description: "Results to return (default 6)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_clause",
      description:
        "Save a contract provision to the user's personal 'My Clauses' library as preferred language for future drafting. Use when the user asks to save/keep/remember a clause. Provide the verbatim clause text and a short descriptive title.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short descriptive name." },
          body: { type: "string", description: "The verbatim clause text." },
          agreement_type: {
            type: "string",
            description:
              "Optional: NDA | MSA | CRO | work_order | distribution | other.",
          },
          guidance: {
            type: "string",
            description: "Optional: when/how to use this clause.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional topic tags.",
          },
        },
        required: ["title", "body"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// C002 — Conversational playbook-builder tools (write ops, audit-logged).
// ---------------------------------------------------------------------------
export const PLAYBOOK_BUILDER_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_playbook",
      description:
        "Create a new negotiation playbook for the user. Use when the user asks to build/start a playbook conversationally. Confirm the name and agreement type with the user before creating.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Playbook name (unique)." },
          agreement_type: {
            type: "string",
            description:
              "Optional: NDA | MSA | CRO | work_order | distribution | other.",
          },
          description: { type: "string", description: "Optional description." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_playbook_rule",
      description:
        "Add or update a rule (topic position) in an existing playbook: the preferred position, acceptable fallback, dealbreaker, and severity. Use while conversationally building or refining a playbook, including when deriving rules from an uploaded precedent.",
      parameters: {
        type: "object",
        properties: {
          playbook_name: { type: "string", description: "Target playbook." },
          topic: {
            type: "string",
            description: "Rule topic, e.g. 'Indemnification', 'Governing law'.",
          },
          preferred: { type: "string", description: "Preferred position/language." },
          acceptable_fallback: {
            type: "string",
            description: "What the user can live with.",
          },
          dealbreaker: { type: "string", description: "What must be rejected." },
          severity: {
            type: "string",
            description: "low | medium | high (default medium).",
          },
          notes: { type: "string", description: "Optional notes." },
        },
        required: ["playbook_name", "topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_playbook_rule",
      description:
        "Delete a rule from a playbook by topic. Confirm with the user before deleting.",
      parameters: {
        type: "object",
        properties: {
          playbook_name: { type: "string", description: "Target playbook." },
          topic: { type: "string", description: "Topic of the rule to delete." },
        },
        required: ["playbook_name", "topic"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// C025 — Tabular Analysis agent tool.
// ---------------------------------------------------------------------------
export const TABULAR_ASK_TOOLS = [
  {
    type: "function",
    function: {
      name: "tabular_ask",
      description:
        "Run one question across many documents as a tabular analysis grid (one row per document). Use for diligence-style questions over a document set (e.g. 'What is the termination notice period in each contract?'). Creates a Tabular Review the user can open; returns the per-document answers.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask of every document." },
          document_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Document UUIDs to analyse (use list_documents to find them). Max 20.",
          },
          title: { type: "string", description: "Optional grid title." },
        },
        required: ["question", "document_ids"],
      },
    },
  },
];
