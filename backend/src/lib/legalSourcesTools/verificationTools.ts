/**
 * Source-agnostic citation-verification tool + system prompt.
 *
 * The tool calls the configured verification chain (see lib/verification). For
 * automated sources it returns a definitive result; for human sources it
 * returns "needs_human" and the UI shows a verification panel with a link the
 * user opens themselves.
 */

// ── Event streamed to the frontend when a human must verify ───────────────────

export type CitationVerificationEvent = {
  type: "citation_verification_required";
  citation: string;
  caseName: string | null;
  sourceLabel: string; // e.g. "AustLII"
  searchUrl: string;   // opened by the user's own browser in a new tab
};

// ── Tool name ─────────────────────────────────────────────────────────────────

export const VERIFICATION_TOOL_NAME = "verify_citation";

// ── System prompt ─────────────────────────────────────────────────────────────

export const VERIFICATION_SYSTEM_PROMPT = `CITATION VERIFICATION:
Before you rely on or present any Australian or New Zealand case citation in your advice, call verify_citation with the neutral citation (and the case name if you know it).

The result includes a "status":
- "verified" — confirmed automatically. You may cite it.
- "not_verified" — wrong or unconfirmable. Do NOT present it as authority; correct it or drop it and say so.
- "needs_human" — a human must check it. A verification panel has been shown to the user with a link to search the source (e.g. AustLII) themselves. DO NOT finalise your advice yet: present your draft, mark each affected citation as "pending your verification", and ask the user to use the panel (Verified / Not verified). When the user replies with the outcomes, apply them — keep verified citations, drop or correct not-verified ones — then finalise.
- "error" — verification was unavailable; tell the user the citation is unverified and proceed with caution.

Never invent a citation or assert one as confirmed without a "verified" result or the user's explicit verification. When several citations need checking, call verify_citation for each.`;

// ── Tool schema (OpenAI function-calling format) ──────────────────────────────

export const VERIFICATION_TOOLS = [
  {
    type: "function",
    function: {
      name: VERIFICATION_TOOL_NAME,
      description:
        "Verify an Australian/NZ neutral citation using the configured verification source. Depending on instance configuration this either confirms the citation automatically (Jade.io, if approved) or hands the user a link to verify it themselves (AustLII). Returns status: verified, not_verified, needs_human, or error. Call before citing any authority.",
      parameters: {
        type: "object",
        properties: {
          citation: {
            type: "string",
            description: "Neutral citation, e.g. '[2024] HCA 5' or '[2023] NSWCA 47'.",
          },
          caseName: {
            type: "string",
            description:
              "Case name if known, e.g. 'Mabo v Queensland (No 2)'. Used to build a better search for human verification.",
          },
        },
        required: ["citation"],
      },
    },
  },
];
