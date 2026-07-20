/**
 * C024 — Assertion-level citation verification ("Deep-verify").
 *
 * Pipeline per text:
 *   1. Low-tier LLM extracts {assertion, citation} pairs (MNCs).
 *   2. Each MNC → existing Jade existence validation.
 *   3. If the admin Jade-access toggle is ON: fetch the judgment and have a
 *      main-tier LLM judge supported / partially_supported / not_supported /
 *      misattributed, quoting the supporting passage.
 *   4. If OFF (default): verdict left for HUMAN self-validation. Each
 *      assertion carries outbound Jade + AustLII *search links* that the
 *      user opens in their own browser — Mike never fetches AustLII.
 */

import { createServerSupabase } from "../supabase";
import { completeText, type UserApiKeys } from "../llm";
import { getUserModelSettings } from "../userSettings";
import { getJadeAccessApproved } from "../appSettings";
import { validateJadeCitation, fetchJadeDocument } from "../jade";
import { recordAudit } from "../audit";

type Db = ReturnType<typeof createServerSupabase>;

export type AssertionRow = {
  id: string;
  position: number;
  assertion: string;
  citation: string;
  citation_valid: boolean | null;
  verdict: string | null;
  verifier: "ai" | "human" | "none";
  supporting_passage: string | null;
  note: string | null;
  jade_url: string | null;
  austlii_url: string | null;
};

const MNC_RE = /\[(\d{4})\]\s+([A-Za-z]+)\s+(\d+)/;

function jadeSearchUrl(citation: string): string {
  return `https://jade.io/search/${encodeURIComponent(citation)}`;
}

/** Outbound AustLII SEARCH link for the human to click — never fetched by Mike. */
function austliiSearchUrl(citation: string): string {
  return `https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?method=boolean&query=${encodeURIComponent(citation)}`;
}

async function extractAssertions(
  text: string,
  titleModel: string,
  apiKeys?: UserApiKeys,
): Promise<{ assertion: string; citation: string }[]> {
  const raw = await completeText({
    model: titleModel,
    systemPrompt: `Extract every legal assertion paired with a case or legislation citation from the text. A citation is typically a Medium Neutral Citation like [2024] HCA 5, or an Act reference. Respond with ONLY a JSON array (no fences):
[{"assertion": "<the specific factual/legal claim the citation is offered to support>", "citation": "<the citation exactly as written>"}]
Return [] if there are none. Max 25 pairs.`,
    user: text.slice(0, 60_000),
    maxTokens: 4000,
    apiKeys,
  });
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is { assertion: string; citation: string } =>
          !!p &&
          typeof (p as Record<string, unknown>).assertion === "string" &&
          typeof (p as Record<string, unknown>).citation === "string",
      )
      .slice(0, 25);
  } catch {
    return [];
  }
}

async function judgeAssertion(
  assertion: string,
  citation: string,
  judgmentText: string,
  model: string,
  apiKeys?: UserApiKeys,
): Promise<{ verdict: string; passage: string | null }> {
  const raw = await completeText({
    model,
    systemPrompt: `You check whether a cited authority supports an assertion. Respond with ONLY a JSON object (no fences):
{"verdict": "supported" | "partially_supported" | "not_supported" | "misattributed", "passage": "<verbatim passage from the judgment that supports or contradicts, ≤60 words, or null>"}
- supported: the judgment clearly supports the assertion
- partially_supported: supports part of it, or with qualifications
- not_supported: judgment does not address it
- misattributed: judgment says something materially different`,
    user: `ASSERTION: ${assertion}\nCITATION: ${citation}\n\nJUDGMENT TEXT:\n${judgmentText.slice(0, 80_000)}`,
    maxTokens: 600,
    apiKeys,
  });
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      verdict?: string;
      passage?: string | null;
    };
    const verdict = [
      "supported",
      "partially_supported",
      "not_supported",
      "misattributed",
    ].includes(parsed.verdict ?? "")
      ? (parsed.verdict as string)
      : "not_content_verified";
    return {
      verdict,
      passage: typeof parsed.passage === "string" ? parsed.passage : null,
    };
  } catch {
    return { verdict: "not_content_verified", passage: null };
  }
}

