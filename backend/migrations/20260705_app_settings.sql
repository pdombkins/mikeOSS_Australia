-- Migration date: 2026-07-05

-- App-wide key/value settings managed by admins (single shared instance config).
-- First use: jade_access_approved — whether the operator has obtained Jade.io's
-- written permission to access their platform via this tool. Governs which
-- citation-verification source chain is used.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- The backend reads/writes these via the service role (bypasses RLS).
-- Lock the table down for anon/authenticated clients.
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Default: no Jade.io approval → tool uses AustLII human verification only.
insert into public.app_settings (key, value)
values ('jade_access_approved', 'false'::jsonb)
on conflict (key) do nothing;
