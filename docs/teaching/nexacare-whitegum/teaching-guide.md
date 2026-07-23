# Instructor Guide — NexaCare/Whitegum on Mike (Australia)

*For research and educational purposes only. Companion to `prompt-library.md` and the seed package in `seed/`.*

## What this package contains

| Component | Where | Mike feature exercised |
|---|---|---|
| Matter, org context, list items | `seed/nexacare_seed.sql` | Projects, workspace context injection, Lists (tasks/facts/deadlines) |
| 3 playbooks × 6 rules | `seed/nexacare_seed.sql` | Playbooks, `review_against_playbook` |
| 12 precedent clauses | `seed/clauses_import.csv` (import via UI so embeddings generate) | Clause library, semantic `search_clauses` |
| 3 agent workflow templates | `seed/nexacare_seed.sql` | Agent runtime, plan approval gate, role tool allowlists |
| 2 tabular review column sets | `seed/nexacare_seed.sql` | Tabular review v2 (typed columns), tabular ask |
| 4 regulatory watches | `seed/nexacare_seed.sql` | Regwatch (official feeds only) |
| 5 fictional source documents | `documents/` | Library, extraction, diligence exercises |

## The pedagogical design

The source documents contain **planted deviations** so that correct AI output is checkable against a known answer key:

**MediTrax notice vs MSA extract** (Aisha's Week 2 exercise) — five demands, each with a known classification:

| Vendor demand | Contract position | Classification |
|---|---|---|
| Response in 5 business days | cl 14.4: vendor must respond within 15 BDs of receiving information; deemed consent | Overreach — the clause imposes the clock on the *vendor*, not the customer |
| 35% interim fee uplift as condition | cl 14.5: no fee variation by reason only of change of control | Overreach — direct contradiction |
| "Approval" of security documentation | cl 22.3: customer provides a *summary* on reasonable request; no vendor approval right | Overreach — approval right invented |
| Read-only at completion | cl 25.1: suspension only for platform security necessity or unremedied non-payment (20 BD cure) | Overreach — no trigger exists; note cl 25.2 minimisation duty |
| Staggered bulk extracts | cl 18.2–18.3: export within 15 BDs; charges only after 2 bulk exports/year | Partial lever — vendor can charge for volume but cannot dictate schedule |
| Withholding assistance on privacy grounds | cl 19.3: assistance withheld only for *unremedied material breach by the customer* | Overreach — but cl 14.3 gives a narrow legitimate hook (security/privacy risk), worth class discussion |

**Leases** — Parramatta (NSW) is the benign baseline: reasonableness standard, 14-day clock, holding-company guarantee, statutory-overlay savings clause (cl 11.5 invites the NSW discussion). Toowong (QLD) is the hostile one: absolute discretion, deemed change-of-control capture, $15k fee, market rent review on consent, director personal guarantees (a playbook dealbreaker), make-good reassessment, no timeframe. Discussion: what does the QLD statutory overlay do to cl 13.1 after the 2023 property law reforms commenced in 2025? **Deliberately left for students to research and verify** — the seed content flags it but never asserts the answer.

**TSA IT seller draft** — breaches all six playbook positions (12-month auto-extending term, all-or-nothing termination, cost-plus 20% with 10% step-ups, discretionary exit assistance, 1-month liability cap, data-loss exclusion). A clean playbook-review exercise with a perfect-score answer key of six.

**Share sale nuance** running through everything: the employer and lessee entity does not change. Students should catch that (a) Fair Work transfer-of-business provisions are not triggered by the share sale itself, only by post-completion restructures; (b) lease consent is only needed where the lease *deems* change of control an assignment (both seeded leases do, in different ways); (c) the MediTrax clause expressly captures share transfers.

## Suggested week-by-week mapping (aligned to the WBS phases)

**Week 1 — Scoping.** Students explore the seeded project, org context, playbooks and matter list. Exercise: partner pre-brief prompt (James's prompt 1); discuss how workspace context changes Mike's answers (ask the same question with and without a project selected).

**Week 2 — The EHR crisis (core week).** The emails scenario. Aisha-track students do the manual clause-mapping prompt, then run the seeded agent workflow and critique the difference. Assessment artefact: the one-pager, with the demands-vs-contract table marked against the answer key above. Teaching moments: the approval gate as supervision; role tool allowlists (why can't the drafting step search Jade?); estimated vs actual token cost on the run.

**Week 3 — Due diligence at scale.** Tabular reviews over the leases and TSA using the seeded column sets; typed columns and reference documents; tabular ask; the red-flag consolidation workflow. Assessment: red-flag report + verification report with every assertion adjudicated.

**Week 4 — Documentation & negotiation.** Clause library work: adapt the CP clauses, draft the MediTrax interim licence variation, redline the TSA against the playbook. Exports (DOCX/PDF, AGLC4 restyle). Discussion: when is a playbook a crutch?

**Week 5 — Completion & governance.** Lists as CP tracker; audit log review (chain of custody for AI outputs); usage/budget vs fixed-fee milestones; Regwatch triage; the 'Stop the Line' memo (Priya's prompt 6). Capstone discussion: what would you need to see before letting Mike's output go to a client unreviewed — and is the answer "nothing suffices"?

## Learning objectives this package supports

1. **Prompt discipline** — task, sources, format, constraints; the library models this in every prompt.
2. **Verification culture** — the AustLII human-validation loop makes citation checking a deliberate act students perform, not a checkbox. The QLD property law question is seeded specifically so that an unverified model answer is plausibly wrong.
3. **Supervision & governance** — approval gates, role-scoped tools, audit logs, and cost telemetry map directly onto professional-responsibility discussions (competence, supervision of non-lawyer assistance, costs disclosure).
4. **Legal judgment over extraction** — the planted-deviation design means the hard marks are for *classification and consequence* (overreach vs lever, RAG rating, SPA treatment), not retrieval.

## Setup, marking and admin notes

- Setup order matters: run the SQL first, import the clauses CSV via the UI second (embeddings), upload documents third. Per-student vs shared-account trade-offs are covered in `seed/README.md`.
- If Jade access is not admin-approved (default), verification runs in human self-validation mode — this is the pedagogically preferable mode.
- The seeded scenario dates are September–October 2025 (fixed by the case study). Deadline notifications will not fire for past dates; treat the list as a snapshot of Week 2 state, or update `due_at` values to the current teaching week if you want the 72-hour deadline sweep and notifications to demonstrate live.
- Cost visibility: consider setting a small monthly budget per student account so the budget banner and 80% notification behaviour appear during the course.
