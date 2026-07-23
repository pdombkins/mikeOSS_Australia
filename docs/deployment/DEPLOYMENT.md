# Deploying Mike (Australia) — Railway + Cloudflare

This is the runbook for putting Mike on the public internet so students can sign
up and reach it. The architecture:

- **Frontend** (Next.js) → **Cloudflare Workers** via OpenNext (`npm run deploy`).
- **Backend** (Express API) → **Railway** (nixpacks build, runs via `tsx`).
- **Supabase** (Auth + Postgres) and **Cloudflare R2** (storage) — already hosted, no change.

You do the account / login / dashboard / DNS steps (they need your credentials);
the repo is already prepared for the rest. Do the steps **in order** — there is a
deliberate back-and-forth because each service needs the other's URL.

Prepared in the repo already (no action needed):
- `backend/nixpacks.toml` — adds LibreOffice (for DOCX→PDF) and runs the API via `tsx`.
- `backend/package.json` — `start` now runs `tsx src/index.ts`; `tsx` moved to
  dependencies. (Production skips the TypeScript compile step, which otherwise
  fails on pre-existing type-only errors; `tsx` runs the same source directly.)
- `frontend/wrangler.jsonc` — the Cloudflare Workers config OpenNext needs.

---

## Prerequisites

- A **Railway** account (railway.app) and a **Cloudflare** account (you already
  have one — R2 lives there).
- The `wrangler` CLI is already a dev dependency; you'll run it via `npx`.
- Your working local secrets: everything in `backend/.env` and
  `frontend/.env.local`. You'll copy these into the hosts — you will **not**
  commit them.

---

## Part 1 — Backend on Railway

1. In Railway, **New Project → Deploy from GitHub repo** → pick `pdombkins/mikeOSS_Australia`.
2. **Set the root directory to `backend`** (Settings → Root Directory). Railway
   will detect `nixpacks.toml` and build from there.
3. **Variables** (Settings → Variables): copy every key/value from your local
   `backend/.env`, with these differences:
   - `NODE_ENV` = `production`
   - Leave `FRONTEND_URL` as a placeholder for now (e.g. `http://localhost:3000`);
     you'll set it in Part 3 once the frontend URL exists.
   - `PORT` — do **not** set it; Railway provides it and the app already reads it.
   - Optional self-reference vars (`API_PUBLIC_URL`, `BACKEND_URL`) — set these to
     the Railway URL once you have it (Part 3); only needed for the MCP server / callbacks.
4. Deploy. When it's green, open **Settings → Networking → Generate Domain** to get
   a public URL like `https://mike-backend-production.up.railway.app`.
5. Sanity check: visiting that URL in a browser should return a small JSON/health
   response (not an error page).

> **Why Railway and not a free tier that sleeps:** the backend runs scheduled jobs
> (Regwatch, budget and deadline sweeps, orphaned-run recovery). It needs to stay
> awake, so use a paid always-on service, not a sleeping free instance.

---

## Part 2 — Frontend on Cloudflare Workers

`NEXT_PUBLIC_*` values are **baked into the bundle at build time**, so they must be
present when you build — setting them in the Cloudflare dashboard afterwards does
nothing.

1. Create `frontend/.env.production` (gitignored) with the **production** values:
   ```
   NEXT_PUBLIC_API_BASE_URL=<your Railway backend URL from Part 1>
   NEXT_PUBLIC_SUPABASE_URL=<same as your local NEXT_PUBLIC_SUPABASE_URL>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<same anon key as local>
   NEXT_PUBLIC_WORKFLOW_CONTRIBUTIONS_ENABLED=false
   ```
2. From the `frontend/` directory, log in and deploy:
   ```bash
   cd frontend
   npx wrangler login          # opens a browser; authorise with your Cloudflare account
   npm run deploy              # runs opennextjs-cloudflare build + deploy
   ```
3. The deploy prints your Worker URL, e.g.
   `https://mike-australia.<your-subdomain>.workers.dev`. Note it.

> If `npm run deploy` complains about a missing Workers subdomain, set one once in
> the Cloudflare dashboard (Workers & Pages → your account → set up a `*.workers.dev`
> subdomain), then re-run.

---

## Part 3 — Wire the two URLs together

Now each side learns the other's address.

1. **Railway** → Variables → set `FRONTEND_URL` = your Cloudflare Worker URL
   (from Part 2). Optionally set `API_PUBLIC_URL` / `BACKEND_URL` = the Railway URL.
   Redeploy the backend. (`FRONTEND_URL` drives CORS **and** the redirect in invite
   emails, so this must be exact — no trailing slash.)
