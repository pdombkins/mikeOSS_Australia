# Design: Competitor-Scan Feature Build (19 × C-features) + Kimi K3 Provider

**Date:** 2026-07-20 · **Status:** v3 — BUILT 2026-07-20 (all 19 features + Kimi K3 provider; see CLAUDE.md "2026-07-20 build" for migrations, env vars and known deferrals)
**Scope:** C030 C013 C014 C022 C024 C018 C031 C032 C025 C015 C002 C033 C026 C007 C036 C004 C019 C011 C040 + Kimi K3 (new LLM provider)
**Constraints honoured:** Jade-only AU case law (BarNet permission gate), no AustLII, AGPL-3.0, research/education only, AGLC4, AUD cost tracking.

---

## 1. Design philosophy

The 19 features are not 19 independent builds. They collapse into **four new platform primitives** plus **six feature clusters** that reuse them. Everything rides on the existing chat engine (`backend/src/lib/chat/` — streaming.ts loop + toolDispatcher), Supabase, and the SSE event protocol.

```
                    ┌─────────────────────────────────────────────┐
                    │  Feature clusters                           │
                    │  A Agentic workflows   (C013 C014 C030)     │
                    │  B Drafting & research (C022 C024 C018)     │
                    │  C Tabular review v2   (C015 C025 C031 C032)│
                    │  D Knowledge layer     (C002 C026 C033 C036)│
                    │  E Admin & analytics   (C004 C019)          │
                    │  F Outputs & interop   (C040 C007)          │
                    └───────┬──────────┬──────────┬──────────┬────┘
                            │          │          │          │
      ┌──────────────┐ ┌────┴─────┐ ┌──┴───────┐ ┌┴─────────────┐
      │ P1 Agent     │ │ P2 Notif.│ │ P3 Audit │ │ P4 Model     │
      │ runtime      │ │ service  │ │ trail    │ │ registry     │
      │ (plans, sub- │ │ (in-app  │ │ (every   │ │ (data-driven,│
      │ agents, ∥)   │ │ + email) │ │ action)  │ │ + Kimi K3)   │
      └──────────────┘ └──────────┘ └──────────┘ └──────────────┘
              existing: chat engine · tools · KB/pgvector · playbooks ·
              tabular · workflows(skill_md) · projects · query_costs · Jade gate
```

---

## 2. Platform primitives (build first)

### P1 — Agent runtime `backend/src/lib/agents/` (serves C013, C014, C030, C022, C002, C018)

The single biggest piece. A general plan→approve→execute engine; every "agent" feature is a configuration of it, not a new engine.

**Data model** (migration `20260721_01_agent_runtime.sql`):

```
agent_runs
  id uuid PK · owner_id · project_id nullable (matter scoping, P3)
  kind text            -- 'assistant' | 'workflow' | 'draft_from_precedent'
                       -- | 'playbook_builder' | 'verify' | 'regulatory_scan'
  status text          -- planning | awaiting_approval | running | paused
                       -- | completed | failed | cancelled
  title · request text -- the user's natural-language instruction
  plan jsonb           -- typed plan (below)
  result jsonb         -- final outputs (doc ids, report, citations)
  model text · created_at · started_at · finished_at

agent_steps
  id · run_id FK · position int · depends_on int[]   -- DAG, enables parallelism
  role text            -- 'intake' | 'research' | 'drafting' | 'review' | 'verify'
  instruction text · tool_allowlist text[]
  status text          -- pending | running | completed | failed | skipped
  output jsonb · input_tokens · output_tokens · cost_aud
```

**Planner:** one LLM call (main-tier model) with a strict JSON schema → list of steps, each with `role`, `instruction`, `depends_on`, `tool_allowlist`. Plan is persisted and emitted as SSE `{type:"agent_plan", run_id, steps[]}`.

**Approval gate (C030):** runs with >1 step or any write-tool (`generate_docx`, `edit_document`, playbook CRUD) start in `awaiting_approval`. Frontend renders the plan as an editable checklist (reuses `ask_inputs` interaction pattern); user can edit step instructions, remove steps, then Approve → `running`. Single-step read-only runs auto-approve (config flag `agents.auto_approve_simple`).

