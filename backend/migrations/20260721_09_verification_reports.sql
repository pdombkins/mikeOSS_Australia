-- Migration date: 2026-07-21
-- C024 — Deep-verify: assertion-level citation checking with human
-- self-validation when Jade content access is off (Peter, decision 6).

create table if not exists public.verification_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid,
  source_kind text not null default 'text',   -- text | chat_message | agent_run
  source_ref text,
  source_excerpt text,                        -- first ~2000 chars of verified text
  status text not null default 'in_progress'  -- in_progress | complete
    check (status in ('in_progress','complete')),
  created_at timestamptz not null default now()
);
create index if not exists verification_reports_owner_idx
  on public.verification_reports(owner_id, created_at desc);

create table if not exists public.verification_assertions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.verification_reports(id) on delete cascade,
  position int not null,
  assertion text not null,
  citation text not null,             -- as written, e.g. [2024] HCA 5
  citation_valid boolean,             -- Jade existence check result (null = unchecked)
  verdict text                        -- supported | partially_supported | not_supported
    check (verdict in ('supported','partially_supported','not_supported',
                       'misattributed','not_content_verified') or verdict is null),
  verifier text not null default 'none'
    check (verifier in ('ai','human','none')),
  supporting_passage text,            -- quoted passage (AI) or pinpoint/note (human)
  note text,
  jade_url text,                      -- outbound Jade search/case link
  austlii_url text,                   -- outbound AustLII SEARCH link — user-clicked only;
                                      -- Mike never fetches AustLII content
  verified_by uuid,
  verified_at timestamptz
);
create index if not exists verification_assertions_report_idx
  on public.verification_assertions(report_id, position);

alter table public.verification_reports    enable row level security;
alter table public.verification_assertions enable row level security;
