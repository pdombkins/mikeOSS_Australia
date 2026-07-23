-- ============================================================================
-- NexaCare / Whitegum case study — seed data for Mike (Australia)
-- For research and educational purposes only. All entities, people, documents
-- and disputes are fictional. Not legal advice.
--
-- HOW TO USE
-- 1. Find-and-replace the placeholder owner id below with the Supabase auth
--    user id of the account students will use (Account → profile, or
--    auth.users in the SQL editor):
--       REPLACE  00000000-0000-0000-0000-000000000000  WITH  <your user uuid>
-- 2. Run this whole file in the Supabase SQL editor.
-- 3. Import seed/clauses_import.csv via the app UI (/clauses → Import CSV) so
--    clause embeddings are generated. Do NOT insert clauses by SQL — rows
--    inserted here would have no embedding and would be invisible to
--    semantic search.
-- 4. Upload the fictional documents in documents/ to the Library and/or the
--    project, then build tabular reviews using the column sets in
--    prompt-library.md.
--
-- Scenario date anchor: Monday 8 September 2025 (Week 2 emails).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Workspace (org) context — injected into every chat/agent system prompt
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value)
values (
  'org_context',
  to_jsonb(
'You are assisting lawyers at Kendry & Slate (K&S), a fictional Australian M&A firm, on the NexaCare Health acquisition of Whitegum Medical Centres Pty Ltd (18 medical centres, NSW & QLD; share acquisition with TSAs). This is a university teaching simulation — all parties and documents are fictional; output is educational, not legal advice.

House conventions:
- Australian law and Australian English throughout. Cite legislation and cases in AGLC4; every citation must be verified before it reaches a client-facing document.
- Risk ratings use the K&S RAG scale: RED = deal-critical / conditions precedent territory; AMBER = negotiate or price; GREEN = accept/monitor.
- Issue-led writing: headline issue first, then risk rating, business impact (operations, timeline, cost), recommended path, next steps.
- "Stop the Line": any material risk must be called out immediately, with facts.
- The matter runs on a fixed fee with milestone billing; flag anything likely to expand scope.
- Key deadlines are tracked in the matter list; check it before proposing timetables.'
  )
)
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- 1. Matter (project)
-- ---------------------------------------------------------------------------
insert into public.projects (id, user_id, name, cm_number, practice)
values (
  '11111111-1111-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'NexaCare — Whitegum Acquisition',
  'KS-2025-0847',
  'Healthcare M&A'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Playbooks + rules
-- ---------------------------------------------------------------------------
-- 2a. EHR SaaS — change of control & data migration
insert into public.playbooks (id, owner_id, name, agreement_type, description)
values (
  '22222222-0001-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'EHR SaaS — Change of Control & Data Migration',
  'MSA',
  'K&S positions for health-tech SaaS agreements in a change-of-control event. Built for the MediTrax MSA on the NexaCare/Whitegum matter; anchored to operational continuity (no read-only lockout), clean data portability, and APP-compliant migration.'
)
on conflict (id) do nothing;

insert into public.playbook_rules (playbook_id, position, topic, preferred, acceptable_fallback, dealbreaker, severity, notes) values
('22222222-0001-4111-8111-111111111111', 1, 'Change-of-control consent',
 'Notice-only for share acquisitions where the contracting entity and its obligations continue unchanged; no consent right for the vendor.',
 'Consent not to be unreasonably withheld or delayed, with deemed consent after 10 business days and objective criteria (solvency, security posture).',
 'Vendor right to terminate, suspend, or degrade service (including read-only) triggered by change of control alone.',
 'high',
 'MediTrax notice asserts rights beyond cl 14 — map each demand to the clause before conceding anything.'),
('22222222-0001-4111-8111-111111111111', 2, 'Data portability & export',
 'Full export of all patient and practice data in open, documented formats (HL7 FHIR / CSV) within 10 business days of request, unlimited extracts during any transition period, at no additional charge.',
 'Cost-recovery charges for extraordinary extracts, capped and pre-quoted; standard extracts free.',
 'Extract schedules at vendor discretion, staggered extracts that cannot support a single cutover weekend, or export withheld pending commercial agreement.',
 'high',
 'Read-only + staggered extracts is the operational nightmare scenario for day-one clinic operations.'),
('22222222-0001-4111-8111-111111111111', 3, 'Migration cooperation & assistance',
 'Express obligation to provide reasonable migration assistance (mapping documentation, test extracts, cutover support) with defined response times.',
 'Assistance at published rate card with committed availability for the cutover window.',
 'Any "reservation of rights" to withhold assistance, or assistance conditional on matters outside the contract.',
 'high', null),
('22222222-0001-4111-8111-111111111111', 4, 'Interim licence & fees',
 'Existing licence terms and fees continue unchanged until migration completes.',
 'CPI-capped uplift for a defined transition term (≤ 6 months), documented as a variation with go/no-go gates.',
 'Uncapped or percentage fee increases imposed as a condition of consent or of continued service.',
 'medium',
 'A 35%-style uplift demanded under deadline pressure is a negotiation lever, not an entitlement — check cl 14 and the fee schedule.'),
('22222222-0001-4111-8111-111111111111', 5, 'Security & privacy documentation',
 'Mutual, defined information exchange; buyer provides a security summary and DPIA/TPRM extract; vendor approval (if any) not to be unreasonably withheld, with a deemed-approval backstop.',
 'Agreed checklist of artefacts with a fixed review window (5–10 business days) and escalation to senior representatives.',
 'Unilateral vendor discretion over "approval" of buyer security posture with no criteria, timeframe, or review.',
 'medium',
 'APP 11 / NDB scheme obligations sit with both parties during migration; assurances should be reciprocal.'),
('22222222-0001-4111-8111-111111111111', 6, 'Service continuity at completion',
 'Full read-write service continues from completion until migration cutover is verified complete.',
 'Short, defined read-only window (≤ 48 hours) only during the agreed cutover itself, with rollback rights.',
 'Read-only from completion, or service levels reduced while transition negotiations continue.',
 'high',
 'Ties directly to the SPA: consider a condition precedent or completion deliverable around vendor cooperation.');

-- 2b. Lease assignment & landlord consent (NSW/QLD)
insert into public.playbooks (id, owner_id, name, agreement_type, description)
values (
  '22222222-0002-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'Lease Assignment & Landlord Consent (NSW/QLD)',
  'other',
  'K&S positions for the 16 Whitegum leased premises. Share sale means most leases are not formally assigned, but change-of-control provisions in leases and legacy consent requirements still bite. Statutory overlay differs by state — verify before advising.'
)
on conflict (id) do nothing;

insert into public.playbook_rules (playbook_id, position, topic, preferred, acceptable_fallback, dealbreaker, severity, notes) values
('22222222-0002-4111-8111-111111111111', 1, 'Consent standard',
 'Lessor consent not to be unreasonably withheld or delayed; change of control of a corporate tenant expressly excluded from "assignment".',
 'Consent required but subject to statutory reasonableness overlay; agreed information pack defined in advance.',
 'Absolute-discretion consent clauses relied on to extract rent increases or new terms unrelated to the covenant strength of the tenant.',
 'high',
 'Check the statutory overlay in each state (NSW conveyancing legislation; QLD property law legislation — note the 2023 QLD Act commenced 2025). Students: verify the current provisions before citing.'),
('22222222-0002-4111-8111-111111111111', 2, 'Consent timing',
 'Lessor response within 15 business days of a complete consent pack, with deemed consent thereafter.',
 '20 business days with an escalation contact and weekly status.',
 'Open-ended timing on the critical-path premises (top 8 by revenue).',
 'high',
 'Landlord consents are the longest lead-time item on the accelerated timetable — start highest-risk-first.'),
('22222222-0002-4111-8111-111111111111', 3, 'Guarantees & security',
 'Replacement or parent-company guarantee from NexaCare Health only; release of outgoing Whitegum guarantors at completion.',
 'Bank guarantee uplift to market-standard months of rent.',
 'Personal guarantees from directors or officers.',
 'medium', null),
('22222222-0002-4111-8111-111111111111', 4, 'Costs',
 'Each party bears its own costs; lessor''s reasonable legal costs of consent capped and pre-agreed.',
 'Lessor costs payable subject to itemisation and a cap.',
 'Uncapped costs undertakings or "administration fees" untethered to actual cost.',
 'low', null),
('22222222-0002-4111-8111-111111111111', 5, 'Make-good',
 'Existing make-good obligations continue unchanged; no reassessment or crystallisation triggered by the consent.',
 'Updated condition report agreed at consent, without expanding scope.',
 'Consent conditional on immediate make-good works or increased make-good scope.',
 'medium', null),
('22222222-0002-4111-8111-111111111111', 6, 'Rebranding & minor works',
 'Consent to NexaCare rebranding signage and minor fit-out bundled into the consent pack.',
 'Separate licence for works on standard terms, processed in parallel.',
 'Rebranding consent withheld to reopen commercial terms.',
 'low', null);

-- 2c. Transitional services agreements (Whitegum)
insert into public.playbooks (id, owner_id, name, agreement_type, description)
values (
  '22222222-0003-4111-8111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'Transitional Services Agreements (Whitegum)',
  'other',
  'Positions for the six Whitegum TSAs (IT, payroll, AP, call centre, marketing, compliance). Client preference: short TSAs — the seller''s IT platform is end of life. Only deal-critical services survive the acceleration review.'
)
on conflict (id) do nothing;

insert into public.playbook_rules (playbook_id, position, topic, preferred, acceptable_fallback, dealbreaker, severity, notes) values
('22222222-0003-4111-8111-111111111111', 1, 'Term',
 'Initial term ≤ 6 months per service, with up to two 3-month extensions at buyer''s option only.',
 '9-month initial term for payroll and IT where migration genuinely requires it.',
 'Terms beyond 12 months, or seller options to extend.',
 'high',
 'Seller IT platform is end of life — every month of TSA IT dependence is operational risk.'),
('22222222-0003-4111-8111-111111111111', 2, 'Service standard',
 'Services provided to the same standard and scope as the 12 months before completion, with named key personnel.',
 'Documented service descriptions with objective KPIs.',
 '"Reasonable endeavours" only, with no baseline or remedy.',
 'medium', null),
('22222222-0003-4111-8111-111111111111', 3, 'Charges',
 'Cost or cost-plus ≤ 5%, itemised monthly.',
 'Fixed monthly fee benchmarked to pre-completion cost allocation.',
 'Margins above 15% or step-ups over time that penalise a delayed exit.',
 'medium', null),
('22222222-0003-4111-8111-111111111111', 4, 'Exit & migration assistance',
 'Exit assistance (data handover in open formats, knowledge transfer, migration support) included in the charges and survives expiry.',
 'Exit assistance at cost with committed availability.',
 'No exit-assistance obligation, or assistance at seller discretion.',
 'high',
 'Interlocks with the EHR playbook — TSA IT may need to carry EHR cooperation obligations if the vendor route fails (Option B in the Week 2 one-pager).'),
('22222222-0003-4111-8111-111111111111', 5, 'Early termination',
 'Buyer may terminate any service for convenience on 30 days'' notice, per service, without penalty.',
 '60 days for payroll only.',
 'All-or-nothing termination or break fees.',
 'medium', null),
('22222222-0003-4111-8111-111111111111', 6, 'Liability',
 'Provider liability cap not less than 12 months'' charges for the affected service; carve-outs for data loss caused by failure to follow the migration runbook.',
 'Cap at 6 months'' charges with the data-loss carve-out intact.',
 'Liability excluded for data loss or migration failures.',
 'medium', null);

-- ---------------------------------------------------------------------------
-- 3. Regulatory watches (Regwatch)
-- ---------------------------------------------------------------------------
insert into public.regulatory_watches (owner_id, name, topics, jurisdictions, sources, active) values
('00000000-0000-0000-0000-000000000000',
 'Health privacy & data — EHR migration',
 array['privacy','Australian Privacy Principles','notifiable data breach','health records','My Health Record','data migration','OAIC guidance'],
 array['Cth','NSW','QLD'],
 array['oaic_news','frl_new_acts'],
 true),
('00000000-0000-0000-0000-000000000000',
 'Workforce — transfer of business & awards',
 array['Fair Work','transfer of business','modern award','enterprise agreement','underpayment','casual employment','health professionals award'],
 array['Cth'],
 array['fwo_media','frl_new_acts'],
 true),
('00000000-0000-0000-0000-000000000000',
 'Competition & merger clearance',
 array['merger','acquisition','notification threshold','ACCC','healthcare services','clearance'],
 array['Cth'],
 array['accc_media','frl_new_acts'],
 true),
('00000000-0000-0000-0000-000000000000',
 'Financial services & payments touchpoints',
 array['Medicare billing','bulk billing','payment systems','health insurance'],
 array['Cth'],
 array['asic_media','apra_news','frl_new_acts'],
 false);

-- ---------------------------------------------------------------------------
-- 4. Agent workflows (assistant type, with approval-gated plan templates)
--    Tool allowlists are derived server-side from each step role — the
--    plan_template only needs role / instruction / depends_on.
-- ---------------------------------------------------------------------------
insert into public.workflows (id, user_id, title, type, prompt_md, practice, jurisdictions, plan_template) values
(
 '33333333-0001-4111-8111-111111111111',
 '00000000-0000-0000-0000-000000000000',
 'EHR vendor notice — contract vs demands (Week 2)',
 'assistant',
 'Analyse the MediTrax change-of-control notice against the MediTrax MSA extract. Produce the K&S one-pager: headline issue, RAG risk rating, business impact (operations, timeline, cost), and a recommended path with next steps, plus a clause-by-clause overreach map and three options (A: interim licence/fee variation with go/no-go gates; B: targeted TSA for EHR cooperation and data extracts; C: rephased cutover/staged onboarding). Close with a Q&A list for the CIO and the vendor.',
 'Healthcare M&A',
 array['NSW','QLD','Cth'],
 '{
   "title": "EHR vendor notice — contract vs demands",
   "steps": [
     {"position": 1, "depends_on": [], "role": "intake",
      "instruction": "Identify the MediTrax MSA extract and the MediTrax notice letter among the matter documents. List every demand made in the notice (deadline, interim licence/fee variation, security documentation approval, read-only at completion, staggered extracts, reservation of rights). Add any hard deadlines you find to the matter list as deadline items."},
     {"position": 2, "depends_on": [1], "role": "research",
      "instruction": "For each demand, locate the governing clause in the MSA extract (change of control, data portability, cooperation/assistance, privacy and security, suspension and cure). Quote the operative words. Classify each demand as: within contract, discretionary, or overreach. Note any cure periods and notice requirements. Search the clause library and knowledge base for K&S preferred positions on each topic."},
     {"position": 3, "depends_on": [2], "role": "drafting",
      "instruction": "Draft the one-pager in K&S format: headline issue; RAG rating; business impact across operations, timeline and cost; recommended path and next steps. Then a demands-vs-contract table, options A/B/C with trade-offs and go/no-go gates, the privacy assurance position (APPs / notifiable data breach posture — mark anything needing CIO confirmation), and the Q&A list for Daniel Okoye and the vendor."},
     {"position": 4, "depends_on": [3], "role": "review",
      "instruction": "Review the draft against the ''EHR SaaS — Change of Control & Data Migration'' playbook. Flag any concession that crosses a dealbreaker, any RAG rating inconsistent with the playbook severity, and any legal proposition that needs citation verification before client use."}
   ]
 }'::jsonb
),
(
 '33333333-0002-4111-8111-111111111111',
 '00000000-0000-0000-0000-000000000000',
 'Landlord consent pack — highest risk first',
 'assistant',
 'Build the landlord consent strategy for the Whitegum leased premises: review lease extracts, classify consent risk, and draft the consent request pack for the highest-risk premises.',
 'Healthcare M&A',
 array['NSW','QLD'],
 '{
   "title": "Landlord consent pack — highest risk first",
   "steps": [
     {"position": 1, "depends_on": [], "role": "research",
      "instruction": "Review each lease extract in the matter documents. For each premises capture: consent trigger (assignment vs change of control), consent standard (reasonableness vs absolute discretion), response timeframe, guarantee/security requirements, costs provisions, make-good exposure. Rank premises by consent risk, noting which are in the top 8 by revenue per the matter list facts."},
     {"position": 2, "depends_on": [1], "role": "research",
      "instruction": "Check the ''Lease Assignment & Landlord Consent (NSW/QLD)'' playbook and the clause library for K&S positions. Identify where each lease deviates. Flag state-law overlay questions that require verified citations (NSW and QLD statutory reasonableness provisions) — do not assert statutory positions without flagging them for verification."},
     {"position": 3, "depends_on": [2], "role": "drafting",
      "instruction": "Draft: (1) a consent-risk summary table across all reviewed premises; (2) a consent request letter for the highest-risk premises enclosing the agreed information pack (covenant strength, parent guarantee offer, rebranding works summary); (3) a short internal note on fallback positions if consent stalls, aligned to playbook fallbacks."},
     {"position": 4, "depends_on": [3], "role": "review",
      "instruction": "Review outputs against the lease playbook. Confirm no dealbreaker positions have been conceded, timing asks match the accelerated timetable, and every statutory reference is flagged for citation verification."}
   ]
 }'::jsonb
),
(
 '33333333-0003-4111-8111-111111111111',
 '00000000-0000-0000-0000-000000000000',
 'DD red-flag consolidation & verification',
 'assistant',
 'Consolidate diligence findings across the matter documents into the K&S red-flag report format (RAG-rated, issue-led), then verify every legal assertion and citation before it goes to the client.',
 'Healthcare M&A',
 array['NSW','QLD','Cth'],
 '{
   "title": "DD red-flag consolidation & verification",
   "steps": [
     {"position": 1, "depends_on": [], "role": "research",
      "instruction": "Across all matter documents (EHR MSA extract, vendor notice, lease extracts, TSA schedule), extract every issue that could affect signing or completion. For each: issue, source document and clause, RAG rating per the K&S scale, business impact (operations/timeline/cost), and proposed treatment (condition precedent, warranty/indemnity, price adjustment, conduct covenant, or accept)."},
     {"position": 2, "depends_on": [1], "role": "drafting",
      "instruction": "Draft the red-flag report: executive summary for the partner (max one page, deal-critical items only), then the full RAG-rated issues table, then a proposed SPA risk-allocation map linking each RED item to a specific SPA mechanism. Use Australian English and AGLC4 for any authorities."},
     {"position": 3, "depends_on": [2], "role": "verify",
      "instruction": "Run assertion verification over the draft report. Every statutory or case-law proposition must be checked; where automated verification is unavailable, record the assertion for human validation via the verification page and mark it clearly as unverified in the report."}
   ]
 }'::jsonb
);