**Executor (C013):** each step = one invocation of the *existing* chat engine (`streaming.ts`) with:
- a **role prompt** (specialist system prompts in `agents/rolePrompts.ts` — intake, research, drafting, review, verify — all AU/AGLC4-flavoured, composed with existing `prompts.ts`),
- a **scoped toolset** — `toolSchemas.ts` filtered by `tool_allowlist` (research steps get jade/KB/search tools only; drafting steps get generate/edit tools; nothing gets tools outside its role). This is the aOS "guardrails + tool routing" idea implemented with what we already have.
- **shared run memory:** step outputs are appended to a run-scoped context object (`agents/runContext.ts`) that later steps receive in their prompt (bounded, summarised over ~8k tokens by the low-tier model).

**Parallelism (C030):** steps whose `depends_on` are all complete run concurrently (`Promise.allSettled`, cap 3 concurrent). SSE per step: `agent_step_start` / `agent_step_delta` / `agent_step_done`. Runs are DB-backed, so they survive page nav; on completion → P2 notification ("Results ready for review").

**Cost:** every step's usage → `query_costs` (source `agent_step`, run id in metadata) — the cost badge and admin analytics get agent runs for free.

**API:** `POST /agents` (create+plan) · `GET /agents` `GET /agents/:id` (poll/stream) · `POST /agents/:id/approve` (with edited plan) · `POST /agents/:id/cancel` · SSE `GET /agents/:id/events`.

**Frontend:** new `/agents` page (run list + run detail with live step DAG); "Run as agent" entry points from Assistant (a toggle next to Send) and from Workflows.

### P2 — Notification service (serves C030, C032, C018)

Migration `20260721_02_notifications.sql`: `notifications (id, user_id, kind, title, body, link, read_at, created_at)` + `lib/notifications.ts` (`notify(userId, …)`).
- **In-app always:** bell icon in the top nav, unread count, SSE push on the existing event channel.
- **Email optional:** env-gated `RESEND_API_KEY` (Resend free tier suits an educational deployment); if unset, silently in-app-only. Per-user opt-in in Account → Features.
- Emitters: agent run finished/failed (C030), tabular review generate complete / shared / exported (C032), regulatory digest (C018).

### P3 — Audit trail & role-based access control (C019)

Migration `20260721_03_audit_rbac.sql`: `audit_events (id, actor_id, project_id, event_type, resource_type, resource_id, tool_name, detail jsonb, created_at)` (append-only; no UPDATE/DELETE grants).
- **Capture points:** one `recordAudit()` helper called from (a) `toolDispatcher` — every tool call incl. MCP, args digest not full args; (b) document read/download routes; (c) agent step start/finish; (d) share/export/membership-change endpoints. ~10 call sites.
- **Full role-based ACLs (per Peter, decision 5).** Two levels:
  - *Org roles* (`user_profiles.org_role`): `admin` | `supervisor` | `member`. Admin = existing admin surface + RBAC management; supervisor = read access to audit/analytics but not user management; member = default.
  - *Project (matter) roles* (`project_members (project_id, user_id, role, added_by, created_at)`): `owner` | `editor` | `reviewer` | `viewer` | (no row = **no access**). Deny-by-default membership *is* the ethical wall — cross-matter isolation falls out of the model rather than being bolted on. Existing `shared_with` jsonb on projects is migrated into `project_members` rows (backfill in the same migration) and retired.
  - *Capability matrix* (single source of truth `lib/rbac.ts`, enforced in `lib/access.ts` — every route/tool asks `can(user, action, resource)`):

    | Action | owner | editor | reviewer | viewer |
    |---|---|---|---|---|
    | view docs / chats / runs | ✓ | ✓ | ✓ | ✓ |
    | download / export | ✓ | ✓ | ✓ | — |
    | chat, run agents, tabular generate | ✓ | ✓ | ✓ | — |
    | edit/create docs, approve agent plans | ✓ | ✓ | — | — |
    | manage members, walls, delete project | ✓ | — | — | — |
- **Knowledge scoping:** `kb_chunks`/`kb_documents` and `clauses` gain `project_id nullable`; retrieval functions (`match_kb_chunks`, clause search) take the caller's accessible-project set — matter-scoped knowledge is never retrievable by non-members. Chat/agent runs inside a project retrieve project-scoped + global KB only.
- **UI:** per-project "Members & access" tab (role assignment, audit-logged); Admin → Audit (filter by user/project/tool/date, CSV export); Admin → Roles (org-role assignment).

### P4 — Data-driven model registry + Kimi K3 (C011 + new provider)

Refactor `lib/llm/models.ts` from hard-coded arrays to a registry:

```ts
type ModelDef = { id: string; provider: Provider; tier: "main"|"mid"|"low";
                 label: string; inputPerM: number; outputPerM: number;
                 contextK?: number; baseUrl?: string; notes?: string };
```

