# Mike (Australia) — NexaCare/Whitegum Prompt & Workflow Library

*Research and educational use only. All entities and documents are fictional. Nothing Mike produces is legal advice, and every citation must be verified before you rely on it.*

You are a lawyer at Kendry & Slate (K&S), acting for NexaCare Health on its acquisition of Whitegum Medical Centres Pty Ltd — 18 medical centres across NSW and QLD, share acquisition, accelerated timetable. This library gives you realistic starting prompts, organised by role. Copy them, adapt them, and pay attention to *why* each one is framed the way it is: good prompts state the task, the source documents, the output format, and the constraints.

**Before you start:** open the project "NexaCare — Whitegum Acquisition", check the matter Lists tab for current deadlines, and skim the three playbooks under /playbooks. The fictional source documents (MediTrax MSA extract, MediTrax notice letter, two lease extracts, TSA IT schedule) should already be in the Library.

---

## Mia Rossi — Paralegal (trackers, data room, execution)

Mia's work rewards structure: lists, checklists, tables, version control.

1. *"List every deadline currently on the matter list for the NexaCare project, ordered by due date, and flag anything due in the next 5 business days."* — Lists.
2. *"From the MediTrax notice letter, extract every demand and every date into a table: demand, deadline, consequence threatened. Add each hard deadline to the matter list as a deadline item."* — document extraction + list write (note the approval gate when an agent does this).
3. *"Draft a conditions-precedent tracker as a table: CP, responsible party, status, target date, evidence required at completion. Start from the two CP clauses in the clause library."* — clause library + drafting.
4. *"Create a landlord consent tracker for the 16 leased premises with columns for consent trigger, standard, timeframe, pack sent date, and status. Populate the Parramatta and Toowong rows from the lease extracts."* — tabular thinking; then build the real thing with the 'Whitegum lease review' tabular template.
5. *"Turn these meeting notes into minutes with a numbered action list: owner, action, due date. [paste notes]"*
6. *"Export the CP tracker as a Word document for the client pack."* — exports.

## Aisha Rahman — Junior Associate (diligence, clause mapping)

Aisha's Week 2 tasking is the core exercise: map the vendor's demands to the contract in 3 hours.

1. *"Read the MediTrax MSA extract. Summarise clauses 14, 18, 19, 22 and 25 in plain English: what each party must do, what is discretionary, and every time period. Quote the operative words for anything that limits the vendor's rights."*
2. *"Compare the MediTrax notice letter against the MSA extract clause by clause. For each of the vendor's five demands, state: the governing clause, whether the demand is within contract / discretionary / overreach, and the negotiating lever. Present as a table."* — the heart of the Week 2 task. Check the model's work: did it catch cl 14.5 (no fee variation on change of control) against the 35% uplift demand? Cl 14.4's 15-business-day deemed consent against the 5-day ultimatum? Cl 25.1's narrow suspension grounds against the read-only threat?
3. *"Using the K&S one-pager format (headline issue, RAG rating, business impact across operations/timeline/cost, recommended path, next steps), draft the EHR one-pager with options A, B and C from the matter list task."*
4. *"Draft a Q&A list for our CIO contact and the vendor: cutover windows, extract cadence, prior test results, existing DPIA/TPRM materials, standard vendor assurance templates."*
5. *"What Commonwealth privacy obligations are engaged when patient records are migrated between platforms during an acquisition? List the propositions you are relying on, then run citation verification on all of them."* — then open /verify and adjudicate each assertion yourself via the AustLII search links. **This is the discipline: Mike never lets an unverified citation through silently, and neither should you.**
6. *"Format these authorities in AGLC4: [paste]"* — then verify each one exists.
7. Run the seeded agent workflow **"EHR vendor notice — contract vs demands (Week 2)"** against the MSA extract and notice letter, review the plan before approving it, and compare the agent's output to your own manual answer to prompt 2. Where did it do better? Where did it hallucinate or overreach?

## Tom Nguyen — Junior Associate (tech-heavy diligence, automation)

1. Build a tabular review from the **"Whitegum TSA review (per service)"** template over the TSA IT schedule. Then: *"Ask across the review: which services can we exit fastest, and what is the total monthly cost if completion slips 3 months?"* — tabular ask.
2. *"The seller's TSA IT draft is in the Library. Review it against the 'Transitional Services Agreements (Whitegum)' playbook and give me a redline priority list: dealbreakers first, each with the playbook fallback we can offer."* — playbook review. (Every clause in the seller draft deviates. Find all six.)
3. *"Save the exit-assistance clause we prefer into the clause library, tagged TSA, with guidance on when to use it."* — clause capture.
4. *"Search the clause library for our positions on data portability and draft a two-paragraph variation to MSA clause 18 that gets us unlimited extracts during transition at no charge."*
5. *"Draft an interim licence variation for MediTrax using the 'Interim licence during transition' clause as the base, filling the Migration Completion Date mechanics with fortnightly reviews and a 48-hour cutover cap."*
6. Connect an external tool via the MCP server and query `search_clauses` from outside Mike — then explain to the team what a PAT is and why it is shown only once.

