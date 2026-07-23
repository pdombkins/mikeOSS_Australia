# LAWS3850 — Teaching Guide for Mike (Australia): the NexaCare / Whitegum case study

*Master instructor guide. Research and educational use only; nothing Mike produces is legal advice, and every citation must be human-verified before it is relied on. Companion documents: `content-suggestions-by-week.md` (rationale), `teaching-guide.md` (answer-key design notes), `prompt-library.md` (student-facing prompts), and the `seed/` folder (re-runnable SQL + CSVs).*

---

## 1. What this is

Kendry & Slate (a fictional Australian M&A firm) acts for NexaCare Health on its acquisition of Whitegum Medical Centres (18 medical centres, NSW & QLD; share acquisition; ~350 staff; 16 leases; 6 TSAs; an end-of-life EHR platform). The matter is pre-loaded into Mike (Australia) so students work a realistic legal-project-management scenario inside a real legal-AI tool, rather than reading about one.

The tool is deliberately used two ways at once:

1. **As the means** — students run scoping, diligence, drafting, review and verification tasks to *do* the LPM activity for each week.
2. **As the object of study** — Mike's own controls (approval gates, role-scoped tools, citation-verification, audit log, cost tracking) are specimens for the Week-4 and Week-8 discussions on GenAI in legal practice.

## 2. What is installed (all instructor-owned, shared to the class project as *editor*)

| Type | Count | Purpose |
|---|---|---|
| Project + workspace context | 1 | "NexaCare — Whitegum Acquisition" with K&S house conventions injected into every chat |
| Matter list (tasks / facts / deadlines) | 9 | Live tracker; deadlines drive notifications |
| Source documents (Library + project + KB-indexed) | 5 | MediTrax MSA extract & notice, two leases, TSA IT draft — with planted deviations |
| Substantive playbooks | 3 | EHR change-of-control, lease consent, TSA |
| **LPM workflows** | 11 | Scope, estimate, comms, process, ideation, journey, right-sourcing, ethics, happy-path, change, group pack |
| **CX/EX workflows** | 6 | CX audit, service recovery, feedback synthesis, EX pulse, workload rebalance, moments-that-matter |
| Deal workflows | 3 | EHR one-pager, lease consent pack, DD red-flag |
| Tabular templates | 2 | Lease review, TSA review |
| Governance / risk / CX-EX playbooks | 3 | GenAI-in-NSW-practice, right-sourcing risk & quality, CX/EX standards |
| Clause library | 20 | 12 precedent clauses + 8 LPM/CX-EX templates |
| Regwatch watches | 5 | Health privacy, workforce, competition, financial, AI/privacy/profession |

**A note on the calendar.** The matter tracker has been rolled onto a **live teaching calendar**: the in-narrative "crisis Monday" is set to **Monday 20 July 2026**, so the MediTrax five-business-day deadline falls on **Monday 27 July 2026** and the app's deadline sweep will raise notifications as it approaches. Weekday relationships are preserved. The **source documents keep their original in-narrative dates** (the letters and emails are the record "as sent"); read 8 September in the documents as the same in-narrative crisis day the tracker now dates to 20 July. To re-anchor for a later teaching block, re-run the date-shift in `seed/` with a new target Monday.

## 3. How to run an activity (the standard loop)

1. Open the **Workflows** page and pick the workflow for the week (they are prefixed W1–W8 or tagged *Client & Employee Experience*).
2. Attach the relevant matter documents (the picker lists the Library) and click **Run**.
3. The run appears under **Agents** as *awaiting approval*. **Review and edit the plan before approving** — this is the supervision moment: are the steps role-appropriate? Is a drafting step doing research it should not? Would you let a junior run with these instructions?
4. Approve; independent steps run in parallel; read the step outputs and the review step.
5. For anything with legal propositions, run **Verify** and adjudicate each assertion yourself via the AustLII/Jade search links.

Emphasise throughout: the point is the student's **judgment over the output**, not the output itself.

---

## 4. Week-by-week

