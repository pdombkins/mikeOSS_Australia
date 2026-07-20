-- Migration date: 2026-07-21
-- P2 notification service (C030 agent completion, C032 tabular completion/share/export,
-- C018 regulatory digests). In-app always; email optional via Resend (env-gated).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,            -- agent_run | tabular_review | regwatch | system
  title text not null,
  body text,
  link text,                     -- in-app path, e.g. /agents/<id>
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(user_id) where read_at is null;

-- Per-user email opt-in (default off).
alter table public.user_profiles
  add column if not exists email_notifications boolean not null default false;

-- RLS default-deny; backend service role bypasses (matches existing pattern).
alter table public.notifications enable row level security;