2. Confirm `frontend/.env.production`'s `NEXT_PUBLIC_API_BASE_URL` is the Railway
   URL (Part 2 step 1). If you deployed the frontend before you had the backend URL,
   fix it and run `npm run deploy` again.

> **Multiple origins:** `FRONTEND_URL` may be a **comma-separated list** of allowed
> browser origins, e.g. `https://mike-australia.<sub>.workers.dev,https://mikeoss.com`.
> The invite-email redirect uses the **first** entry, so put your primary front-end
> URL first. (CORS accepts any origin in the list; a trailing slash is ignored.)

---

## Part 4 — Supabase Auth URLs (required for sign-up & invites)

Sign-up confirmation and invite links only work if the destination is on Supabase's
allow-list. In the **Supabase dashboard → Authentication → URL Configuration**:

1. **Site URL** = your Cloudflare Worker URL.
2. **Redirect URLs** — add:
   - `<Worker URL>/login`
   - `<Worker URL>/**` (wildcard, so other post-auth redirects resolve)

Save. Without this, students clicking an invite or confirmation link get a redirect
error even though the email sent.

---

## Part 5 — Email (custom SMTP)

So invites and confirmations actually deliver (Supabase's built-in email is
rate-limited to a handful per hour — no good for a class):

1. In **Resend**: verify a sending domain, create an API key (`re_…`).
2. **Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   Host `smtp.resend.com` · Port `465` · Username `resend` · Password = the Resend
   API key · Sender `no-reply@<your-domain>` / "Mike (Australia)".
3. **Supabase → Authentication → Rate Limits** → raise the email limit above the
   default so a whole cohort can be invited at once.
4. Put the same `re_…` key into the backend's `RESEND_API_KEY` (Railway variable)
   so in-app notification emails send too — it's currently a placeholder.

---

## Part 6 — Verify end to end

1. Open the Worker URL. The app should load (not a localhost error).
2. Sign up a throwaway account → you should receive the confirmation email and be
   able to log in.
3. As admin, open a student group → **Email invites to N pending members** on one
   small test group, and confirm one invite arrives and its link lands on the login
   page (Part 4).
4. Log in as that invited user and confirm they see **only** their group's replica
   project.

Once that passes, invite the real cohorts.

---

## Part 7 — Later: custom domain (mikeoss.com)

Only after the `*.workers.dev` flow works end to end:

1. **Cloudflare → Workers & Pages → your Worker → Settings → Domains & Routes → Add
   custom domain** → `mikeoss.com` (Cloudflare manages the DNS record for you).
2. Update `FRONTEND_URL` (Railway) and the Supabase Site/Redirect URLs to
   `https://mikeoss.com`.
3. Make the backend CORS change to allow both origins (see Part 3 note), or switch
   fully to the custom domain.
4. Re-run the Part 6 checks.

---

## Environment variable reference

**Backend (Railway)** — copy from your local `backend/.env`; the ones that matter
for a public deploy:

| Variable | Value |
|---|---|
| `FRONTEND_URL` | Cloudflare Worker URL (Part 3) — drives CORS + invite redirect |
| `NODE_ENV` | `production` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | from Supabase (service-role key) |
| `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | from Cloudflare R2 |
| `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`), `GEMINI_API_KEY` | model providers |
| `DOWNLOAD_SIGNING_SECRET`, `USER_API_KEYS_ENCRYPTION_SECRET`, `MCP_CONNECTORS_ENCRYPTION_SECRET` | your existing random secrets |
| `RESEND_API_KEY`, `NOTIFICATIONS_FROM_EMAIL` | email (Part 5) |
| `PORT` | **do not set** — Railway provides it |

**Frontend (`frontend/.env.production`, build time)**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Railway backend URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/publishable key |
| `NEXT_PUBLIC_WORKFLOW_CONTRIBUTIONS_ENABLED` | `false` (optional) |

---

## Notes

- **Migrations:** the hosted Supabase already has the current schema (you've been
  applying migrations as we go). No migration step is needed at deploy time.
- **Data:** this deploys the frontend/backend against your **existing** Supabase and
  R2, so all current projects, groups and documents are live immediately.
- **Secrets stay out of git:** `.env`, `.env.local`, `.env.production` are for the
  host dashboards / your machine only.
