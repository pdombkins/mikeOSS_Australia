# Dev Workflow — Mike (Australia)

## Running Locally
```bash
npm run dev --prefix backend    # Express API on :3001
npm run dev --prefix frontend   # Next.js on :3000
```

## Git Commits
Dev servers hold `.git/index.lock`. Before committing:
```bash
rm -f .git/HEAD.lock .git/index.lock
git add <files>
git commit -m "..."
git push
```

## SQL Migrations
The sandbox/VM has no internet access. Always run SQL migrations manually:
1. Copy migration SQL from `supabase/migrations/`
2. Paste into Supabase SQL Editor for the project
3. Run — confirm "Success. No rows returned"

## Build Checks
```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## Integration Tests
The old `test-austlii-jade.mjs` script was removed with AustLII. Jade.io is now the sole
AU legal source (`backend/src/lib/jade.ts`). Any new test script should:
- exercise `validateJadeCitation` (HEAD on `jade.io/mnc/...`) and `fetchJadeDocument`
- respect that automated Jade.io access requires BarNet's written permission (research/education gating)

## Environment Files
- `backend/.env` — never committed (in .gitignore)
- `frontend/.env.local` — never committed (in .gitignore)
- `.env.example` files committed as templates

## Key Gotchas
- AustLII has been removed (bot-blocked; AUP prohibits automated/AI use). Jade.io is the sole AU legal source — do not reintroduce AustLII
- Jade.io automated access requires BarNet's prior written permission (project is research/education only)
- Gemini token counts: `usageMetadata.promptTokenCount` / `candidatesTokenCount` (cumulative per API call, must use per-iteration accumulators)
- Supabase fire-and-forget pattern: `void (async () => { await db.from(...).insert(...) })()`
- Next.js 16 SSR: avoid reading browser globals (localStorage, window) in server components
