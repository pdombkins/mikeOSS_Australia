/**
 * Jade.io verification source (automated).
 *
 * ⚠️ Only used when an admin has recorded Jade.io approval. Automated Jade.io
 * access requires BarNet's prior written permission (research/education gating).
 */

import { validateJadeCitation } from "../../jade";
import type {
  VerificationRequest,
  VerificationResult,
  VerificationSource,
} from "../types";

const ID = "jade";
const LABEL = "Jade.io";

export const jadeSource: VerificationSource = {
  id: ID,
  label: LABEL,
  mode: "automated",
  async verify(req: VerificationRequest): Promise<VerificationResult> {
    const r = await validateJadeCitation(req.citation);

    if (r.valid) {
      return {
        status: "verified",
        sourceId: ID,
        sourceLabel: LABEL,
        mode: "automated",
        citation: req.citation,
        url: r.jadeUrl,
        message: r.message,
      };
    }

    // Definitive rejections (bad format / unknown court code) carry no jadeUrl —
    // treat as a firm "not verified", not a source failure.
    if (!r.jadeUrl) {
      return {
        status: "not_verified",
        sourceId: ID,
        sourceLabel: LABEL,
        mode: "automated",
        citation: req.citation,
        message: r.message,
      };
    }

    // Well-formed citation that Jade could not confirm (a miss or a transport
    // failure). Throw so the resolver falls through to the next source
    // (e.g. AustLII human verification).
    throw new Error(r.message || "Jade.io could not confirm the citation");
  },
};
