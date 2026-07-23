# Week 8 — Seeded failures for *Service recovery response (W8)*

Six paste-ready failures for the Recovery (CX) step of the Week-8 flow. The workflow takes the failure as free text — students select the **NexaCare — Whitegum Acquisition** project (so org context, the CX/EX standards playbook and the *Service recovery note — structure* clause are in scope), open **Service recovery response (W8)**, and paste one scenario.

Ordered easy → hard. Each has a distinct trap; the recurring teaching point is where a **service apology becomes a legal admission** needing partner (and possibly PI insurer) sign-off — the review step should flag it, and the class should check whether it did.

---

## SF-1 · The unreturned calls (warm-up — pure communication failure)
**Paste:** *"Dr Keller's office has tried to reach the deal team for three days during the EHR crisis week for a status update. Nobody returned the calls — everyone was heads-down on the MediTrax response. Keller's EA has now emailed Priya Iyer saying the CEO 'has no idea whether her acquisition is on track'. Nothing has actually gone wrong on the matter. Draft the recovery response."*

**Trap / debrief:** none legal — that's the point. A CX failure with zero legal error. Contrast with SF-2: same client, very different sign-off needs. Discuss: why is this still the failure most likely to lose the client?

## SF-2 · Missed Parramatta lease-consent clock (the canonical one)
**Paste:** *"We diarised the landlord's 14-day consent clock under the Parramatta lease from the wrong start date. The response window has now expired and the landlord's agent is asserting deemed refusal. Dr Keller heard about it from the agent before she heard from us. Draft the recovery response to NexaCare."*

**Optional doc:** point students at `Lease_Extract_Parramatta_NSW.docx` (already in the Library) — the reasonableness standard and savings clause mean the legal position is recoverable, which sharpens the question of how much to concede in the apology.

**Trap / debrief:** firm's own error → apology-vs-admission live; PI notification and partner sign-off before anything is sent; client heard it from a third party (the compounding CX failure). Does the draft admit negligence, or apologise for the *experience* while the legal position is protected?

## SF-3 · Toowong fee surprise in the board pack
**Paste:** *"Keller's board pack went out without any mention that the Toowong landlord demands a $15,000 consent fee, a market rent review on consent, and director personal guarantees. The board discovered the fee mid-meeting and Keller was blindsided. Jonathan Wu has asked how a known dealbreaker wasn't surfaced. Draft the recovery response."*

**Trap / debrief:** expectation-management failure, not a missed deadline. Watch for drafts that promise to absorb the fee or "make it right" financially — a commercial commitment the team can't give without a partner. Also: the recovery note goes to *two* personas (Keller: outcome-first; Wu: no-surprises, risk-weighted) — should it be one note or two? Links back to *Stakeholder update — persona-tuned* (W?).

## SF-4 · Tracked changes left in the MediTrax response
**Paste:** *"The draft response to MediTrax's notice was sent to the vendor with tracked changes and internal comments still visible — including Lily's margin note on our fallback position and an estimate of what NexaCare would pay to settle. Wu has seen it and is furious. Draft the recovery response to NexaCare."*

**Trap / debrief:** confidentiality/privilege waiver questions sit *behind* the apology — the recovery note must not characterise the legal consequences of the disclosure before they're assessed. Negotiation position damaged; the honest version of "here's what we're doing about it" is harder to write than the apology.

## SF-5 · Patient data visible in the shared data room
**Paste:** *"Tom bulk-uploaded diligence files and an extract containing unmasked Whitegum patient names and appointment details was visible for roughly 36 hours in a workspace accessible to the seller's advisers. Access has been closed. Daniel Okoye ('zero data loss') is the client contact. Draft the recovery response."*

**Trap / debrief:** the recovery note must **not** pre-judge the privacy analysis — "no harm done" or "no breach occurred" is an assessment (APPs, notifiable-data-breach threshold) that hasn't happened yet. The right note pairs a genuine service apology with a stated *process* (containment, assessment underway, escalation to Priya). Hardest apology-vs-admission balance in the set.

## SF-6 · The AI citation that didn't verify (capstone — ties to Week 4)
**Paste:** *"A memo sent to Jonathan Wu cited a Federal Court authority that his team could not locate. It appears the citation came from an AI-assisted draft and was never human-verified. Wu is asking what else in our work product he can trust. Draft the recovery response."*

**Trap / debrief:** CX recovery meets GenAI governance — SC Gen 23 requires human verification of every citation, so the remediation section can point to a *real* control (the Verify page / human self-validation path) rather than a vague promise. Watch for drafts that overpromise ("this can never happen again"). Follow up by actually running **Verify citations** on a Mike output.

---

## Documents — what to upload

**Nothing is required.** The workflow runs on the pasted failure plus project context; all supporting documents (Parramatta and Toowong lease extracts, MediTrax MSA extract and notice letter, TSA schedule) are already in the Library and KB-indexed.

Optional, if you want richer runs:
- **SF-2 / SF-3:** tell students to name the lease extract in their request ("using the Parramatta lease extract in the Library…") so the research step pulls the actual clause positions.
- **A one-paragraph 'client complaint email' per scenario** (from Keller/Wu/Okoye, in persona) uploaded to the Library makes the exercise feel inbound rather than hypothetical — worth doing for SF-1 and SF-3 if you have time; skip otherwise.
- Do **not** seed anything containing real-looking patient data for SF-5 — the pasted description is deliberately sufficient.

## Additional prompts (after the run)

1. **Persona rewrite:** *"Rewrite the recovery note for Dr Keller (commercial, decisive, lead with the fix) and again for Jonathan Wu (risk-weighted, headings, no surprises)."* — same facts, different CX.
2. **Playbook check:** *"Review the recovery note against the Client & employee experience standards playbook and list any deviations."*
3. **The red line:** *"Identify every sentence in the recovery note that a PI insurer might read as an admission of liability, and propose a service-apology alternative for each."* — makes the review step's flag concrete.
4. **Clause retrieval:** *"Find our service recovery note template in the clause library and restructure the response to match it."* (exercises `search_clauses`.)
5. **EX bridge (into step 4 of the Week-8 flow):** *"Whose mistake was this, and what does a just-culture response to that team member look like alongside the client apology?"* — connects Recovery (CX) to the psychological-safety pulse, and to the facilitation prompt about the audit log protecting the junior who flagged the risk.

**Timing note:** the live calendar has crisis Monday = 20 Jul 2026 and the MediTrax deadline Mon 27 Jul 2026; the scenarios above are date-light so they survive the next date re-anchor.