### Week 1 — Scoping & estimating
- **LPM focus:** scoping, WBS/gantt, estimating and cognitive biases, value pricing.
- **Run in Mike:** *Scope a matter from a client brief (W1)* → compare Mike's WBS against the provided `NexaCare_MSA_WBS.xlsx`; then *Estimate & cognitive-bias register (W1)*.
- **Objective:** students can turn a brief into a defensible scope, assumptions and fixed-fee milestones, and can name the biases distorting their estimates.
- **Facilitate:** "What did Mike over-scope or miss?" "Which estimate is most exposed to the planning fallacy?" Show the **cost badge / usage page** — real AUD per task — and connect to the Victorian LSB value-pricing reading.
- **Answer-key cue:** a good scope must surface the five workstreams (EHR/data migration, landlord consents, TSAs, employment transfer, privacy) and tie the 10% holdback to completion.

### Week 2 — Teams, leadership & communication
- **LPM focus:** stakeholder management, psychological safety, delegation under pressure.
- **Run in Mike:** the seeded *EHR vendor notice — contract vs demands (W2)* crisis workflow (delegation under pressure); then *Stakeholder update — persona-tuned (W2)* to see one message rewritten for Keller, Wu and Okoye.
- **Objective:** students adapt communication to stakeholder style and honour "Stop the Line".
- **Facilitate:** contrast the three persona versions — what changed and why? Use the **plan-approval gate** as the delegation/supervision artefact. The *Stop the Line* clause template models the escalation norm.

### Week 3 — Process optimisation & design thinking
- **LPM focus:** process design, Lean/waste, design thinking.
- **Run in Mike:** *Map and diagnose a process — SIPOC + waste (W3)* over `NexaCare_MSA process.pdf`; then *Design-thinking ideation (W3)* on the top pain point.
- **Objective:** students can map a process, find waste, and move from pain point to prioritised solution.
- **Facilitate:** does Mike's SIPOC match the real handoffs in the WBS? Which "Quick Win" would you actually run? The continuous-improvement retro clause supports the debrief milestone.

### Week 4 — Data, AI & legal technology
- **LPM focus:** personas & journeys, legal-tech procurement, **generative-AI governance**.
- **Run in Mike:** *User-journey map for a stakeholder (W4)* (name a persona); build a *Plan on a page* for a quick win (clause template); then the governance activity below.
- **Governance activity (the distinctive one):** have students run any prior Mike output through **review against the *GenAI in NSW legal practice* playbook**. The playbook encodes **SC Gen 23** (NSW Supreme Court, commenced 3 Feb 2025) and the **joint AI Statement / Solicitor's Guide** (6 Dec 2024). Key teaching point: SC Gen 23 requires that **every citation be verified and that the verification not be done by GenAI** — which is exactly why Mike routes verification to a human via the Verify page. Show the **audit log** and **cost tracking** as the governance evidence trail.
- **Objective:** students can state the NSW rules, and can point to the specific tool controls that satisfy (or fail) them.
- **Debate:** *should generative AI be allowed in delivering legal services?* — now grounded in a tool they have used and its actual guardrails.

### Week 7 — Demand management, right-sourcing & risk
- **LPM focus:** disaggregation, ALSPs, commoditisation, risk & quality management.
- **Run in Mike:** *Right-sourcing analysis (W7)* → produces the disaggregation register; reviewed automatically against the *Right-sourcing risk & quality gates* playbook. Pair with a *TSA review* tabular run.
- **Objective:** students can decide keep/delegate/commoditise/outsource/automate for each task and defend it on risk, complexity and cost.
- **Facilitate:** which tasks are safe to outsource, and which fail a quality gate? Connect to the billable-hour debate.

### Week 8 — Professional ethics; CX & EX
See the CX/EX deep dive in §5. For **ethics**, run *LPM ethics check (W8)* on a proposed action (for example "compress diligence two weeks and lean on AI review"); it reviews against the governance playbook and surfaces where commercial pressure conflicts with obligation. Tie to Rogers & Dombkins and Legg.

### Week 9 — Transformation & change management
- **LPM focus:** change management, Kotter, innovation.
- **Run in Mike:** *Change plan — Kotter 8-step (W9)* for rolling out the client happy path or adopting Mike/LPM firm-wide; includes a resistance map keyed to the K&S partners. Stage ideas with the *Innovation one-pager* clause.
- **Objective:** students can build an eight-step change plan and anticipate resistance from named stakeholders.