-- ---------------------------------------------------------------------------
-- 5. Tabular review workflow templates (column sets students can reuse)
-- ---------------------------------------------------------------------------
insert into public.workflows (id, user_id, title, type, columns_config, practice, jurisdictions) values
(
 '33333333-0004-4111-8111-111111111111',
 '00000000-0000-0000-0000-000000000000',
 'Whitegum lease review (per premises)',
 'tabular',
 '[
   {"index": 0, "name": "Premises & landlord", "prompt": "State the premises address and the landlord (lessor) entity named in the lease.", "type": "text"},
   {"index": 1, "name": "Current annual rent", "prompt": "Extract the current annual rent. If a rent review mechanism applies, note the type (CPI, fixed %, market).", "type": "money"},
   {"index": 2, "name": "Term expiry", "prompt": "Extract the current term expiry date. Note any options to renew and their exercise windows.", "type": "date"},
   {"index": 3, "name": "Consent trigger", "prompt": "Does the lease require lessor consent for (a) assignment only, or (b) also for a change of control of the tenant company? Quote the operative words.", "type": "text"},
   {"index": 4, "name": "Consent standard", "prompt": "Is consent subject to a reasonableness standard, or absolute discretion? Quote the clause.", "type": "risk"},
   {"index": 5, "name": "Response timeframe", "prompt": "What timeframe (if any) does the lease impose on the lessor to respond to a consent request?", "type": "duration"},
   {"index": 6, "name": "Guarantee / security", "prompt": "What guarantees, bank guarantees or security deposits are required, and what happens to them on assignment or change of control?", "type": "text"},
   {"index": 7, "name": "Make-good exposure", "prompt": "Summarise the make-good obligation and whether the consent process could trigger reassessment.", "type": "risk"}
 ]'::jsonb,
 'Healthcare M&A',
 array['NSW','QLD']
),
(
 '33333333-0005-4111-8111-111111111111',
 '00000000-0000-0000-0000-000000000000',
 'Whitegum TSA review (per service)',
 'tabular',
 '[
   {"index": 0, "name": "Service", "prompt": "Which transitional service does this schedule cover (IT, payroll, AP, call centre, marketing, compliance)?", "type": "text"},
   {"index": 1, "name": "Term & extensions", "prompt": "Extract the initial term, extension rights and who holds them.", "type": "duration"},
   {"index": 2, "name": "Charges basis", "prompt": "Extract the charging basis (cost, cost-plus %, fixed fee) and any step-ups over time.", "type": "money"},
   {"index": 3, "name": "Service standard", "prompt": "What service standard applies? Is it benchmarked to pre-completion performance?", "type": "text"},
   {"index": 4, "name": "Exit assistance", "prompt": "What exit/migration assistance is the provider obliged to give, at whose cost, and does it survive expiry?", "type": "risk"},
   {"index": 5, "name": "Termination for convenience", "prompt": "Can the buyer terminate the service early? Notice period and any break fees.", "type": "text"},
   {"index": 6, "name": "Playbook deviation", "prompt": "Compare against the K&S TSA playbook positions (term ≤6 months buyer-extendable; cost-plus ≤5%; exit assistance included; 30-day per-service termination; liability cap ≥12 months charges). Rate the overall deviation.", "type": "risk"}
 ]'::jsonb,
 'Healthcare M&A',
 array['NSW','QLD']
);

