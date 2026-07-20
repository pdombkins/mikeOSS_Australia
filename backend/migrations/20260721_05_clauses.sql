-- Migration date: 2026-07-21
-- C026 — My Clauses: personal preferred-provision library.
-- Embeddings: Gemini gemini-embedding-001 @1536 dims (same as KB).

create table if not exists public.clauses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid,                    -- optional matter scoping (P3 isolation)
  title text not null,
  agreement_type text,                -- NDA | MSA | CRO | work_order | distribution | other
  body text not null,                 -- the preferred provision text
  guidance text,                      -- when/how to use it
  tags text[] not null default '{}',
  source_document_id uuid,            -- where it was clipped from
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clauses_owner_idx on public.clauses(owner_id);
create index if not exists clauses_project_idx on public.clauses(project_id);
create index if not exists clauses_embedding_idx
  on public.clauses using hnsw (embedding vector_cosine_ops);

create or replace function public.match_clauses(
  query_embedding vector(1536),
  match_owner uuid,
  match_count int default 6,
  filter_agreement_type text default null,
  accessible_projects uuid[] default null
)
returns table (
  id uuid,
  title text,
  agreement_type text,
  body text,
  guidance text,
  tags text[],
  similarity float
)
language sql stable
as $$
  select c.id, c.title, c.agreement_type, c.body, c.guidance, c.tags,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.clauses c
  where c.embedding is not null
    and (filter_agreement_type is null or c.agreement_type = filter_agreement_type)
    and (
      (c.project_id is null and c.owner_id = match_owner)
      or (c.project_id is not null
          and accessible_projects is not null
          and c.project_id = any(accessible_projects))
    )
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

alter table public.clauses enable row level security;
