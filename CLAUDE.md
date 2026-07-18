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
| **Jade** | jade.io (BarNet) — sole AU legal source: citation validation + judgment fetch. Requires BarNet's written permission for automated access |
| **AustLII** | Australasian Legal Information Institute — **REMOVED** from this project (blocks bots; AUP prohibits automated/AI use). Do not reintroduce |
| **auslaw-mcp** | Third-party MCP wrapper for AustLII — NOT used |
| **AGLC4** | Australian Guide to Legal Citation, 4th edition — citation format standard |
| **MNC** | Medium Neutral Citation — e.g. [2024] HCA 5 |
| **R2** | Cloudflare R2 — S3-compatible object storage for uploaded documents |
| **SSR** | Server-Side Rendering (Next.js) |
| **RLS** | Row Level Security (Supabase/Postgres) |
| **query_costs** | Supabase table recording token usage and AUD cost of every LLM call |
| **StreamChatResult** | Backend type carrying fullText + inputTokens + outputTokens + model |
| **cost badge** | Small AUD cost label shown under each assistant response |

## Legal Research Architecture (Jade-only)
- **Module**: `backend/src/lib/jade.ts` · tools `backend/src/lib/legalSourcesTools/jadeTools.ts` · route `backend/src/routes/jade.ts` (mounted at `/jade`)
- **Citation validation** (`validateJadeCitation`): HEAD check against `jade.io/mnc/{year}/{court}/{num}`
- **Case / legislation search**: returns a Jade.io search link (no authorised machine-search interface without BarNet permission)
- **Document fetch** (`fetchJadeDocument`): `jade.io/content/ext/mnc/...` (may return SPA shell)
- **Tools**: `jade_search_cases`, `jade_search_legislation`, `jade_validate_citation`, `jade_fetch_document`, `jade_format_citation`
- **⚠️ Permission**: automated Jade.io access requires BarNet's prior written permission — gated for research/education use. AustLII removed entirely.
- **No auslaw-mcp**

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

## Preferences
- Concise and direct responses
- No unnecessary explanation or verbosity
- Australian law context throughout