-- ---------------------------------------------------------------------------
-- 6. Matter list — Week 2 state (deadlines, tasks, facts)
-- ---------------------------------------------------------------------------
insert into public.list_items (project_id, created_by, kind, title, detail, due_at, status, position) values
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','deadline',
 'MediTrax response window closes (5 business days from notice)',
 'Vendor notice dated Mon 8 Sep 2025 demands security & data migration documentation for approval and execution of an interim licence/fee variation within 5 business days, failing which: read-only patient portal/API at completion and staggered bulk extracts.',
 '2025-09-15T07:00:00Z','open',1),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','deadline',
 'Exclusivity ticking fee escalates',
 'Escalation under the 60-day exclusivity arrangement — a key driver of the CEO''s request to accelerate signing and completion by ~2 weeks.',
 '2025-09-15T07:00:00Z','open',2),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','task',
 'EHR one-pager for client meeting (Aisha)',
 'RAG heatmap + issues list: what cl requires vs vendor overreach; options A (interim licence/variation with go/no-go gates), B (targeted TSA for EHR cooperation), C (rephased cutover); privacy posture (APP/OAIC) and Q&A for Daniel/the vendor. Due 3 hours from tasking.',
 '2025-09-08T02:15:00Z','in_progress',3),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','task',
 'Accelerated critical path (Lily)',
 'Landlord consents highest-risk-first, EHR mitigation path, minimum viable HR day-one readiness, SPA risk allocation including conditions tied to vendor cooperation. 2–3 options with risk/cost/timeline trade-offs for James.',
 '2025-09-08T04:00:00Z','in_progress',4),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','task',
 'Update trackers & prep client deck (Mia)',
 'CP tracker, consent tracker and meeting deck updated for the accelerated timetable; capture critical dependencies flagged by Aisha and Lily.',
 '2025-09-08T05:00:00Z','open',5),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','task',
 'Draft SPA conditions precedent — vendor cooperation & landlord consents',
 'CP drafting per the red-flag report: MediTrax cooperation/interim licence CP and landlord consent threshold CP (consents for at least 12 of 16 leased premises including the top 8 by revenue).',
 null,'open',6),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','fact',
 'Deal structure: share acquisition of Whitegum Medical Centres Pty Ltd',
 '18 medical centres across NSW and QLD; transitional services and operational integration; ~350 staff on mixed hiring models; 16 leased premises; 6 TSAs (IT, payroll, AP, call centre, marketing, compliance).',
 null,'open',7),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','fact',
 'MediTrax has invoked the change-of-control clause',
 'Notice received 8 Sep 2025. Threats: read-only portal/API at completion; staggered bulk extracts misaligned with the planned cutover weekend; assistance withheld unless DPIA/TPRM posture and APP compliance are demonstrated.',
 null,'open',8),
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','fact',
 'Client drivers for acceleration',
 'Ticking fee escalation; rival interest before next board cycle; integration plan needs half the centres onboarded pre-year-end; debt terms tied to quarter-end closing; seller IT platform end of life (short TSAs preferred).',
 null,'open',9);

-- ============================================================================
-- Done. Next: import seed/clauses_import.csv via /clauses → Import CSV, and
-- upload the documents/ files to the Library / project.
-- ============================================================================