`pricing.ts` reads from the same registry (single source of truth; removes today's duplication). `providerForModel` reads the registry instead of prefix-sniffing.

**Kimi K3** (Moonshot AI, released 2026-07-16; weights promised open by ~2026-07-27) — **self-host preferred (per Peter, decision 4)**:
- New provider `"moonshot"` served by `lib/llm/openaiCompat.ts`: an OpenAI-compatible **chat-completions** streaming client parameterised by `baseUrl` + key, mapped to the same `StreamChatResult`/tool-call normalisation (our `openai.ts` uses the *Responses* API, so it stays untouched).
- **Endpoint resolution, self-host first:** if `KIMI_BASE_URL` is set (a vLLM/SGLang deployment serving K3 weights, e.g. `http://<host>:8000/v1`), Mike uses it and records **$0.00** in `query_costs` (optional `KIMI_INPUT_PRICE`/`KIMI_OUTPUT_PRICE` env overrides to attribute GPU cost later). If unset, fall back to Moonshot's hosted API `https://api.moonshot.ai/v1` (US$3/$15 per M) with an offshore-processing disclosure in settings. The model label in the selector shows "self-hosted" vs "Moonshot API" so users can see which path is live.
- **Practical note:** weights are not yet published (promised late July), and K3 is a 2.8T-param MoE — self-hosting needs a rented multi-GPU node or a future quantised/distilled release, not a laptop. The design is config-complete for self-hosting on day one of weight availability; the hosted API is the working fallback until then.
- Registry entries: `kimi-k3` (main tier, 1M context) — mid-tier reuse possible later.
- Keys: env `MOONSHOT_API_KEY` (hosted fallback only; self-host needs none) + new `moonshot` provider in `userApiKeys.ts` (migration `20260721_04_moonshot_api_key_provider.sql`) + Account → API keys UI row.
- Model selector (`account/models` + per-message picker) picks it up automatically once the registry drives the UI list (small `/user/models` endpoint change to serve the registry).

---

## 3. Feature clusters

### Cluster A — Agentic workflows (C013 ✅ via P1, C014, C030 ✅ via P1)

**C014 — Workflows orchestration layer.** Today workflows are `skill_md` prompt payloads applied to a single chat. Upgrade: a workflow may optionally carry a **plan template** (`workflow_metadata.plan_template jsonb` — steps with roles/tools, written in the same schema as `agent_steps`). Two paths to create one:
1. **NL compile:** "Describe your workflow" → planner LLM compiles instructions into a plan template the user can edit (same plan-editor UI as C030 approval).
2. Existing skill_md workflows keep working unchanged (single-step runs).

Running a plan-template workflow = instantiating an `agent_run` of kind `workflow` with variables bound (documents via `ask_inputs`, text inputs). Workflow sharing/open-source submission paths untouched.

### Cluster B — Drafting & research agents

**C022 — Draft-from-precedent agent.** New run kind `draft_from_precedent` with a fixed 4-step plan (no planner call needed):
1. *intake* — `ask_inputs`: pick precedent (Library `templates` kind or any uploaded doc) + matter details (parties, dates, governing state, key terms);
2. *analysis* — read precedent, extract structure/style/defined-terms skeleton (JSON);
3. *drafting* — generate tailored multi-page draft via `generate_docx`, pulling preferred clauses (C026) and playbook positions for the agreement type, org context (C033) injected;
4. *review* — self-review pass against the relevant playbook (`review_against_playbook`) + AU-law sanity list; output redline notes.
Entry point: Library → precedent row → "Draft from this precedent", and a system workflow card. Jade-only rules unaffected (no case-law fetching involved; any citations go through the verify tool).

**C024 — Verify (assertion-level citation checking).** Extends the existing verification chain (`lib/verification/`) from *citation exists* to *citation supports the assertion*:
- New module `lib/verification/assertionCheck.ts` + tool `verify_assertions` + run kind `verify`.
- Pipeline per response/draft: (1) low-tier LLM extracts `{assertion, citation}` pairs (MNCs, legislation refs); (2) each MNC → existing `validateJadeCitation` (existence); (3) **if the Jade access toggle is ON**, `fetchJadeDocument` → main-tier LLM judges *supported / partially supported / not supported / misattributed*, quoting the supporting passage; (4) if Jade access is OFF (default), degrade to **human self-validation** (below).
- **Self-validation workflow when Jade access is off (per Peter, decision 6):** each assertion in the report renders as an open item with (a) the assertion + citation, (b) a pre-built **AustLII search link** (plain outbound URL to AustLII's search page with the case name/MNC as query — the *user* clicks it in their own browser; Mike never fetches, scrapes, or parses AustLII, keeping the "no automated/AI access" rule intact), plus a Jade.io search link, and (c) a verdict control where the user records *supported / partially / not supported / misattributed* with an optional pinpoint/note. Human verdicts are stored in `verification_reports` with `verifier:'human'`, `verified_by`, `verified_at`, and render with a distinct "human-verified" chip (vs "AI-verified" when Jade content checking ran). A report is *complete* only when every assertion has a verdict — machine or human.
- Output: `verification_reports` table (per-assertion rows: verdict, verifier `ai|human|none`, passage/note, links) + a report panel UI (verdict chips, quoted passages, AGLC4-formatted citation via `jade_format_citation`). Button "Verify citations" on any assistant message and as a final step option in agent plans.
- This is the flagship teaching feature — students experience both machine verification and the professional obligation to check authorities themselves.

**C018 — Regulatory monitoring.** Modelled on the existing competitor-scan two-tier pattern, but as a first-class in-app feature:
- **Sources: official government feeds only** — Federal Register of Legislation (legislation.gov.au) RSS/Atom, AU regulator media/consultation feeds (ASIC, ACCC, OAIC, APRA, Fair Work), NZ legislation.govt.nz feed. No scraping of restricted sources; no AustLII; Jade not needed (this is legislation/regulator news, not case law).
- Migration: `regulatory_watches (id, owner_id, name, topics text[], jurisdictions text[], sources text[])` + `regulatory_events (id, watch_id, source, title, url, summary, published_at, status new|seen)`.
- **Scanner:** `backend/src/lib/regwatch/scan.ts` fetches feeds on a timer (node-cron, 6-hourly) + `POST /regwatch/scan` manual trigger; low-tier LLM filters/summarises items against watch topics; matches → `regulatory_events` + P2 digest notification (daily, deduped).
- **UI:** `/regwatch` page — watch CRUD, event feed with New/Seen, "Discuss in Assistant" (opens chat seeded with the item). Costs → `query_costs` (source `regwatch`).

### Cluster C — Tabular review v2 (C015, C025, C031, C032)

All in `routes/tabular.ts` + `components/tabular/` — no new engine.

**C015 — extraction depth.** Column defs gain `type` (`text | date | money | duration | boolean | risk`) and generation prompts request typed values + `{summary, value, flag, severity, source_quote, location}`. Risk columns render severity chips; typed values enable sorting/filtering in the grid. Migration extends the review `columns` jsonb (versioned, backward-compatible — untyped columns behave as today).

**C025 — Tabular Analysis (one question, many docs).** A creation shortcut, not a new object: "Ask across documents" modal → pick docs (or a whole project/Library folder) + one question → creates a review with a single question column and auto-runs generate. Lands on the same review grid. Also exposed as agent tool `tabular_ask` so agent research steps can fan a question across a document set and read results back via the existing `read_table_cells`.

**C031 — fixed column context file.** Column def gains `reference_document_id`. During `/generate`, the reference doc's text is extracted once, truncated/summarised to a budget, and prepended to that column's per-cell prompt ("Evaluate against this reference document …"). Natural pairing: reference = a playbook export or an AU standard form. UI: paperclip on the column header editor.

**C032 — inline cell edit + completion notifications.**
- `PATCH /tabular-review/:reviewId/cells/:docId/:colIndex` → sets `manual: true`, stores `ai_value` alongside for provenance; grid cells become click-to-edit in place (no modal), Esc/Enter semantics, "AI ↩ restore" affordance.
- On `/generate` completion (and on share/export): P2 notification (+ email if enabled).

### Cluster D — Knowledge layer (C002, C026, C033, C036)

**C026 — My Clauses.** Migration `clauses (id, owner_id, title, agreement_type, body, guidance, tags text[], source_document_id, embedding vector(1536), created_at)`.
- Tools: `save_clause` (also invoked from a "Save to My Clauses" text-selection action in DocPanel), `search_clauses` (pgvector, owner-scoped, same Gemini embedding path as KB — spend logged as `kb_embedding`).
- UI: Library → Clauses tab (list/search/edit).
- Consumers: drafting agent (C022) and `review_against_playbook` prompt gain "preferred clauses" context.

**C002 — Conversational Playbook builder.** Run kind `playbook_builder`: a chat-mode agent with new CRUD tools `create_playbook`, `upsert_playbook_rule`, `delete_playbook_rule` (thin wrappers over `lib/playbooks.ts`, all audit-logged). Flow: user describes positions or uploads a precedent → agent reads it, proposes rules (topic/preferred/fallback/dealbreaker/severity) → writes them with plan-approval before any write (C030 gate reused). Entry: Playbooks page → "Build with AI".

**C033 — Organisation Context.** Two records, both plain markdown:
- app-level: `app_settings` key `org_context` (admin-edited, Admin → Settings);
- per-user: `user_profiles.personal_context` (Account → Features).
`prompts.ts` gains one injection point: org+personal context appended (bounded ~1.5k tokens) to system prompts for drafting, `review_against_playbook`, redline/edit flows, and agent role prompts. Nothing else changes — every existing and new feature inherits it.

**C036 — Admin management for Playbooks & KB.** Admin → Knowledge page: all playbooks / KB documents / clauses across users (service-role queries), with owner, rule/chunk counts, last used (from audit events), delete/export. Read-mostly; one new admin route.

### Cluster E — Admin & analytics

**C004 — Command Center (adoption analytics).** `/admin/analytics` fed by two existing tables (`query_costs`, `audit_events`) — no new writes:
- KPIs: active users (7/30d), runs by feature (chat / agents / tabular / workflows / verify / regwatch), cost AUD by model & feature, tokens over time, top workflows/playbooks.
- **Benchmarking, reframed for an educational instance:** cohort comparison — admin tags users with a cohort (`user_profiles.cohort text`, e.g. class groups) and compares adoption/usage across cohorts. No external/peer data (we have one deployment; Harvey's cross-customer benchmarking is not replicable or appropriate).
- Implementation: 3–4 SQL aggregate endpoints in `routes/admin.ts` + a Recharts dashboard page.

**C019** — delivered by P3 (audit trail, walls, admin audit UI).

### Cluster F — Outputs & interop

**C040 — Flexible output downloads.** New `lib/exports.ts` + `POST /download/export`: take any assistant message / agent result / verification report → user picks **format** (DOCX · PDF · Markdown) and **citation style** (AGLC4 — via `jade_format_citation` on detected MNCs — or as-written). DOCX via the existing docx generation path; PDF via the existing convert pipeline; MD verbatim. UI: "Export…" menu on messages and run results, reusing the download-tokens flow.

**C007 — M365 Copilot/Cowork integration → adapted as the Mike MCP server.** Building a real Microsoft add-in is out of scope for an educational project (tenant registration, Partner Center). The equivalent capability — *use Mike's legal tools from an external agent host* — is delivered by exposing Mike **as** an MCP server:
- `backend/src/routes/mcpServer.ts` mounting Streamable-HTTP MCP at `/mcp-server`, authenticated by per-user PATs (`user_pats` table, hashed, revocable, Account → API keys UI).
- Exposed tools (read-mostly, allowlist): `search_knowledge`, `list_playbooks`, `review_against_playbook`, `search_clauses`, `jade_validate_citation`, `jade_format_citation`, `tabular_ask` (opt-in), `verify_assertions`.
- Works today from Claude/Cowork/Copilot Studio custom connectors (all speak MCP), all calls audit-logged (P3) and cost-tracked. Mike already ships an MCP *client* (`lib/mcp/`) — this adds the server side, and it's a genuinely good teaching artefact (students connect Mike to their own agent hosts).

---

## 4. Kimi K3 — summary of the provider build

| Item | Decision |
|---|---|
| Model | `kimi-k3` (Moonshot AI; 2.8T-param open-weight MoE, 1M context, released 2026-07-16) |
| Access | **Self-host preferred:** `KIMI_BASE_URL` → vLLM/SGLang OpenAI-compatible endpoint (day-one ready when weights land, promised ~2026-07-27; $0 cost recorded). Fallback: hosted `https://api.moonshot.ai/v1` |
| Client | New `lib/llm/openaiCompat.ts` (chat-completions streaming + tool calls; base-URL parameterised) — `openai.ts` (Responses API) untouched |
| Registry | `provider:"moonshot"`, tier main; pricing US$3.00 in / US$15.00 out per M → `query_costs`/AUD path unchanged |
| Keys | `MOONSHOT_API_KEY` env + `moonshot` user-key provider + settings UI row |
| Caveat | Hosted-fallback path discloses offshore processing in UI; selector labels show "self-hosted" vs "Moonshot API"; 2.8T MoE ⇒ self-host requires rented GPU node or future quantised release |

---

## 5. Cross-cutting coherence

- **One agent engine.** C013/C014/C030/C022/C002/C024/C018 are all run-kinds or consumers of P1 — no bespoke orchestrators.
- **One approval pattern.** C030's plan gate is reused for playbook-builder writes and workflow compilation; users learn it once.
- **One knowledge substrate.** KB chunks, clauses, playbooks, org context all feed prompts through `contextBuilders.ts`; embeddings all Gemini-1536; all spend in `query_costs`.
- **One event spine.** New SSE types (`agent_plan`, `agent_step_*`, `notification`) extend the existing protocol; the cost event and citations pipeline are untouched.
- **One audit stream** feeds both C019 (compliance view) and C004 (analytics) — write once, read twice.
- **Jade discipline preserved.** New research/verify features route exclusively through existing `jade.ts` + the admin permission gate; regulatory monitoring uses official government feeds only. AustLII appears solely as **outbound search links the human user clicks** in the C024 self-validation workflow — Mike never fetches, scrapes, or parses AustLII content, so the no-automated-access rule stands.
- **One access model.** RBAC (`lib/rbac.ts` capability matrix) is checked by routes, tools, KB retrieval, exports, and the MCP server alike — no feature carries its own ad-hoc sharing logic once `shared_with` is migrated to `project_members`.
- **Licensing.** All new code AGPL-3.0; Resend/node-cron/MCP SDK are permissively licensed.

## 6. Migrations (run in Supabase SQL editor, in order)

1. `20260721_01_agent_runtime.sql` (agent_runs, agent_steps)
2. `20260721_02_notifications.sql`
3. `20260721_03_audit_rbac.sql` (audit_events; org_role; project_members + shared_with backfill; kb/clauses project_id; scoped retrieval fns)
4. `20260721_04_moonshot_api_key_provider.sql`
5. `20260721_05_clauses.sql`
6. `20260721_06_tabular_v2.sql` (column type/reference doc, manual cells)
7. `20260721_07_regwatch.sql`
8. `20260721_08_org_context_cohort_pats.sql` (user_profiles.personal_context, cohort; user_pats)
9. `20260721_09_verification_reports.sql` (per-assertion rows incl. `verifier ai|human|none`, `verified_by`, `verified_at`, note, links)

## 7. Build order (dependency-driven)

| Phase | Contents | Why first |
|---|---|---|
| 1 | P4 registry + Kimi K3 · P2 notifications · P3 audit | Small, independent, everything later emits into them |
| 2 | P1 agent runtime + `/agents` UI (delivers C013, C030) | Core engine for phases 3–4 |
| 3 | Cluster C tabular v2 (C015 C025 C031 C032) · Cluster D (C026 C033 C002 C036) | Independent of each other; both feed drafting |
| 4 | Cluster B (C022 drafting, C024 verify, C018 regwatch) · C014 workflow compile | Consume agents + knowledge layer |
| 5 | Cluster E analytics (C004) · Cluster F (C040 exports, C007 MCP server) | Read from everything above |
| 6 | Register update: set the 19 features to `"built"` in `scripts/competitor-scan/register.json` · CLAUDE.md update · smoke tests | Close-out |

## 8. Decisions — resolved by Peter, 2026-07-20

1. **C007 as Mike-as-MCP-server** (not a real M365 add-in) — **approved**.
2. **C004 benchmarking as cohort comparison** (no cross-deployment peer data) — **approved**.
3. **Email notifications via Resend, env-gated, in-app default** — **approved**.
4. **Kimi K3: self-hosting preferred** — design amended: `KIMI_BASE_URL` self-host path is primary ($0 cost recorded, "self-hosted" label), Moonshot hosted API is fallback until weights are released/deployed (§2 P4, §4).
5. **Full role-based ACLs** — design amended: org roles (admin/supervisor/member) + project roles (owner/editor/reviewer/viewer, deny-by-default) with a capability matrix in `lib/rbac.ts`; `shared_with` migrated to `project_members` (§2 P3).
6. **C024 degradation confirmed, with human self-validation** — design amended: when Jade access is off, each assertion gets an outbound AustLII (+ Jade) search link the user opens themselves, then records a verdict stored as `verifier:'human'`; reports complete only when all assertions are adjudicated; Mike never fetches AustLII (§3 Cluster B).
