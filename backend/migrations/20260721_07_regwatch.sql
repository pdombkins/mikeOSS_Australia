-- Migration date: 2026-07-21
-- C018 — Regulatory monitoring. Official government RSS/Atom feeds ONLY
-- (legislation.gov.au, regulator media feeds, legislation.govt.nz).
-- No AustLII; no scraping of restricted sources.

create table if not exists public.regulatory_watches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  topics text[] not null default '{}',       -- keywords the LLM filters against
  jurisdictions text[] not null default '{}',-- e.g. {Cth, NSW, VIC, NZ}
  sources text[] not null default '{}',      -- source ids from the curated list
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists regulatory_watches_owner_idx
  on public.regulatory_watches(owner_id);

create table if not exists public.regulatory_events (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.regulatory_watches(id) on delete cascade,
  source text not null,
  title text not null,
  url text not null,
  summary text,
  relevance text,                            -- LLM one-liner: why it matched
  published_at timestamptz,
  status text not null default 'new' check (status in ('new','seen')),
  created_at timestamptz not null default now(),
  unique (watch_id, url)
);
create index if not exists regulatory_events_watch_idx
  on public.regulatory_events(watch_id, created_at desc);

alter table public.regulatory_watches enable row level security;
alter table public.regulatory_events  enable row level security;