### Week 10 — Group assessment
- **Run in Mike:** *Group-assessment deliverable builder* assembles a group's analysis into a presentation-ready, export-ready pack (DOCX/PDF).

---

## 5. Week-8 deep dive — Client Experience (CX) & Employee Experience (EX)

Six workflows plus a *Client & employee experience standards* playbook and two template clauses (*Service recovery note*, *Team pulse check*) support this week. A suggested 60-minute flow:

1. **Baseline (CX).** Run *Client experience (CX) audit & scorecard* → each group gets a RAG scorecard of the matter's touchpoints and an improvement backlog. Discuss: where is the client experience most at risk, and why is it usually a *communication* failure rather than a *legal* one?
2. **Recovery (CX).** Run *Service recovery response* on a seeded failure (e.g. "we missed the lease-consent deadline for the Parramatta premises"). **Teaching point built into the workflow:** the review step flags where a service apology risks becoming a legal admission needing partner/PI sign-off — the CX/ethics tension made concrete.
3. **Listening (CX).** Run *Client feedback synthesis* on a short set of mock client comments (provide 6–8 lines) to model the data-driven CX reading from the HBR article — themes, sentiment, actions.
4. **The team side (EX).** Run *Team experience (EX) & psychological-safety pulse* — uses the personas' wellbeing cues (Lily's over-commitment, Aisha's anxiety under pressure, David's rigidity, Tom's detail-miss risk). Then *Workload & wellbeing rebalance* to protect a sustainable pace while still meeting the deadline. Keep the framing supportive and non-clinical; the workflows are built to stay within a manager's remit.
5. **Synthesis.** Run *Moments that matter — CX/EX map* to surface where client and employee experience reinforce or **conflict** (compressing the timetable pleases the client but strains the team) — the core Week-8 tension.

**Facilitation prompts:** Can a strong culture prevent ethical breaches (Green)? Where did serving the client cost the team, and how would you redesign that moment? Which of Mike's own features support EX (the approval gate distributes accountability; the audit log protects the junior who flagged a risk)?

**Assessment artefact:** a one-page "ideal happy path" (Week-8 activity) plus a short EX note on how the accelerated timetable was staffed — both producible with these workflows.

**Care note for facilitators:** the EX workflows deliberately avoid clinical or diagnostic language and focus on practical, humane management actions. If real student wellbeing comes up in discussion, direct to UNSW support services rather than treating it as a case-study exercise.

---

## 6. Cross-cutting teaching hooks

- **Verification culture.** The seed deliberately never asserts contested law (NSW/QLD lessor-consent statutory overlays; Fair Work transfer-of-business; NDB citations). Students must verify — and the planted QLD property-law question is designed so an unverified model answer is plausibly wrong.
- **Supervision & governance.** Approval gates, role-scoped tools, the audit log, RBAC/ethical walls and per-query cost telemetry map directly onto professional-responsibility discussion (competence, supervision, costs disclosure).
- **Answer keys.** The planted-deviation answer keys (the five MediTrax overreaches; the benign-NSW vs hostile-QLD leases; the six TSA breaches) are set out in `teaching-guide.md` — use them to mark the substantive weeks objectively.

## 7. Setup, logistics & the two optional extras

- **Live now:** the MediTrax deadline (Mon 27 Jul 2026) will trigger the app's deadline notification within a day, so notifications are demonstrable during class.
- **Optional — weekly scheduled status report:** now that dates are live, a recurring "matter status report" can be scheduled (RAG health, CP tracker, deadlines, spend vs milestones). Ask and it can be set up in minutes.
- **Optional — live dashboard artefact:** a re-openable matter dashboard (deadlines, list items, spend) for the Week-4 metrics discussion. Available on request.
- **Regwatch caveat:** the AI-guidance watch uses the closest official government feeds (OAIC, Federal Register of Legislation); SC Gen 23 and Law Society protocol updates are a manual-tracking item because those bodies are not government-RSS sources (consistent with the no-scrape rule).
- **Per-cohort reset:** the hybrid model shares one instructor-owned project with students as editors; students create their own runs and tabular reviews inside it. To re-anchor dates for a later block, re-run the date-shift with a new target Monday.
