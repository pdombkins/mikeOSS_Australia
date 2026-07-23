# Further Mike (Australia) content — mapped to LAWS3850 weeks

*Research and educational use only. Companion to the NexaCare/Whitegum seed package.*

> **Status: BUILT and INSTALLED on this instance, 23 Jul 2026** (instructor-owned, pdombkins@gmail.com; visible to the two class-project editors). Installed: 11 LPM workflows (Weeks 1–8 + cross-cutting), 2 playbooks (GenAI governance — 6 rules; Right-sourcing risk & quality — 5 rules), 1 Regwatch watch, and 6 template clauses (embedded via UI import). See `seed/lpm_content_installed.sql` for a re-runnable copy and `seed/clauses_lpm_templates.csv` for the clauses.
>
> **Two items deliberately held** (not defects — they don't work against a past-dated scenario): the *weekly scheduled status report* and the *live dashboard artefact* both key off matter deadlines, which sit in Sept–Oct 2025. Against past dates they would report nothing. I'll set either up in minutes once you roll the `list_items.due_at` dates to the actual teaching weeks — just say the word.
>
> **One scope note on Regwatch:** the watch was built as *"AI, privacy & the legal profession"* using the two closest curated official feeds (OAIC news, Federal Register of Legislation). Regwatch only ingests official government RSS, and the NSW Supreme Court and Law Society are not in that curated source list — so SC Gen 23 / Law Society protocol updates remain a **manual-tracking** item (consistent with the project's no-scrape rule). Adding those as first-class sources would mean extending `backend/src/lib/regwatch/sources.ts`; happy to do that if you want it.

## The gap this fills

The content already installed is deliberately substantive-law-heavy: an EHR change-of-control playbook, lease/TSA reviews, a clause library, diligence and verification workflows. That supports the *deal*. But LAWS3850 is a **Legal Project Management** course — Kendry & Slate is the vehicle for teaching scoping, teams, process, legal tech, sourcing, ethics, CX/EX and change. Most weeks' activities are about *how the work is managed*, and Mike currently has little that speaks to that. The additions below are organised by teaching week, each expressed as concrete Mike primitives (workflows with approval-gated plan templates, playbooks, clause/list/tabular templates, Regwatch watches), and each tied to an existing class activity.

A second, course-level opportunity runs underneath Weeks 4 and 7: **Mike itself is a specimen of GenAI in legal practice.** Its verification gate, audit log, RBAC/ethical wall, and per-query cost tracking are exactly the controls the NSW guidance expects. Content that makes those visible turns the tool into the object of study, not just the means.

---

## Week 1 — Scoping & estimating (gantt, pricing, cognitive biases)

*Class activity: review the Kendry & Slate breakdown structure and gantt chart.*

- **Workflow — "Scope a matter from a client brief"** (assistant, approval-gated). Intake reads the client brief; drafting produces a work-breakdown structure by phase, an assumptions register, an explicit out-of-scope list, and a fixed-fee milestone breakdown matching the engagement model (DD/risk report → SPA signing → lease-consent readiness → completion, with the 10% holdback). Students compare Mike's WBS against the provided `NexaCare_MSA_WBS.xlsx` — what did it miss, what did it over-scope?
- **Tabular template — "Estimate register"**: columns for task, hours estimate, basis of estimate, and a *cognitive-bias check* (anchoring / optimism / planning-fallacy prompt). Directly serves the "estimating and cognitive biases" topic.
- **Discussion hook (no build needed):** Mike's `query_costs` cost badge is live actual-vs-budget data. Pair it with the Victorian LSB *Agreed Pricing* reading to debate value pricing — students can see the real AUD cost of each AI-assisted task against the fixed-fee milestones.

## Week 2 — Teams, leadership, communication, psychological safety

*Class activity: "delegation under pressure" — resolve the presented crisis. (The seeded Week-2 EHR workflow already is this.)*

- **Clause/snippet set — persona-tuned stakeholder comms.** Save preferred "house style" openers for each NexaCare contact drawn from their personas: Keller (commercial, decisive, outcome-first), Wu (disciplined, "no surprises", risk-weighted), Rossi (people-first, plain language), Okoye (precise, technical, zero-data-loss). A drafting workflow then produces the *same* status update rewritten for three stakeholders, so students see communication-style adaptation concretely.
- **Template — "Stop the Line" escalation note** (already referenced in the workspace context): headline risk, facts, who needs to decide, by when. Encodes the psychological-safety mechanism from the firm profile into a reusable artefact.
- **List/RACI seed — "who does what under pressure"**: maps the compressed-timetable tasks to Aisha/Lily/Mia/James against the personas' stated working styles, surfacing the delegation tensions the activity is about.

## Week 3 — Process optimisation & design thinking

*Class activity: process-map the case study to find pain points; design-thinking ideation.*

- **Workflow — "Map and diagnose a process" (SIPOC + waste)**: over the `NexaCare_MSA process.pdf`, produce a Suppliers-Inputs-Process-Outputs-Customers view plus a Lean waste scan (waiting, rework, handoffs), ranked by client impact. Feeds the pain-point identification directly.
- **Workflow — "Design-thinking ideation"**: for a chosen pain point, generate How-Might-We statements and a prioritised solution shortlist (impact × effort), mirroring the class ideation step.
- **Template — continuous-improvement retro**: the matter already has a post-completion debrief milestone; a blameless-retro template (what worked / what to change / one experiment) makes that milestone a teachable artefact and links to the operations `process-optimization` skill.

## Week 4 — Data, AI & legal technology (personas, journeys, GenAI governance)

*Class activities: journey-map stakeholders; "plan on a page" for a quick win; debate GenAI in legal services.*

- **Workflow — "User-journey map for a stakeholder"**: per persona, produce phases → actions → touchpoints → pain points → "moments that matter" (the personas already name these). Serves the journey-mapping activity end to end.
- **Template — "Plan on a page"**: one-page tech-initiative canvas (problem, users, build/borrow/buy, success metrics, risks) from the CLI reading, seeded with a NexaCare example (e.g. automating the lease-consent tracker).
- **Governance playbook — "GenAI in NSW legal practice"** *(high value).* Encode the expectations from **SC Gen 23** (commenced 3 Feb 2025) and the **joint AI Statement / Solicitor's Guide** as a playbook students run Mike's *own* outputs against: every citation verified (and verification **not** done by GenAI — SC Gen 23's own rule, which is precisely Mike's human-validation gate); no AI-generated evidence/affidavit content; confidentiality of client data; independent professional judgment; disclosure/competence. Verify current wording before class — this is exactly the citation-checking discipline being taught.
- **Regwatch watch — "Legal-profession AI guidance"**: official feeds only (court, Law Society, VLSB+C, Law Council). Lets students see regulatory monitoring working on the very topic they're debating. (Respects the project's no-scrape / official-source rule.)

## Week 7 — Demand management, right-sourcing, risk & quality

*Class activity: identify and quantify outsourcing opportunities in the case study.*

- **Workflow — "Right-sourcing analysis"**: for each WBS task, classify keep-with-partner / delegate-to-junior / paralegal / commoditise-template / ALSP-outsource / automate-with-Mike, with a rationale and a rough cost/risk delta. Produces exactly the "identify and quantify opportunities for outsourcing" deliverable.
- **Playbook — "Risk & quality gates"**: quality checkpoints and a risk-acceptance ladder for disaggregated work (who reviews outsourced output, what can't leave the firm), linking to the operations `risk-assessment` skill and the Lacity/Willcocks LPO risk reading.
- **Tabular template — "Disaggregation register"**: task, current owner, candidate model, annualised volume, unit cost, risk rating — the quantification the activity asks for.

## Week 8 — Professional ethics; CX & EX

*Class activities: debate LPM/AI ethics; map an ideal client "happy path".*

- **Workflow — "LPM ethics check"**: run a proposed action (e.g. "compress diligence by two weeks and lean on AI review") against a checklist drawn from Rogers & Dombkins — cost disclosure, scope-creep transparency, competence, supervision of AI output, confidentiality, independent judgment — flagging where commercial pressure and professional obligation conflict. This is the Week-8 debate made operational.
- **Workflow — "Client happy-path map"**: from first contact to post-completion debrief, the ideal CX journey with the emotional highs/lows per persona; contrast with the Week-2 crisis path.
- **EX note (uses the personas' wellbeing cues):** Lily's over-commitment/burnout risk, Aisha's anxiety under pressure, David's external stressors — an EX-lens retro on how the accelerated timetable was staffed. Connects the Green *Culture Hacker* reading to the actual team.
- **Ethics-as-control tie-in:** Mike's audit log + verification report are a defensible record of *how* an AI-assisted output was checked — a concrete artefact for the "instilling ethical judgment in the age of AI" (Legg) discussion.

## Week 9 — Transformation & change management

*Class activity: build a change-management approach for the client-engagement "happy path".*

- **Workflow — "Change plan (Kotter 8-step)"**: generate a rollout plan for adopting the happy-path (or for adopting Mike/LPM firm-wide), structured on Kotter, with a stakeholder resistance map keyed to the K&S personas (James's skepticism of "shiny tech", Priya's tech-forward advocacy, David's audit-trail caution). Serves the Week-9 activity and connects to the operations `change-request` skill.
- **Template — "Innovation one-pager"**: problem, hypothesis, pilot, success metric, scale/kill decision — for staging the change.

## Cross-cutting (any week / Week 10 group assessment)

- **Scheduled "matter status report"** (weekly): a recurring status digest — RAG health, CP tracker movement, upcoming deadlines, AI spend vs milestones — using the operations `status-report` skill. Demonstrates automation and gives groups a running artefact.
- **Live dashboard artefact**: a re-openable matter dashboard (deadlines, list items, spend) students check each week — good for the Week-4 "measuring success/metrics" discussion.
- **Group-assessment deliverable builder**: a workflow that assembles a group's chosen analysis into a presentation-ready pack (DOCX/PDF export already supported).

---

## What I'd prioritise

If you want the biggest teaching return for the least build: **(1)** the Week-1 scoping workflow (anchors the whole course and reuses the WBS you already have), **(2)** the Week-4 GenAI-governance playbook + Regwatch watch (turns Mike into the object of study and is the most novel, defensible content), and **(3)** the Week-8 LPM ethics-check workflow. Those three cover the course's distinctive spine — scope/price, govern AI, act ethically — and each reuses assets already in the seed.

Everything here is buildable with the same primitives already installed (approval-gated workflow plan templates, playbooks + rules, tabular column sets, clauses, list items, Regwatch watches). Say which weeks you want and I'll seed them the same way — instructor-owned, shared to the class project.
