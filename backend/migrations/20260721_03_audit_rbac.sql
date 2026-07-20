-- Migration date: 2026-07-21
-- P3 — Audit trail + full role-based ACLs (C019).
--   * audit_events: append-only record of tool calls, document access,
--     agent actions, shares/exports and membership changes.
--   * Org roles: user_profiles.org_role (admin | supervisor | member).
--     is_admin stays authoritative for the admin surface; org_role adds the
--     supervisor tier (read access to audit/analytics).
--   * Project (matter) roles: project_members (owner | editor | reviewer |
--     viewer). No row = no access (deny-by-default = ethical wall).
--     Existing projects.shared_with emails are backfilled as editors;
--     shared_with is retained read-only for transition but is no longer
--     authoritative.
--   * Knowledge scoping: kb_documents/kb_chunks gain project_id so
--     matter-scoped knowledge never leaks across matters.

-- ============ Audit events ============
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  project_id uuid,
  event_type text not null,      -- tool_call | doc_read | doc_download | doc_edit
                                 -- | agent_step | share | export | member_change | login
  resource_type text,            -- document | chat | agent_run | tabular_review | playbook | kb | clause
  resource_id text,
  tool_name text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_actor_idx
  on public.audit_events(actor_id, created_at desc);
create index if not exists audit_events_project_idx
  on public.audit_events(project_id, created_at desc);
create index if not exists audit_events_type_idx
  on public.audit_events(event_type, created_at desc);

-- Append-only: revoke UPDATE/DELETE from every non-service role.
revoke update, delete on public.audit_events from anon, authenticated;
alter table public.audit_events enable row level security;

-- ============ Org roles ============
alter table public.user_profiles
  add column if not exists org_role text not null default 'member'
  check (org_role in ('admin', 'supervisor', 'member'));

-- Existing admins become org admins.
update public.user_profiles set org_role = 'admin' where is_admin = true;

-- Cohort tag for C004 adoption analytics (cohort comparison).
alter table public.user_profiles
  add column if not exists cohort text;

-- ============ Project (matter) roles ============
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'reviewer', 'viewer')),
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists project_members_user_idx on public.project_members(user_id);
create index if not exists project_members_project_idx on public.project_members(project_id);
alter table public.project_members enable row level security;

-- Backfill 1: project owners.
insert into public.project_members (project_id, user_id, role, added_by)
select p.id, p.user_id, 'owner', p.user_id
from public.projects p
on conflict (project_id, user_id) do nothing;

-- Backfill 2: shared_with emails -> editor members (matches previous
-- behaviour, where shared users could read and edit).
insert into public.project_members (project_id, user_id, role, added_by)
select p.id, u.id, 'editor', p.user_id
from public.projects p
cross join lateral jsonb_array_elements_text(coalesce(p.shared_with, '[]'::jsonb)) as e(email)
join auth.users u on lower(u.email) = lower(e.email)
on conflict (project_id, user_id) do nothing;

-- ============ Knowledge scoping (matter isolation) ============
alter table public.kb_documents add column if not exists project_id uuid;
alter table public.kb_chunks    add column if not exists project_id uuid;
create index if not exists kb_documents_project_idx on public.kb_documents(project_id);
create index if not exists kb_chunks_project_idx    on public.kb_chunks(project_id);

-- Retrieval: owner-scoped as before, plus optional accessible-project scope.
-- Global (project_id null) chunks are always visible to their owner; a
-- project-scoped chunk is only returned when its project is in
-- accessible_projects (the caller's membership set, passed by the backend).
create or replace function public.match_kb_chunks(
  query_embedding vector(1536),
  match_owner uuid,
  match_count int default 6,
  filter_doc_type text default null,
  accessible_projects uuid[] default null
)
returns table (
  document_id uuid,
  title text,
  doc_type text,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select c.document_id, d.title, d.doc_type, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  where c.embedding is not null
    and (filter_doc_type is null or d.doc_type = filter_doc_type)
    and (
      (c.project_id is null and c.owner_id = match_owner)
      or (c.project_id is not null
          and accessible_projects is not null
          and c.project_id = any(accessible_projects))
    )
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;
