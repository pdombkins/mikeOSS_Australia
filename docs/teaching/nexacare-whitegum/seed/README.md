# Seed package — NexaCare/Whitegum case study

> **Status: INSTALLED (hybrid strategy) on this instance, 23 Jul 2026.** Owner: pdombkins@gmail.com. Project shared as *editor* with rosevalentinemorgan@gmail.com and tim.desousa@gmail.com. All 5 documents are in the Library **and** the project, and all 5 are indexed into the knowledge base. Note: `POST /library/:documentId/index` had two bugs (read `req.userId` instead of `res.locals.userId`; selected the dropped `documents.filename` column) and no docx support — fixed in `backend/src/routes/library.ts` as part of this install (docx/pptx/xlsx now route through `extractDocumentMarkdown`). The steps below remain for fresh installs.

Loads the fictional Kendry & Slate / NexaCare / Whitegum matter into Mike (Australia) so students start with a populated workspace. Educational use only.

## Install (per workspace)

1. **Pick the owner account.** Get the Supabase auth user id (uuid) of the account that will own the seeded content. In the Supabase SQL editor: `select id, email from auth.users;`
2. **Edit `nexacare_seed.sql`**: find-and-replace `00000000-0000-0000-0000-000000000000` with that uuid (23 occurrences).
3. **Run `nexacare_seed.sql`** in the Supabase SQL editor. Idempotent for the fixed-id rows (project, playbooks, workflows); list items, playbook rules and watches will duplicate if run twice — delete and re-run rather than re-running blindly.
4. **Import the clauses** in the app: go to `/clauses` → Import CSV → `clauses_import.csv`. Do this through the UI, not SQL — the import endpoint generates the embeddings that make `search_clauses` work. Requires a Gemini API key configured (embeddings).
5. **Upload the documents** in `../documents/` to the Library (and index the MSA extract into the knowledge base via Library → Index if you want `search_knowledge` to find it), then add them to the "NexaCare — Whitegum Acquisition" project.
6. Optional: add each student to the project via project members with an appropriate role (editor/reviewer/viewer) to demonstrate RBAC and ethical walls.

## Class-account strategies

- **Shared demo account**: seed once; students share. Simplest, but agent runs and lists collide.
- **Per-student**: re-run the seed with each student's uuid (playbooks/workflows/watches are owner-scoped; use fresh uuids for the fixed-id rows — or simply strip the fixed `id` values so each run generates new ones and adjust the `list_items`/`playbook_rules` references accordingly).
- **Hybrid (recommended)**: seed playbooks/workflows/clauses to an instructor account and share the project with students as editors; students create their own tabular reviews and agent runs inside it.

## What students should verify (deliberately unseeded)

The seed **never asserts** the current state of: NSW/QLD statutory overlays on lessor consent (note the 2023 QLD property law reforms), Fair Work transfer-of-business provisions, or Privacy Act NDB citations. Playbook notes and clause guidance flag these as "verify before advising" — that is the exercise.
