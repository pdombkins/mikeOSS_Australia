# Project: Mike (Australia)

## Overview
Australian fork of Mike OSS — an AI legal document assistant for Australian/NZ law.
**For research and educational purposes only** (university teaching project; not commercial, not legal advice).

## Repo
https://github.com/pdombkins/mikeOSS_Australia (branch: main)

## Stack
- **Frontend**: Next.js 16 with Turbopack, port 3000 (`npm run dev --prefix frontend`)
- **Backend**: Express + TypeScript via `tsx watch`, port 3001 (`npm run dev --prefix backend`)
- **Database**: Supabase (Postgres + Auth)
- **Storage**: Cloudflare R2 (S3-compatible)
- **LLMs**: Anthropic (Claude), Google (Gemini)

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/lib/jade.ts` | Jade.io integration — citation validation, judgment fetch, AGLC4 formatting (AustLII removed) |
| `backend/src/lib/legalSourcesTools/jadeTools.ts` | Jade tool schemas, system prompt, event types for LLM tool use |
| `backend/src/routes/jade.ts` | REST endpoints mounted at `/jade` |
| `backend/src/lib/pricing.ts` | Model price table (USD/MTok) + AUD exchange rate fetch |
| `backend/src/lib/chatTools.ts` | LLM stream runner; emits cost SSE event, persists to query_costs |
| `backend/src/lib/llm/claude.ts` | Anthropic streaming with token accumulation |
| `backend/src/lib/llm/gemini.ts` | Gemini streaming with per-iteration token accumulation |
| `backend/src/routes/admin.ts` | Admin API including GET /admin/costs |
| `frontend/src/app/(pages)/admin/page.tsx` | Admin UI with cost dashboard |
| `frontend/src/app/components/assistant/AssistantMessage.tsx` | Renders cost badge |
| `supabase/migrations/20240705_query_costs.sql` | query_costs table + RLS (already applied) |

## Environment
- `backend/.env` — API keys, Supabase URL/service key, R2 config (gitignored)
- `frontend/.env.local` — Supabase anon key, API base URL (gitignored)

## Australian Law Research Architecture (Jade-only)
AustLII was removed entirely (bot-blocked; AUP prohibits automated/AI use). Jade.io is the sole
AU legal source, and automated access requires BarNet's prior written permission (research/education gating).

### Citation Validation (`validateJadeCitation`)
- HEAD check against `jade.io/mnc/{year}/{court}/{num}`; valid if 200
- Result includes `jadeUrl` and `source: "jade"`

### Search (`searchJadeCases` / `searchJadeLegislation`)
- Returns a Jade.io search link (or direct MNC link if the query is a neutral citation)
- No authorised machine-search interface without BarNet permission

### Document Fetch (`fetchJadeDocument`)
- Only `jade.io` URLs permitted; parses `/mnc/...` or `/content/ext/mnc/...`
- `/content/ext/mnc/{year}/{court}/{num}` — may return SPA shell (known limitation)

## Cost Tracking (implemented 2025-07)
- Every LLM call emits a `cost` SSE event with token counts and AUD cost
- Stored in `query_costs` Supabase table with RLS
- AUD rate: daily cache from open.er-api.com, fallback 1.55
- Cost badge shown below each assistant response (dynamic precision: 4-6 decimal places)
- Admin page: KPI cards (total queries, USD, AUD, tokens) + line-item breakdown

## Known Issues / Backlog
1. **Jade.io permission** — automated access needs BarNet's written permission (see jade-permission-request.docx); gate before deploying
2. **Jade.io document fetch** — SPA-rendered; `/content/ext/` may return empty shell
3. **Open-source sources** — migrate to official/open sources per australian-legal-sources-map.md (OALC base + VIC/ACT/NT legislation + state courts)
4. **Cost tracking scope** — currently covers assistant chat; project chat, tabular reviews, workflows not yet covered
5. **Git lock** — dev servers hold `.git/index.lock`; run `rm -f .git/HEAD.lock .git/index.lock` before committing

## Completed Milestones
- Removed AustLII; refactored to Jade-only (jade.ts, jadeTools.ts, routes/jade.ts) + research/education notices
- Reviewed Jade/AustLII terms; drafted permission letters; mapped open AU legal sources
- Collaboration portal (invite-only, admin)
- SSR/hydration fixes
- Per-query AUD cost tracking + admin dashboard
- README: Australian fork description, cost config docs for forking developers
