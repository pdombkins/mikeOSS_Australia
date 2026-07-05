/**
 * Pluggable citation-verification sources.
 *
 * A "source" verifies an Australian/NZ neutral citation. Sources come in two
 * modes:
 *   - "automated": the server can confirm the citation itself (e.g. Jade.io).
 *   - "human":     the server cannot/should not fetch the source, so it hands a
 *                  search link back to the user, who verifies it themselves and
 *                  records the outcome (e.g. AustLII, per its Usage Policy).
 *
 * To add a new source, implement VerificationSource and register it — see
 * registry.ts / index.ts. No other code needs to change.
 */

export type VerificationMode = "automated" | "human";

export type VerificationStatus =
  | "verified"
  | "not_verified"
  | "needs_human"
  | "error";

export interface VerificationRequest {
  citation: string;
  caseName?: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  sourceId: string;
  sourceLabel: string;
  mode: VerificationMode;
  citation: string;
  /** Canonical link to the authority, when known. */
  url?: string;
  /** Where a human should search to verify (human mode). */
  searchUrl?: string;
  message: string;
}

export interface VerificationSource {
  id: string;
  label: string;
  mode: VerificationMode;
  /**
   * Automated sources: resolve "verified" / "not_verified", or THROW on a
   * transport failure so the resolver can fall through to the next source.
   * Human sources: resolve "needs_human" with a searchUrl (no network call).
   */
  verify(req: VerificationRequest): Promise<VerificationResult>;
}