## Lily Chen — Senior Associate (synthesis, options, client-ready output)

1. *"Consolidate everything we know from the matter documents into the accelerated critical path James asked for: landlord consents highest-risk-first, EHR mitigation, minimum viable HR day-one readiness, SPA risk allocation. Two to three options with risk/cost/timeline trade-offs, one page."*
2. Run the seeded workflow **"Landlord consent pack — highest risk first"**. Before approving the plan, edit it: does the research step capture the consent *trigger* question (share sale vs assignment)? The Toowong lease deems change of control to require consent in the lessor's absolute discretion; Parramatta gives 14 days and a reasonableness standard. Which premises leads the pack and why?
3. *"Draft the SPA conditions precedent for (a) MediTrax cooperation and (b) landlord consents at a 12-of-16 threshold including the top 8 by revenue. Use the clause library CPs as the base and adapt them to the accelerated timetable."*
4. *"We are compressing diligence by two weeks. Draft an email to Jonathan Wu setting out what we can safely compress, what we must hold, and the three decisions we need from the client today. Keep it under 300 words, headed paragraphs, no legalese."*
5. Run **"DD red-flag consolidation & verification"** across all five documents. Review the verification report before the output goes anywhere near the client.
6. *"Generate a DOCX export of the red-flag report for the client pack, AGLC4-styled."*

## David O'Connell — Senior Associate (verification, disclosure discipline)

1. *"Take the draft red-flag report and list every factual and legal assertion in it. Which ones have a verified source? Which are the model's inference? Mark each."* — then run Deep-verify on the report and adjudicate the assertions at /verify.
2. *"Audit the CP tracker against the SPA CP clauses: does every CP have an owner, evidence requirement, and long-stop consequence? What's missing?"*
3. *"Compare version 3 of the consent letter against version 2 and list every substantive change with its risk consequence."*
4. Review the audit log (ask your instructor for admin access, or discuss): who ran which agent, which tools did each step use, and could you reconstruct the chain of custody for the one-pager if the client challenged it?

## James Bentley & Priya Iyer — Partners (risk, approval, supervision)

1. *"Give me the 10-minute pre-brief: the three deal-critical items on NexaCare, each in two sentences — issue, exposure, recommended call. Nothing else."*
2. Approve (or reject) a queued agent run. Before approving, read the plan: are the steps role-appropriate? Is a drafting step trying to do research? Would you let a junior run with these instructions? **The approval gate is the supervision moment — treat it like reviewing a junior's research plan.**
3. *"Across the three playbooks, which dealbreaker positions is the other side most likely to attack under time pressure, and what is our least-cost concession path that stays inside the fallbacks?"*
4. Review Regwatch: triage this week's regulatory events across the three active watches (health privacy, workforce, competition). *"Which of these events, if any, changes advice we have already given on NexaCare?"*
5. Check matter economics on the usage page: spend by model and by project against the fixed-fee milestones. *"Is the AI spend on this matter tracking to the budget assumptions in the engagement letter?"*
6. Priya, on supervision: *"Draft a one-page note for the team on when they may rely on Mike's output without partner sign-off, and when 'Stop the Line' applies to an AI-generated document."*

---

## Regwatch searches worth setting up (already seeded)

| Watch | Topics | Why it matters here |
|---|---|---|
| Health privacy & data — EHR migration | APPs, notifiable data breaches, health records, OAIC guidance | The MediTrax migration is a privacy event; OAIC posture is a live vendor demand |
| Workforce — transfer of business & awards | Fair Work, awards, EBAs, underpayment | ~350 staff, mixed hiring models, outdated HR policies |
| Competition & merger clearance | Merger notification, ACCC | Deal-timing risk; students should discuss whether thresholds are met |
| Financial services & payments touchpoints *(inactive — enable if relevant)* | Medicare billing, payments | Adjacent exposure only |

## A note on legal sources

Mike computes **outbound AustLII search links only** — it never fetches or scrapes AustLII, and automated Jade.io checking runs only if your administrator has enabled it with BarNet's permission. When verification falls back to human self-validation, *you* open the link, *you* read the authority, and *you* record the verdict. That is not a limitation of the tool; it is the point of the exercise.
