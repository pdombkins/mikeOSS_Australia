/**
 * Verification-source registry. Register sources here (or from index.ts) and
 * reference them by id in a chain. Adding/removing a source is a one-line
 * change plus a chain edit — no dispatch rewiring.
 */

import type { VerificationSource } from "./types";

const sources = new Map<string, VerificationSource>();

export function registerVerificationSource(source: VerificationSource): void {
  sources.set(source.id, source);
}

export function getVerificationSource(id: string): VerificationSource | undefined {
  return sources.get(id);
}

export function listVerificationSources(): VerificationSource[] {
  return [...sources.values()];
}
