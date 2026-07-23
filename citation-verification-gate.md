# Citation Verification Gate — Design Sketch

**Status:** design only (not built). A compliant, human-in-the-loop pattern for verifying Australian citations against AustLII without automated access or page framing.

**Core principle:** Mike never touches AustLII. When a citation needs checking, the **user's own browser** opens AustLII in a **separate tab** (ordinary end-use, permitted under AustLII Usage Policy cl 2(a)). The user reads the result and records only a **verified / not-verified** outcome in Mike. The AI receives that boolean — never AustLII content — and only then finalises its advice.

---

## 1. Why this shape (compliance guardrails)

These constraints are the whole point — the design is built around them:

- **No programmatic access by Mike.** Mike constructs a search *link*; the user's browser makes the request. Mike never fetches, scrapes, caches, or renders AustLII. (Avoids AUP automated-access + robots restrictions.)
- **No framing/embedding.** AustLII opens in a real new tab/window (`target="_blank" rel="noopener"`), never in an iframe or in-app panel. (Avoids AUP cl 4(a)(ii) "page framing".)
- **Boolean only — no content ingestion.** The only thing that flows back to the AI is `verified | not_verified` plus the citation string the AI already had. No judgment text, headnotes, summaries, or copied AustLII material enters Mike's store or the AI's context. (Avoids AUP s 5(b) "incorporating AustLII materials … into AI outputs".)
- **Neutral citations are facts.** An MNC such as `[2024] HCA 5` is a court-assigned identifier, not AustLII property, so it can be displayed and stored freely.
- **Source-agnostic.** AustLII is offered as the default verification target, but the same gate works if the user prefers another source — nothing in the design depends on AustLII content reaching the AI.

---

## 2. States

### Per-citation status
```
pending ──(user opens AustLII & reviews)──▶ in_review ──▶ verified
                                                       └─▶ not_verified
```
- `pending` — AI has proposed the citation; not yet reviewed.
- `in_review` — user has opened the AustLII search (optional/transient; useful for the "opened but not yet answered" UI state).
- `verified` — user confirmed the citation is real/correct.
- `not_verified` — user could not confirm it (wrong, not found, or superseded).

### Turn-level gate
```
DRAFTING ──▶ AWAITING_VERIFICATION ──(all citations resolved)──▶ FINALISING ──▶ DONE
```
The assistant produces a **draft** with citations, then **pauses** at `AWAITING_VERIFICATION`. It does not present final advice until every citation is `verified` or `not_verified`.

---

## 3. Data recorded (per citation)

Content-free by design:

| Field | Example | Notes |
|---|---|---|
| `citationId` | `c_01H…` | internal id |
| `caseName` | `Mabo v Queensland (No 2)` | from the AI draft |
| `neutralCitation` | `[1992] HCA 23` | MNC (a fact) |
| `searchUrl` | `https://www.austlii.edu.au/…?query=…` | deep link the user opens |
| `status` | `verified` | `pending`/`in_review`/`verified`/`not_verified` |
| `verifiedBy` | `user_…` | who recorded it |
| `verifiedAt` | ISO 8601 | when |
| `userNote` *(optional)* | `"correct"` | short free text **only**; UI must discourage pasting AustLII text |

**Never stored:** AustLII page HTML, judgment text, headnotes, catchwords, summaries, or any value-added AustLII content.

---

## 4. UX flow

1. AI drafts advice that relies on one or more Australian authorities.
2. Instead of presenting the draft as final, Mike shows a **Verification panel** in the chat:
   - one card per citation: case name · MNC · **"Search on AustLII ↗"** (opens new tab) · **[Verified] [Not verified]** · optional short note;
   - a progress line: *"1 of 3 verified"*.
3. User clicks **Search on AustLII ↗** → their browser opens AustLII in a new tab with the case name / MNC pre-entered as the search. User reads it themselves.
4. User clicks **Verified** or **Not verified** on the card.
5. When all cards are resolved, a **"Finalise advice"** button enables.
6. User clicks Finalise → the AI resumes and produces final advice.

---

## 5. Where the AI pauses and resumes (mechanics, described not built)

**Pause.** Replace the current server-side "validate citation" tool with a client-gated `request_citation_verification` tool. Instead of calling AustLII/Jade, it:
- emits the citation list to the UI (a `verification_required` event);
- ends the assistant message with the Verification panel and no final advice.

**Resume.** When the user finalises, the UI sends a follow-up tool result / message carrying **only** the outcomes, e.g.:
```json
{ "verifications": [
  { "neutralCitation": "[1992] HCA 23", "status": "verified" },
  { "neutralCitation": "[2024] XYZ 9",  "status": "not_verified" }
] }
```
The assistant continues the same thread and applies rules:
- **verified** → keep the citation; link to it (AustLII or Jade URL).
- **not_verified** → do **not** rely on it: remove it, soften/withdraw the dependent claim, and flag it to the user.
- then produce final advice.

The gate is enforced by the tool/flow, not by prompting alone: the model cannot emit "final advice" until verification outcomes have been returned.

---

## 6. Edge cases

- **No MNC available** → build the AustLII search from the case name instead.
- **User marks not_verified** → the AI must not present that authority as established; it should say so.
- **User abandons the panel** → advice stays a draft (gated); nothing is finalised.
- **Many citations** → all must be resolved; partial verification keeps the gate closed.
- **Duplicate citations** → de-duplicate to one card.

---

## 7. Open item to confirm with AustLII

This design is intended to sit within end-use (cl 2(a)) and avoid automated access, framing (cl 4(a)(ii)) and AI-materials incorporation (s 5). Because s 5 is drafted broadly, the safe course is to have AustLII confirm the pattern in writing before relying on it — see `austlii-permission-request.docx`, which describes exactly this workflow.
