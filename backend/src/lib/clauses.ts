/**
 * C026 — My Clauses: personal preferred-provision library.
 * Same embedding path as the knowledge base (Gemini 1536-dim); spend is
 * recorded in query_costs (source 'kb_embedding').
 */

import { createServerSupabase } from "./supabase";
import {
  embedText,
  estimateEmbeddingTokens,
  EMBED_MODEL,
  isEmbeddingConfigured,
} from "./llm/embeddings";
import { calculateCostAud } from "./pricing";

type Db = ReturnType<typeof createServerSupabase>;

export interface Clause {
  id: string;
  title: string;
  agreement_type: string | null;
  body: string;
  guidance: string | null;
  tags: string[];
  source_document_id: string | null;
  project_id: string | null;
  created_at: string;
}

export interface ClauseInput {
  title: string;
  body: string;
  agreement_type?: string | null;
  guidance?: string | null;
  tags?: string[];
  source_document_id?: string | null;
  project_id?: string | null;
}

function recordEmbeddingCost(db: Db, ownerId: string, texts: string[]) {
  void (async () => {
    try {
      const tokens = estimateEmbeddingTokens(texts);
      if (!tokens) return;
      const cost = await calculateCostAud(EMBED_MODEL, tokens, 0);
      await db.from("query_costs").insert({
        user_id: ownerId,
        chat_id: null,
        model: cost.model,
        input_tokens: cost.inputTokens,
        output_tokens: 0,
        cost_usd: cost.costUsd,
        cost_aud: cost.costAud,
        aud_rate: cost.audRate,
        source: "kb_embedding",
      });
    } catch (err) {
      console.error("[clauses] failed to record embedding cost:", err);
    }
  })();
}

export async function saveClause(
  db: Db,
  ownerId: string,
  input: ClauseInput,
  apiKeys?: { gemini?: string | null },
): Promise<Clause> {
  let embedding: number[] | null = null;
  if (isEmbeddingConfigured(apiKeys?.gemini)) {
    try {
      const embedInput = `${input.title}\n${input.body}`;
      embedding = await embedText(embedInput, apiKeys?.gemini);
      recordEmbeddingCost(db, ownerId, [embedInput]);
    } catch (err) {
      console.error("[clauses] embedding failed (saved without):", err);
    }
  }
  const { data, error } = await db
    .from("clauses")
    .insert({
      owner_id: ownerId,
      title: input.title.slice(0, 300),
      body: input.body,
      agreement_type: input.agreement_type ?? null,
      guidance: input.guidance ?? null,
      tags: input.tags ?? [],
      source_document_id: input.source_document_id ?? null,
      project_id: input.project_id ?? null,
      embedding: embedding as unknown as number[] | null,
    })
    .select(
      "id, title, agreement_type, body, guidance, tags, source_document_id, project_id, created_at",
    )
    .single();
  if (error || !data) {
    throw new Error(`clauses insert failed: ${error?.message}`);
  }
  return data as Clause;
}

export async function searchClauses(
  db: Db,
  ownerId: string,
  query: string,
  opts: {
    k?: number;
    agreementType?: string | null;
    accessibleProjects?: string[] | null;
    apiKeys?: { gemini?: string | null };
  } = {},
): Promise<(Clause & { similarity?: number })[]> {
  // Semantic search when embeddings are configured; ilike fallback otherwise.
  if (isEmbeddingConfigured(opts.apiKeys?.gemini)) {
    try {
      const vector = await embedText(query, opts.apiKeys?.gemini);
      recordEmbeddingCost(db, ownerId, [query]);
      const { data, error } = await db.rpc("match_clauses", {
        query_embedding: vector as unknown as number[],
        match_owner: ownerId,
        match_count: opts.k ?? 6,
        filter_agreement_type: opts.agreementType ?? null,
        accessible_projects: opts.accessibleProjects ?? null,
      });
      if (!error && data) return data as (Clause & { similarity: number })[];
    } catch (err) {
      console.error("[clauses] semantic search failed, falling back:", err);
    }
  }
  const { data } = await db
    .from("clauses")
    .select(
      "id, title, agreement_type, body, guidance, tags, source_document_id, project_id, created_at",
    )
    .eq("owner_id", ownerId)
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .limit(opts.k ?? 6);
  return (data ?? []) as Clause[];
}

export function formatClausesForModel(
  query: string,
  clauses: (Clause & { similarity?: number })[],
): string {
  if (clauses.length === 0) {
    return `No preferred clauses found for "${query}".`;
  }
  return [
    `Preferred clauses matching "${query}":`,
    ...clauses.map(
      (c, i) =>
        `${i + 1}. ${c.title}${c.agreement_type ? ` [${c.agreement_type}]` : ""}\n${c.body}${c.guidance ? `\nGuidance: ${c.guidance}` : ""}`,
    ),
  ].join("\n\n");
}
