/**
 * Per-query cost calculation.
 * Prices are in USD per 1 million tokens (as published by each provider).
 * AUD conversion uses a daily-cached live rate from open.er-api.com.
 */

// ---------------------------------------------------------------------------
// Model pricing table (USD per 1M tokens)
// ---------------------------------------------------------------------------
// Claude prices: https://www.anthropic.com/pricing
// Gemini prices: https://ai.google.dev/gemini-api/docs/pricing (Standard tier)
// ---------------------------------------------------------------------------

type ModelPrice = {
    inputPerMToken: number;
    outputPerMToken: number;
};

const MODEL_PRICES: Record<string, ModelPrice> = {
    // Claude
    "claude-fable-5":    { inputPerMToken: 10.00, outputPerMToken: 50.00 },
    "claude-opus-4-8":   { inputPerMToken:  5.00, outputPerMToken: 25.00 },
    "claude-opus-4-7":   { inputPerMToken:  5.00, outputPerMToken: 25.00 },
    "claude-sonnet-4-6": { inputPerMToken:  3.00, outputPerMToken: 15.00 },
    "claude-haiku-4-5":  { inputPerMToken:  1.00, outputPerMToken:  5.00 },

    // Gemini embeddings (knowledge base; input-only, tokens estimated)
    "gemini-embedding-001":          { inputPerMToken:  0.15, outputPerMToken:  0.00 },

    // Gemini (Standard paid tier)
    "gemini-3.5-flash":              { inputPerMToken:  1.50, outputPerMToken:  9.00 },
    "gemini-3.1-pro-preview":        { inputPerMToken:  2.00, outputPerMToken: 12.00 },
    "gemini-3-flash-preview":        { inputPerMToken:  0.50, outputPerMToken:  3.00 },
    "gemini-3.1-flash-lite-preview": { inputPerMToken:  0.25, outputPerMToken:  1.50 },
    "gemini-3.1-flash-lite":         { inputPerMToken:  0.25, outputPerMToken:  1.50 },
};

// ---------------------------------------------------------------------------
// AUD exchange rate (cached daily)
// ---------------------------------------------------------------------------

let audRateCache: { rate: number; fetchedAt: number } | null = null;
const AUD_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function fetchAudRate(): Promise<number> {
    try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { rates?: Record<string, number> };
        const rate = data.rates?.AUD;
        if (!rate || typeof rate !== "number") throw new Error("AUD rate missing");
        return rate;
    } catch {
        // Fallback to a reasonable approximate if the API fails.
        return 1.55;
    }
}

export async function getAudRate(): Promise<number> {
    const now = Date.now();
    if (audRateCache && now - audRateCache.fetchedAt < AUD_CACHE_TTL_MS) {
        return audRateCache.rate;
    }
    const rate = await fetchAudRate();
    audRateCache = { rate, fetchedAt: now };
    return rate;
}

// ---------------------------------------------------------------------------
// Cost calculation
// ---------------------------------------------------------------------------

export type CostResult = {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    costAud: number;
    audRate: number;
};

export async function calculateCostAud(
    model: string,
    inputTokens: number,
    outputTokens: number,
): Promise<CostResult> {
    const prices = MODEL_PRICES[model];
    let costUsd = 0;
    if (prices) {
        costUsd =
            (inputTokens / 1_000_000) * prices.inputPerMToken +
            (outputTokens / 1_000_000) * prices.outputPerMToken;
    }
    const audRate = await getAudRate();
    const costAud = costUsd * audRate;
    return { model, inputTokens, outputTokens, costUsd, costAud, audRate };
}
