-- Migration date: 2026-07-21
-- P1 — Agent runtime (C013 sub-agent orchestration, C030 plan approval +
-- parallel execution, and run kinds consumed by C022/C002/C024/C018/C014).

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid,
  kind text not null default 'assistant'
    check (kind in ('assistant','workflow','draft_from_precedent',
                    'playbook_builder','verify','regulatory_scan')),
  status text not null default 'planning'
    check (status in ('planning','awaiting_approval','running','paused',
                      'completed','failed','cancelled')),
  title text,
  request text not null,           -- the user's natural-language instruction
  model text,
  plan jsonb,                      -- planner output (steps summary, editable)
  result jsonb,                    -- final outputs (text, doc ids, report)
  error text,
  document_ids jsonb,              -- input documents bound at creation
  workflow_id text,                -- for kind='workflow'
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists agent_runs_owner_idx
  on public.agent_runs(owner_id, created_at desc);
create index if not exists agent_runs_project_idx on public.agent_runs(project_id);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  position int not null,
  depends_on int[] not null default '{}',   -- positions of prerequisite steps
  role text not null default 'research'
    check (role in ('intake','research','drafting','review','verify')),
  instruction text not null,
  tool_allowlist text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','skipped')),
  output_text text,
  output jsonb,                   -- events digest (docs created, citations)
  input_tokens int,
  output_tokens int,
  cost_aud numeric,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, position)
);
create index if not exists agent_steps_run_idx on public.agent_steps(run_id, position);

alter table public.agent_runs  enable row level security;
alter table public.agent_steps enable row level security;
