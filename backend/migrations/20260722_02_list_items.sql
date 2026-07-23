-- C076 — Lists: tasks, facts & deadlines on matters (Legora Lists analogue).
--
-- Work items attached to a project (matter). Three kinds:
--   * task     — actionable; can be executed by an agent run (approval-gated)
--   * fact     — key fact for the matter; optional source document and a
--                free-text citation (MNC/AGLC4 — never auto-fetched)
--   * deadline — date-bound item; daily sweep notifies the assignee when due
--                within 72h (NotificationKind 'deadline')
--
-- Access control is enforced in backend code via project_members
-- (checkProjectAccess + rbac.can — deny-by-default matter isolation, P3).
-- RLS is enabled to match the rest of the schema; the service role bypasses.
--
-- Run in the Supabase SQL editor.

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null,
  kind text not null check (kind in ('task', 'fact', 'deadline')),
  title text not null,
  detail text,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'dismissed')),
  assignee_user_id uuid,
  document_id uuid references public.documents(id) on delete set null,
  citation text,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists list_items_project_idx on public.list_items(project_id);
create index if not exists list_items_assignee_idx on public.list_items(assignee_user_id);
create index if not exists list_items_due_idx
  on public.list_items(due_at)
  where due_at is not null;

alter table public.list_items enable row level security;
