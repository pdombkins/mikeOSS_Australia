-- Central document management — link Library documents to many projects.
--
-- A single canonical document (typically a Library document owned by the
-- instructor/admin, project_id null) can be "published" to any number of
-- projects via this link table. Unlike copying, the link is live: updating
-- or removing the source updates every project it is linked to, and the
-- bytes are never duplicated.
--
-- Used by:
--   * Admin → Documents matrix (docs × projects checkboxes)
--   * Project document listings (linked docs appear read-only alongside
--     the project's own documents)
--   * buildProjectDocContext (linked docs are available to the project's
--     assistant + agents)
--
-- Access control is enforced in backend code (access.ts): a user with
-- access to a project can read any document linked to that project. RLS is
-- enabled to match the rest of the schema; the service role bypasses.
--
-- Run in the Supabase SQL editor.

create table if not exists public.document_project_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  linked_by uuid,
  created_at timestamptz not null default now(),
  unique (document_id, project_id)
);

create index if not exists idx_dpl_project on public.document_project_links(project_id);
create index if not exists idx_dpl_document on public.document_project_links(document_id);

alter table public.document_project_links enable row level security;
