# Mike (Australia)

> ⚠️ **For research and educational purposes only.**
>
> Mike (Australia) is a university teaching and research project. It is **not** intended for commercial use, and it does **not** provide legal advice.
>
> Mike verifies Australian case citations through a pluggable set of sources. **By default it uses human-in-the-loop verification on AustLII**: your own browser opens an AustLII search in a new tab (ordinary, permitted end-use) and you record whether the citation checks out — Mike never fetches AustLII itself. Automated verification via **Jade.io** (BarNet) is **off by default**: Jade.io's [Acceptable Use Policy](https://ppp.jade.io/acceptable-use-policy) prohibits automated access without BarNet's prior written permission, so it must be enabled by an admin **only after** obtaining that permission. **Do not enable Jade.io access until you have BarNet's written permission.**

Mike is an Australian legal document assistant with a Next.js frontend, an Express backend, Supabase Auth/Postgres, and Cloudflare R2-compatible object storage.

This is the Australian fork of Mike OSS, configured specifically for Australian and New Zealand law. It formats citations per AGLC4 (Australian Guide to Legal Citation, 4th edition) and verifies them through swappable sources — human verification on AustLII by default, or automated verification via Jade.io once BarNet's permission is held and an admin enables it. See [Citation verification](#citation-verification-australian-law) below.

