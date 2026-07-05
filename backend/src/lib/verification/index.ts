/**
 * Citation verification — pluggable source chains.
 *
 * Selection logic (driven by the admin "Jade.io approved?" toggle):
 *   - approved   → ["jade", "austlii"]  Jade automated first; AustLII human
 *                                        verification only if Jade fails.
 *   - not approved (default) → ["austlii"]  AustLII human verification only,
 *                                        with no Jade fallback.
 *
 * To add another source (e.g. a future "other" provider): implement a
 * VerificationSource, register it below, and add its id to the relevant chain.
 * Nothing else needs to change.
 */

import { registerVerificationSource, getVerificationSource } from "./registry";
import { jadeSource } from "./sources/jadeSource";
import { austliiSource } from "./sources/austliiSource";
import type { VerificationRequest, VerificationResult } from "./types";

// ── Register available sources ────────────────────────────────────────────────
registerVerificationSource(jadeSource);
registerVerificationSource(austliiSource);

// ── Ordered chains ────────────────────────────────────────────────────────────
const CHAINS: Record<"jadeApproved" | "default", string[]> = {
  jadeApproved: ["jade", "austlii"],
  default: ["austlii"],
};

export function resolveVerificationChain(jadeApproved: boolean): string[] {
  return jadeApproved ? CHAINS.jadeApproved : CHAINS.default;
}

/**
 * Run a citation through the resolved chain. Automated sources are tried in
 * order (a thrown error falls through to the next); a human source ends the
 * chain by returning a "needs_human" hand-off.
 */
export async function verifyCitation(
  req: VerificationRequest,
  opts: { jadeApproved: boolean },
): Promise<VerificationResult> {
  const chain = resolveVerificationChain(opts.jadeApproved);
  let lastError: string | undefined;

  for (const id of chain) {
    const source = getVerificationSource(id);
    if (!source) continue;

    if (source.mode === "human") {
      // A human step ends the chain — there is nothing to "fall through" past.
      return source.verify(req);
    }

    try {
      return await source.verify(req);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // fall through to the next source
    }
  }

  return {
    status: "error",
    sourceId: chain[chain.length - 1] ?? "unknown",
    sourceLabel: "verification",
    mode: "automated",
    citation: req.citation,
    message:
      lastError ?? "No verification source was able to process this citation.",
  };
}

export {
  registerVerificationSource,
  getVerificationSource,
  listVerificationSources,
} from "./registry";
export * from "./types";
