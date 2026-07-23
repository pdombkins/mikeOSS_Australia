# Tasks

## Active
<!-- Add current tasks here -->

## Backlog
- [ ] Obtain BarNet/Jade.io written permission for automated access (see jade-permission-request.docx) before enabling Jade tools in any deployment
- [ ] Build open-source AU legal sources per australian-legal-sources-map.md (Open Australian Legal Corpus base; add VIC/ACT/NT legislation + state courts)
- [ ] Add Jade.io full-text document fetch — current implementation may return SPA shell; investigate `/content/ext/mnc/` endpoint reliability
- [ ] Extend cost tracking to project chat, tabular reviews, and workflows (currently assistant chat only)

## Completed
- [x] Remove AustLII entirely; refactor to Jade-only (backend/src/lib/jade.ts, jadeTools.ts, routes/jade.ts); add research/education notices (sidebar + README)
- [x] Review Jade.io & AustLII terms of use; draft permission letters (jade-permission-request.docx, austlii-permission-request.docx)
- [x] Map official open AU legal sources (australian-legal-sources-map.md)
- [x] Research and compile Mike OSS installation guide
- [x] Implement AU legal integration (later refactored to Jade-only)
- [x] Build secure collaboration portal (invite-only access, admin portal)
- [x] Fix SSR/client hydration mismatches
- [x] Implement per-query cost tracking and AUD display (query_costs table, cost badge, admin dashboard)
- [x] Add Australian version description and cost tracking docs to README
- [x] Make Jade.io primary for citation validation (parallel check, Jade-first); add legislation search 403 fallback
- [x] Run and pass live AustLII/Jade integration tests (35/50 pass, 0 fail)