export async function runAssertionVerification(args: {
  db: Db;
  userId: string;
  text: string;
  sourceKind?: "text" | "chat_message" | "agent_run";
  sourceRef?: string | null;
  projectId?: string | null;
  apiKeys?: UserApiKeys;
}): Promise<{ report_id: string; assertions: AssertionRow[]; jade_content_checking: boolean }> {
  const { db, userId } = args;
  const { title_model, tabular_model, api_keys } = await getUserModelSettings(
    userId,
    db,
  );
  const apiKeys = args.apiKeys ?? api_keys;
  const jadeApproved = await getJadeAccessApproved(db);

  const pairs = await extractAssertions(args.text, title_model, apiKeys);

  const { data: report } = await db
    .from("verification_reports")
    .insert({
      owner_id: userId,
      project_id: args.projectId ?? null,
      source_kind: args.sourceKind ?? "text",
      source_ref: args.sourceRef ?? null,
      source_excerpt: args.text.slice(0, 2000),
      status: "in_progress",
    })
    .select("id")
    .single();
  const reportId = (report as { id: string }).id;

  const rows: AssertionRow[] = [];
  for (const [i, pair] of pairs.entries()) {
    let citationValid: boolean | null = null;
    let verdict: string | null = null;
    let verifier: "ai" | "human" | "none" = "none";
    let passage: string | null = null;
    let jadeUrl: string | null = jadeSearchUrl(pair.citation);

    const mnc = pair.citation.match(MNC_RE);
    if (mnc) {
      try {
        const validation = await validateJadeCitation(pair.citation);
        citationValid = validation.valid;
        if (validation.jadeUrl) jadeUrl = validation.jadeUrl;
        if (citationValid && jadeApproved && validation.jadeUrl) {
          // AI content-checking path (Jade access approved by the operator).
          const doc = await fetchJadeDocument(validation.jadeUrl);
          if (doc.text && doc.text.length > 500) {
            const judged = await judgeAssertion(
              pair.assertion,
              pair.citation,
              doc.text,
              tabular_model,
              apiKeys,
            );
            verdict = judged.verdict;
            passage = judged.passage;
            verifier = judged.verdict === "not_content_verified" ? "none" : "ai";
          }
        }
      } catch {
        citationValid = null; // validation unavailable — leave for the human
      }
    }
    if (!verdict) {
      // Human self-validation path: verdict pending, links provided.
      verdict = null;
      verifier = "none";
    }

    const { data: inserted } = await db
      .from("verification_assertions")
      .insert({
        report_id: reportId,
        position: i + 1,
        assertion: pair.assertion.slice(0, 2000),
        citation: pair.citation.slice(0, 300),
        citation_valid: citationValid,
        verdict,
        verifier,
        supporting_passage: passage,
        jade_url: jadeUrl,
        austlii_url: austliiSearchUrl(pair.citation),
      })
      .select("id")
      .single();
    rows.push({
      id: (inserted as { id: string }).id,
      position: i + 1,
      assertion: pair.assertion,
      citation: pair.citation,
      citation_valid: citationValid,
      verdict,
      verifier,
      supporting_passage: passage,
      note: null,
      jade_url: jadeUrl,
      austlii_url: austliiSearchUrl(pair.citation),
    });
  }

  // Complete immediately only if every assertion got an AI verdict.
  const complete =
    rows.length > 0 && rows.every((r) => r.verdict && r.verifier === "ai");
  if (complete || rows.length === 0) {
    await db
      .from("verification_reports")
      .update({ status: "complete" })
      .eq("id", reportId);
  }
  recordAudit({
    actorId: userId,
    eventType: "tool_call",
    projectId: args.projectId ?? null,
    resourceType: "chat",
    resourceId: reportId,
    toolName: "verify_assertions",
    detail: { assertions: rows.length, jadeContentChecking: jadeApproved },
  });
  return {
    report_id: reportId,
    assertions: rows,
    jade_content_checking: jadeApproved,
  };
}
