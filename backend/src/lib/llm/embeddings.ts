/**
 * Text embeddings for the private knowledge base.
 *
 * Mike (Australia): uses Google Gemini `gemini-embedding-001` at 1536
 * dimensions (matches the vector(1536) columns + HNSW index in the
 * knowledge-base migration). Reuses the existing GEMINI_API_KEY — no extra
 * provider is required.
 */

const GEMINI_EMBED_MODEL = "gemini-embedding-001";
const GEMINI_EMBED_DIM = 1536;
const GEMINI_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents`;

export const EMBED_MODEL = GEMINI_EMBED_MODEL;

function embedKey(override?: string | null): string {
  return override?.trim() || process.env.GEMINI_API_KEY?.trim() || "";
}

export function isEmbeddingConfigured(override?: string | null): boolean {
  return Boolean(embedKey(override));
}

/** Rough token estimate for cost tracking (Gemini does not return usage for embeddings). */
export function estimateEmbeddingTokens(texts: string[]): number {
  return Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4);
}

export async function embedTexts(
  texts: string[],
  apiKey?: string | null,
): Promise<number[][]> {
  const key = embedKey(apiKey);
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured for embeddings");
  }
  if (texts.length === 0) return [];
  const res = await fetch(`${GEMINI_EMBED_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${GEMINI_EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: GEMINI_EMBED_DIM,
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini embeddings failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    embeddings?: { values?: number[] }[];
  };
  const out = (json.embeddings ?? []).map((e) => e.values ?? []);
  if (out.length !== texts.length || out.some((v) => v.length !== GEMINI_EMBED_DIM)) {
    throw new Error("Gemini embeddings returned an unexpected shape");
  }
  return out;
}

export async function embedText(
  text: string,
  apiKey?: string | null,
): Promise<number[]> {
  const [v] = await embedTexts([text], apiKey);
  return v;
}
