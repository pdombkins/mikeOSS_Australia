-- Migration date: 2026-07-23
-- Student / user groups: invite a cohort in one go and manage project access
-- as a group (teaching: one class = one group).
--
--   * user_groups          — admin-owned named groups.
--   * user_group_members   — email-based membership. `user_id` is null until a
--     user registers with that email ("match on signup"): access resolves by
--     email at check time, and user_id is backfilled opportunistically, so a
--     student added before they sign up gets access the moment they register.
--   * project_group_grants — one role per (project, group). Access checks
--     union these with direct project_members; direct membership wins when
--     both exist. Removing the grant (or the group) walls the whole cohort
--     off in one action, consistent with deny-by-default RBAC (P3/C019).

create table if not exists public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table public.user_groups enable row level security;

create table if not exists public.user_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.user_groups(id) on delete cascade,
  email text not null,               -- always stored lowercase
  user_id uuid,                      -- null until matched to a registered user
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
create index if not exists user_group_members_group_idx
  on public.user_group_members(group_id);
create index if not exists user_group_members_email_idx
  on public.user_group_members(email);
create index if not exists user_group_members_user_idx
  on public.user_group_members(user_id);
alter table public.user_group_members enable row level security;

create table if not exists public.project_group_grants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null references public.user_groups(id) on delete cascade,
  role text not null check (role in ('editor', 'reviewer', 'viewer')),
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, group_id)
);
create index if not exists project_group_grants_project_idx
  on public.project_group_grants(project_id);
create index if not exists project_group_grants_group_idx
  on public.project_group_grants(group_id);
alter table public.project_group_grants enable row level security;
