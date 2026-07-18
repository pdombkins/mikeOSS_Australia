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