Website: [mikeoss.com](https://mikeoss.com)

## Contents

- `frontend/` - Next.js application
- `backend/` - Express API, Supabase access, document processing, and database schema
- `backend/schema.sql` - Supabase schema for fresh databases
- `backend/migrations/` - dated, incremental schema migrations; on an existing database, apply the files dated after the Mike version you deployed

## Prerequisites

- Node.js 20 or newer
- npm
- git
- A Supabase project
- A Cloudflare R2 bucket, MinIO bucket, or another S3-compatible bucket
- At least one supported model provider API key: Anthropic, Google Gemini, or OpenAI
- Optional: a CourtListener API token for case law lookup and citation verification
- LibreOffice installed locally if you need DOC/DOCX to PDF conversion

## Database Setup

For a new Supabase database, open the Supabase SQL editor and run:

```sql
-- copy and run the contents of:
-- backend/schema.sql
```

The schema file is for fresh deployments and already includes the latest database shape (including the `app_settings` table that stores the citation-verification setting). For an existing database, apply `backend/migrations/20260705_app_settings.sql` to add that table before using the citation-verification toggle.

For an existing database, do not run the full schema file over production data. Instead, apply the incremental files in `backend/migrations/`: run the migrations dated **after** the version of Mike you currently have deployed, in filename order. Each file is named `YYYYMMDD_<name>.sql` (the date is also recorded in a comment at the top of the file) and is written to be safe to re-run, so when unsure you can re-apply the most recent migrations without harm.

## Environment

Create local env files:

```bash
touch backend/.env
touch frontend/.env.local
```

Create `backend/.env`:

```bash
PORT=3001
FRONTEND_URL=http://localhost:3000
DOWNLOAD_SIGNING_SECRET=replace-with-a-random-32-byte-hex-string
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key

R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=mike

GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
RESEND_API_KEY=your-resend-key
USER_API_KEYS_ENCRYPTION_SECRET=your-long-random-secret

# Optional: enables CourtListener case law and citation tools.
COURTLISTENER_API_TOKEN=your-courtlistener-token

# Optional: use locally imported CourtListener bulk data for faster case reads.
COURTLISTENER_BULK_DATA_ENABLED=false
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

Supabase values come from the project dashboard. Use the project URL for `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, the service role key for the backend `SUPABASE_SECRET_KEY`, and the anon/public key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`. If your Supabase project shows multiple key formats, use the legacy JWT-style anon and service role keys expected by the Supabase client libraries.

Provider keys are only needed for the models, legal research, and email features you plan to use. Model provider keys and the CourtListener token can be configured in `backend/.env` for the whole instance, or per user in **Account > Models & API Keys**. If a provider key is present in `backend/.env`, that provider is available by default and the matching browser API key field is read-only.

## Citation verification (Australian law)

Before the assistant relies on an Australian or New Zealand case citation, it calls a `verify_citation` tool that routes to a configurable chain of verification sources. Two are built in:

- **AustLII (human, default).** Mike does **not** access AustLII programmatically. It shows a verification card with the citation and a "Search on AustLII" button; your browser opens the AustLII search in a new tab (ordinary permitted end-use), you confirm the citation yourself, and record **Verified** / **Not verified**. Only that outcome — never AustLII content — is passed back to the assistant, which then finalises its advice.
- **Jade.io (automated, opt-in).** When enabled, Mike verifies citations automatically against Jade.io, falling back to AustLII human verification only if Jade.io fails.

An admin controls which is used from **Admin → Legal research → citation verification**, via the setting *"Have you obtained approval from Jade.io to access their platform via this tool?"*:

- **No** (default) → AustLII human verification only, with no automated Jade.io access.
- **Yes** → Jade.io automated verification, with AustLII human verification as a fallback.

The setting is stored per instance in the `app_settings` table (`jade_access_approved`, defaulting to `false`). **Only set it to Yes after obtaining BarNet's written permission for automated Jade.io access.**

Verification sources are pluggable: a new source (e.g. another provider) is added by implementing a small `VerificationSource` in `backend/src/lib/verification/sources/` and adding its id to a chain in `backend/src/lib/verification/index.ts` — no other code changes required.

## CourtListener Integration

Mike can use CourtListener for US case law citation verification, case fetching, targeted opinion search, and case-law panels in assistant responses.

To enable live CourtListener access, set `COURTLISTENER_API_TOKEN` in `backend/.env` and restart the backend. Users can also add their own CourtListener token from **Account > Models & API Keys** when the instance does not provide one globally.

Fresh databases created from `backend/schema.sql` already include the CourtListener support tables. Existing deployments should apply the matching dated migration in `backend/migrations/` before enabling the feature.

Bulk data is optional. When `COURTLISTENER_BULK_DATA_ENABLED=true`, Mike first tries local Supabase/R2 data before falling back to CourtListener's API:

- citation metadata is read from `public.courtlistener_citation_index`
- case cluster metadata is read from `public.courtlistener_opinion_cluster_index`
- cached opinion JSON is read from the R2 prefix `courtlistener/opinions/by-cluster/{clusterId}/{opinionId}.json`

If you do not import bulk data, leave `COURTLISTENER_BULK_DATA_ENABLED=false`; live CourtListener tools still work with a valid token, subject to CourtListener rate limits.

## Install

Install each app package:

```bash
npm install --prefix backend
npm install --prefix frontend
```

## Run Locally

### Quick start (macOS)

A double-click launcher is included: **`Start Mike.command`** (in the repo root). Double-clicking it in Finder opens Terminal, starts the backend and frontend dev servers in two tabs (sourcing `nvm` so `npm` is available), waits a few seconds, and opens `http://localhost:3000` in your browser. It assumes the repo lives at `~/mike-OSS`. Close the Terminal tabs to stop the servers.

If macOS blocks it the first time, either right-click → **Open**, or make it executable once with `chmod +x "Start Mike.command"`.

### Manual start

Start the backend:

```bash
npm run dev --prefix backend
```

Start the main app:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:3000`.

## First Run

1. Sign up in the app.
2. If you did not set provider keys in `backend/.env`, open **Account > Models & API Keys** and add an Anthropic, Gemini, or OpenAI API key.
3. To use legal research tools, add a CourtListener token in `backend/.env` or **Account > Models & API Keys**.
4. Create or open a project and start chatting with documents.

## Troubleshooting

**Sign-up confirmation email never arrives.** Confirmation emails are sent by Supabase Auth, not by Mike. For local development, the simplest fix is to disable email confirmation in **Supabase > Authentication > Providers > Email**. For production, configure custom SMTP in Supabase; the built-in mailer is heavily rate-limited and may be restricted on newer projects.

**The model picker shows a missing-key warning.** Add a key for that provider in **Account > Models & API Keys**, or configure the provider key in `backend/.env` and restart the backend.

**CourtListener tools say the API token is missing.** Set `COURTLISTENER_API_TOKEN` in `backend/.env`, or add a CourtListener token in **Account > Models & API Keys** for the signed-in user. Restart the backend after changing `.env`.

**CourtListener bulk lookup is not returning local results.** Confirm `COURTLISTENER_BULK_DATA_ENABLED=true`, the two CourtListener tables have been populated, and opinion JSON exists in R2 under `courtlistener/opinions/by-cluster/`. If bulk data is unavailable, Mike falls back to the live API when a token is configured.

**DOC or DOCX conversion fails.** Install LibreOffice locally and restart the backend so document conversion commands are available on the process path.

## Cost Tracking

Mike records the token usage and AUD cost of every LLM query and displays a cost badge under each assistant response. Costs are stored in the `query_costs` Supabase table and summarised on the Admin page.

### Pricing configuration

`backend/src/lib/pricing.ts` contains a `MODEL_PRICES` table with the **publicly listed retail rates** for each supported model. If you are on an enterprise plan, a committed-use discount, or any negotiated rate that differs from retail, update the `inputPerMToken` and `outputPerMToken` values for each model to match your actual contracted price before deploying:

```typescript
// backend/src/lib/pricing.ts
const MODEL_PRICES: Record<string, ModelPrice> = {
    "claude-sonnet-4-6": { inputPerMToken: 3.00, outputPerMToken: 15.00 },
    // …
};
```

Prices are in **USD per million tokens**. Check your provider billing dashboard or contract for the exact figures.

### Currency

Cost badges and the Admin dashboard show costs in AUD. The conversion rate is fetched once per day from `open.er-api.com/v6/latest/USD` and cached in memory; the fallback rate is 1.55. To display a different currency, update `getAudRate()` in `backend/src/lib/pricing.ts` — change the fetch URL to your currency pair and rename the `costAud` / `aud_rate` fields as needed throughout the codebase.

### Running the migration

The `query_costs` table is created by `supabase/migrations/20240705_query_costs.sql`. Run it in the Supabase SQL Editor for your project (or apply it via the Supabase CLI) before starting the backend for the first time. For existing deployments, this is an additive migration that is safe to apply at any time.

## Useful Checks

```bash
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```
