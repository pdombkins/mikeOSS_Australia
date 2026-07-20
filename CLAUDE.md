# Memory — Mike (Australia)

## Me
Peter Dombkins, Adjunct Associate Professor in Legal Transformation (UNSW). Building Mike (Australia) as a **research and educational** project for teaching law students about legal technology — not for commercial use.
Email: pdombkins@gmail.com
GitHub: pdombkins/mikeOSS_Australia

## Project
**Mike (Australia)** — Australian fork of Mike OSS. AI legal assistant for Australian/NZ law. **For research and educational purposes only** (not commercial; not legal advice).
- Repo: https://github.com/pdombkins/mikeOSS_Australia
- Website: mikeoss.com
- Stack: Next.js 16 (Turbopack) frontend · Express TypeScript backend (`tsx watch`) · Supabase (auth + Postgres) · Cloudflare R2

## Key Architecture
| Layer | Detail |
|-------|--------|
| Frontend port | 3000 |
| Backend port | 3001 |
| DB | Supabase (Postgres + Auth) |
| Storage | Cloudflare R2 |
| LLM providers | Anthropic (Claude), Google (Gemini) |

## Terms & Abbreviations
| Term | Meaning |
|------|---------|
| **Mike** | The platform (Mike OSS, Australian fork) |
| **Jade** | jade.io (BarNet) — primary AU legal source when admin-approved: citation validation + judgment fetch (AI content-check). Requires BarNet's written permission for automated access |
| **AustLII** | Australasian Legal Information Institute — **default fallback, human-validated only**, when Jade access is off or unapproved. Mike never scrapes or fetches AustLII automatically (AUP prohibits automated/AI use) — it only computes an outbound AustLII search link, which the user opens and checks themselves, then records their own verdict |
| **auslaw-mcp** | Third-party MCP wrapper for AustLII — NOT used (would require automated fetch, contrary to AustLII's AUP) |
| **AGLC4** | Australian Guide to Legal Citation, 4th edition — citation format standard |
| **MNC** | Medium Neutral Citation — e.g. [2024] HCA 5 |
| **R2** | Cloudflare R2 — S3-compatible object storage for uploaded documents |
| **SSR** | Server-Side Rendering (Next.js) |
| **RLS** | Row Level Security (Supabase/Postgres) |
| **query_costs** | Supabase table recording token usage and AUD cost of every LLM call |
| **StreamChatResult** | Backend type carrying fullText + inputTokens + outputTokens + model |
| **cost badge** | Small AUD cost label shown under each assistant response |

## Legal Research Architecture (Jade primary, AustLII human-validated fallback)
- **Module**: `backend/src/lib/jade.ts` · tools `backend/src/lib/legalSourcesTools/jadeTools.ts` · route `backend/src/routes/jade.ts` (mounted at `/jade`)
- **Citation validation** (`validateJadeCitation`): HEAD check against `jade.io/mnc/{year}/{court}/{num}`
- **Case / legislation search**: returns a Jade.io search link (no authorised machine-search interface without BarNet permission)
- **Document fetch** (`fetchJadeDocument`): `jade.io/content/ext/mnc/...` (may return SPA shell)
- **Tools**: `jade_search_cases`, `jade_search_legislation`, `jade_validate_citation`, `jade_fetch_document`, `jade_format_citation`
- **⚠️ Permission**: automated Jade.io (AI content-check) access requires BarNet's prior written permission, gated behind an admin toggle (`app_settings` Jade-access-approved flag) — for research/education use only
- **AustLII fallback (default when Jade access is off/unapproved)**: Mike computes an outbound AustLII **search link** only (`austliiSearchUrl()` in `backend/src/lib/verification/assertionCheck.ts`) — it is never fetched or scraped server-side. The human user opens it in their own browser, reviews the result, and records their own verdict via `PATCH /verify/:id/assertions/:assertionId`. This is the C024 Deep-verify human self-validation path; see `/verify` page
- **No auslaw-mcp** (would require automated AustLII fetch, contrary to its AUP)

## Cost Tracking
- Costs stored in `query_costs` Supabase table (run `supabase/migrations/20240705_query_costs.sql`)
- AUD rate fetched daily from open.er-api.com; fallback 1.55
- Model prices in `backend/src/lib/pricing.ts` (retail rates — update for enterprise plans)
- SSE event `{ type: "cost", model, inputTokens, outputTokens, costUsd, costAud }` emitted before `[DONE]`

## Dev Workflow
```bash
npm run dev --prefix backend   # port 3001
npm run dev --prefix frontend  # port 3000
```
- Git lock issue: dev servers hold `.git/index.lock` — run `rm -f .git/HEAD.lock .git/index.lock` from a free Terminal tab before committing
- SQL migrations: run manually in Supabase SQL Editor (sandbox has no internet)

## Fork Scan (feature discovery)
- Upstream: `willchen96/mike` (Mike OSS). Scanner: `scripts/fork-scan/scan.mjs` — runs in background on every launch via `Start Mike.command`; report auto-opens only when new items found
- Register: `scripts/fork-scan/register.json` (seen forks/commits, feature IDs F001…). Reports: `scripts/fork-scan/reports/latest.html` + `latest.md`. Log: `last-scan.log`
- First run = full baseline; later runs incremental (skips forks whose `pushed_at` is unchanged)
- No GitHub token by default (60 req/hr); optional token via `GITHUB_TOKEN` or `scripts/fork-scan/.token` (gitignored)
- **Adoption workflow**: when Peter says "Adopt F003…" → look up ID in `register.json` → fetch `https://github.com/{repo}/commit/{sha}.patch` → adapt into Mike (Australia) (respect Jade-only rules, AGPL-3.0) → set that feature's `status` to `"adopted"` in register
- Force full rescan: `node scripts/fork-scan/scan.mjs --reset`

## Adopted Fork Features (2026-07-19, branch `adopt-fork-features`)
- **F005/F004/F003/F002** (upstream catch-up): new `backend/src/lib/chat/` engine (streaming, prompts, toolDispatcher), Excel/PPT support, citation-quotes UI (document citations only), DocPanel, Library (`library_kind` on `documents`, `/library` route), review-panel polish
- **F211** (jmclark-lab): RAG knowledge base + playbooks. Embeddings = Gemini `gemini-embedding-001` @1536 dims (`backend/src/lib/llm/embeddings.ts`, GEMINI_API_KEY). KB ingests from Library: `POST /library/:documentId/index` (source='library'). Tools: `search_knowledge`, `list_playbooks`, `review_against_playbook` in `chat/tools/kbTools.ts`. Embedding spend → `query_costs` (source `kb_embedding`, estimated tokens)
- **CourtListener fully excluded** (was inherited from fork point; not exposed as tools or prompt). Jade/AustLII verification chain + admin toggle untouched
- **Excluded**: `user_profile_email` migration (schema.sql already has the column); CourtListener tools; case-citation (cluster_id) pipeline branch
- **Migrations to run** (Supabase SQL editor, in order): `20260625_01_workflow_metadata.sql`, `20260629_01_workflow_open_source_submissions.sql`, `20260703_02_project_practice.sql`, `20260704_01_chat_message_citations.sql`, `20260710_01_library_documents.sql`, `20260710_knowledge_base_and_playbooks.sql` (all in `backend/migrations/`)
- Old `chatTools.ts` / `legalSourcesTools/` removed — jade/verification tools now live in `backend/src/lib/chat/tools/`

## Competitor Scan (feature discovery)
- Tracks feature announcements from **Harvey** (harvey.ai), **Legora** (legora.com), **CoCounsel** (Thomson Reuters). Runs in parallel with the fork scan on launch via `Start Mike.command`
- Scanner: `scripts/competitor-scan/scan.mjs`. Register: `scripts/competitor-scan/register.json` (features `C001…`, grouped by capability, vendor tag). Reports: `scripts/competitor-scan/reports/latest.html` + `latest.md`. Log: `last-scan.log`
- **Two-tier**: (1) node script on every launch fetches vendor blog/release-note index pages, primes a silent baseline on first successful fetch, then flags net-new posts as `status:"new"` ("Needs triage"); (2) weekly Claude scheduled task `competitor-feature-refresh` (Mon 08:00) re-researches with web search, turns raw posts into grouped/summarised feature entries, ages old `new` flags to `seen`
- First run seeds ~29 curated baseline features (to-date). Report groups by capability (Agents & workflows, Drafting, Research & citations, Document review, Knowledge & playbooks, Voice/multimodal, Mobile/integrations, Analytics/admin, Platform/models); filter by New-only or vendor
- **Build workflow**: when Peter says "Design and build C005…" → look up the `C0xx` id in `register.json` → design + implement into Mike (Australia) respecting Jade-only/AGPL/AU rules → set that feature's `status` to `"built"` in register
- Force fresh baseline: overwrite register.json with an empty shell (scanCount 0) and re-run

## Preferences
- Concise and direct responses
- No unnecessary explanation or verbosity
- Australian law context throughout

## 2026-07-20 Build — 19 competitor features + Kimi K3 (design: docs/design/2026-07-20_c-features_kimi3_design.md)
**Built** C002 C004 C007 C011 C013 C014 C015 C018 C019 C022 C024 C025 C026 C030 C031 C032 C033 C036 C040 (register statuses set to `built`) + Moonshot/Kimi K3 provider.

### Platform primitives
- **Agent runtime (P1)** `backend/src/lib/agents/` (types/planner/rolePrompts/executor/events) + `routes/agents.ts` + `/agents` page. Plan → approval gate (C030) → DAG executor (≤3 parallel steps), each step = `runLLMStream` with role-scoped `toolAllowlist`. Run kinds: assistant, workflow, draft_from_precedent (fixed 3-step plan). Costs → `query_costs` source `agent_step`.
- **Notifications (P2)** `lib/notifications.ts` + `routes/notifications.ts` + `/notifications` page + sidebar badge. Email via `RESEND_API_KEY` (env-gated) + per-user opt-in (`user_profiles.email_notifications`, Account → Features).
- **Audit + RBAC (P3)** `lib/audit.ts` (`recordAudit` in toolDispatcher/routes), `lib/rbac.ts` (org roles admin/supervisor/member; project roles owner/editor/reviewer/viewer, deny-by-default = ethical wall). `project_members` (backfilled from `shared_with`; legacy fallback still honoured in `access.ts`). Members API: GET/PUT/DELETE `/projects/:id/members`. Admin → Audit page + CSV.
- **Model registry (P4)** `lib/llm/models.ts` now data-driven (`MODEL_REGISTRY`); `pricing.ts` reads it. **Kimi K3**: provider `moonshot` via `lib/llm/openaiCompat.ts` (chat-completions). Self-host preferred: `KIMI_BASE_URL` (vLLM/SGLang; $0 recorded; `KIMI_MODEL`/`KIMI_INPUT_PRICE`/`KIMI_OUTPUT_PRICE` overrides) → fallback hosted `api.moonshot.ai/v1` (`MOONSHOT_API_KEY` env or user key).

### Features
- **Verify (C024)** `lib/verification/assertionCheck.ts` + tool `verify_assertions` + `routes/verify.ts` + `/verify` page. Jade toggle ON → AI content-check; OFF → human self-validation with outbound Jade/AustLII **search links only** (Mike never fetches AustLII); report complete only when all assertions adjudicated.
- **Regwatch (C018)** `lib/regwatch/` (curated official RSS only: FRL, ASIC, ACCC, OAIC, APRA, FWO, NZ legislation) + `routes/regwatch.ts` + `/regwatch` page; 6-hourly timer in index.ts (`REGWATCH_DISABLED=1` to disable).
- **Tabular v2** typed columns (`type`: date/money/duration/boolean/risk) + per-column `reference_document_id` (C031) in generate pipeline; `PATCH /tabular-review/:id/cells/:doc/:col` manual edit w/ AI-value provenance + edit UI in TRSidePanel (C032); completion notifications; `POST /tabular-review/ask` + TabularAskModal + agent tool `tabular_ask` (C025, `lib/tabularAsk.ts`; doc→text via `lib/extractText.ts`).
- **Knowledge** `clauses` table + `lib/clauses.ts` + `/clauses` page + tools `save_clause`/`search_clauses` (C026); playbook-builder tools `create_playbook`/`upsert_playbook_rule`/`delete_playbook_rule` + Playbooks "Build with AI" → seeded agent run (C002); org context `app_settings.org_context` (admin UI) + `user_profiles.personal_context` (Account → Features), injected in `runLLMStream` (C033); Admin → Workspace knowledge (C036).
- **Admin analytics (C004)** `GET /admin/analytics` + `/admin/analytics` page (KPIs, cost by model/feature, tool usage, **cohort comparison** via `user_profiles.cohort`, `PATCH /admin/users/:id/cohort`).
- **Exports (C040)** `lib/exports.ts` + `POST /download/export` (DOCX/PDF/MD, optional AGLC4 LLM restyle) + Export UI on agent runs.
- **MCP server (C007)** `routes/mcpServer.ts` at `/mcp-server` (Streamable-HTTP JSON-RPC; tools: search_knowledge, list_playbooks, review_against_playbook, search_clauses, jade_validate_citation, jade_format_citation, verify_assertions). PATs: `routes/pats.ts` (`/pats`, sha256-hashed, shown once).
- **C014** `POST /workflows/:id/compile` (NL → plan_template) + `POST /workflows/:id/run` (→ agent run, approval-gated). **C011/Kimi** in ModelToggle/settings.

### Migrations to run (Supabase SQL editor, in order)
`20260721_01_agent_runtime.sql` · `20260721_02_notifications.sql` · `20260721_03_audit_rbac.sql` · `20260721_04_moonshot_api_key_provider.sql` · `20260721_05_clauses.sql` · `20260721_06_workflow_plan_template.sql` · `20260721_07_regwatch.sql` · `20260721_08_org_context_pats.sql` · `20260721_09_verification_reports.sql` (all in `backend/migrations/`)

### New env vars (all optional)
`KIMI_BASE_URL` `KIMI_MODEL` `KIMI_INPUT_PRICE` `KIMI_OUTPUT_PRICE` `MOONSHOT_API_KEY` · `RESEND_API_KEY` `NOTIFICATIONS_FROM_EMAIL` · `REGWATCH_DISABLED`

### Deferrals — all completed 2026-07-20
- ✅ AddColumnModal: "Value type" (C015) + "Reference document" (C031) selectors; saved on column config.
- ✅ "Verify citations" (ShieldCheck) button on assistant messages → creates a Deep-verify report and opens `/verify?report=…`.
- ✅ `ProjectMembersModal` (roles editor/reviewer/viewer, owner-managed, replaces PeopleModal for projects); PAT management section on Account → API Keys ("MCP access tokens", shown once, copy + revoke).
- ✅ Boot recovery: `recoverOrphanedRuns()` in executor, called 10s after startup — `running` runs resume (completed steps preserved, in-flight steps reset to pending).
