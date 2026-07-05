-- Per-query cost tracking table.
-- Records the token usage and AUD cost of every LLM call made through Mike OSS.

create table if not exists public.query_costs (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users(id) on delete cascade,
    chat_id         uuid,                  -- nullable: null for standalone workflow/tabular runs
    model           text not null,
    input_tokens    integer not null default 0,
    output_tokens   integer not null default 0,
    cost_usd        numeric(12, 8) not null default 0,
    cost_aud        numeric(12, 8) not null default 0,
    aud_rate        numeric(8, 6) not null default 0,
    source          text not null default 'assistant',  -- 'assistant' | 'project' | 'tabular' | 'workflow'
    created_at      timestamptz not null default now()
);

-- Only admins and the owning user should access cost rows.
alter table public.query_costs enable row level security;

create policy "Users can read own costs"
    on public.query_costs for select
    using (auth.uid() = user_id);

create policy "Backend service role can insert costs"
    on public.query_costs for insert
    with check (true);

-- Index for admin dashboard queries.
create index if not exists query_costs_user_id_created_at_idx
    on public.query_costs (user_id, created_at desc);

create index if not exists query_costs_created_at_idx
    on public.query_costs (created_at desc);

notify pgrst, 'reload schema';
