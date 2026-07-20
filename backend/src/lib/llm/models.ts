import type { Provider } from "./types";

// ---------------------------------------------------------------------------
// Data-driven model registry (C011 + Kimi K3)
// ---------------------------------------------------------------------------
// Single source of truth for model IDs, providers, tiers, labels and pricing.
// pricing.ts and the /user/models endpoint both read from this registry.
// ---------------------------------------------------------------------------

export type ModelTier = "main" | "mid" | "low";

export type ModelDef = {
    id: string;
    provider: Provider;
    tier: ModelTier;
    label: string;
    /** USD per 1M tokens (retail). Ignored for self-hosted endpoints. */
    inputPerM: number;
    outputPerM: number;
    contextK?: number;
    notes?: string;
};

/** Is Kimi K3 served from a self-hosted OpenAI-compatible endpoint? */
export function kimiSelfHosted(): boolean {
    return !!process.env.KIMI_BASE_URL?.trim();
}

/** Base URL for the Moonshot/Kimi provider (self-host preferred, per design). */
export function kimiBaseUrl(): string {
    return (
        process.env.KIMI_BASE_URL?.trim() || "https://api.moonshot.ai/v1"
    );
}

export const MODEL_REGISTRY: ModelDef[] = [
    // Claude
    { id: "claude-fable-5",    provider: "claude", tier: "main", label: "Claude Fable 5",   inputPerM: 10.0, outputPerM: 50.0 },
    { id: "claude-opus-4-8",   provider: "claude", tier: "main", label: "Claude Opus 4.8",  inputPerM: 5.0,  outputPerM: 25.0 },
    { id: "claude-opus-4-7",   provider: "claude", tier: "main", label: "Claude Opus 4.7",  inputPerM: 5.0,  outputPerM: 25.0 },
    { id: "claude-sonnet-4-6", provider: "claude", tier: "main", label: "Claude Sonnet 4.6", inputPerM: 3.0, outputPerM: 15.0 },
    { id: "claude-haiku-4-5",  provider: "claude", tier: "low",  label: "Claude Haiku 4.5", inputPerM: 1.0,  outputPerM: 5.0 },

    // Gemini (Standard paid tier)
    { id: "gemini-3.5-flash",              provider: "gemini", tier: "main", label: "Gemini 3.5 Flash",      inputPerM: 1.5,  outputPerM: 9.0 },
    { id: "gemini-3.1-pro-preview",        provider: "gemini", tier: "main", label: "Gemini 3.1 Pro",        inputPerM: 2.0,  outputPerM: 12.0 },
    { id: "gemini-3-flash-preview",        provider: "gemini", tier: "main", label: "Gemini 3 Flash",        inputPerM: 0.5,  outputPerM: 3.0 },
    { id: "gemini-3.1-flash-lite-preview", provider: "gemini", tier: "low",  label: "Gemini 3.1 Flash Lite", inputPerM: 0.25, outputPerM: 1.5 },

    // OpenAI
    { id: "gpt-5.5",      provider: "openai", tier: "main", label: "GPT-5.5",      inputPerM: 5.0, outputPerM: 25.0 },
    { id: "gpt-5.4",      provider: "openai", tier: "main", label: "GPT-5.4",      inputPerM: 3.0, outputPerM: 15.0 },
    { id: "gpt-5.4-lite", provider: "openai", tier: "low",  label: "GPT-5.4 Lite", inputPerM: 0.5, outputPerM: 2.5 },

    // Moonshot AI — Kimi K3 (open-weight; self-host preferred via KIMI_BASE_URL,
    // hosted API fallback https://api.moonshot.ai/v1 at US$3/$15 per M).
    {
        id: "kimi-k3",
        provider: "moonshot",
        tier: "main",
        label: "Kimi K3",
        inputPerM: 3.0,
        outputPerM: 15.0,
        contextK: 1024,
        notes: "Open-weight 2.8T MoE. Priced at $0 when served from a self-hosted endpoint (KIMI_BASE_URL).",
    },
];

const byId = new Map(MODEL_REGISTRY.map((m) => [m.id, m]));

export function getModelDef(id: string): ModelDef | undefined {
    return byId.get(id);
}

function idsFor(provider: Provider, tier: ModelTier): string[] {
    return MODEL_REGISTRY.filter(
        (m) => m.provider === provider && m.tier === tier,
    ).map((m) => m.id);
}

// ---------------------------------------------------------------------------
// Tier views (kept for existing callers; derived from the registry)
// ---------------------------------------------------------------------------
export const CLAUDE_MAIN_MODELS = idsFor("claude", "main");
export const GEMINI_MAIN_MODELS = idsFor("gemini", "main");
export const OPENAI_MAIN_MODELS = idsFor("openai", "main");
export const MOONSHOT_MAIN_MODELS = idsFor("moonshot", "main");

// Mid-tier (used for tabular review) — main/low models double as mid options.
export const CLAUDE_MID_MODELS = ["claude-sonnet-4-6"];
export const GEMINI_MID_MODELS = ["gemini-3.5-flash", "gemini-3-flash-preview"];
export const OPENAI_MID_MODELS = ["gpt-5.4"];

export const CLAUDE_LOW_MODELS = idsFor("claude", "low");
export const GEMINI_LOW_MODELS = idsFor("gemini", "low");
export const OPENAI_LOW_MODELS = idsFor("openai", "low");

export const DEFAULT_MAIN_MODEL = "gemini-3-flash-preview";
export const DEFAULT_TITLE_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_TABULAR_MODEL = "gemini-3-flash-preview";

const ALL_MODELS = new Set<string>(MODEL_REGISTRY.map((m) => m.id));

// ---------------------------------------------------------------------------
// Provider inference
// ---------------------------------------------------------------------------

export function providerForModel(model: string): Provider {
    const def = byId.get(model);
    if (def) return def.provider;
    // Fallback prefix-sniffing for unregistered/legacy ids.
    if (model.startsWith("claude")) return "claude";
    if (model.startsWith("gemini")) return "gemini";
    if (model.startsWith("gpt-")) return "openai";
    if (model.startsWith("kimi")) return "moonshot";
    throw new Error(`Unknown model id: ${model}`);
}

export function resolveModel(id: string | null | undefined, fallback: string): string {
    if (id && ALL_MODELS.has(id)) return id;
    return fallback;
}
