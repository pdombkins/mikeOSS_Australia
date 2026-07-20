-- Migration date: 2026-07-21
-- C033 org/personal context + C007 personal access tokens for the Mike MCP server.
-- (org_context app-level record lives in the existing app_settings table;
--  cohort for C004 was added in 20260721_03_audit_rbac.sql.)

alter table public.user_profiles
  add column if not exists personal_context text;

create table if not exists public.user_pats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  token_hash text not null unique,   -- sha256 hex of the token; plaintext never stored
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_pats_user_idx on public.user_pats(user_id);
alter table public.user_pats enable row level security;
