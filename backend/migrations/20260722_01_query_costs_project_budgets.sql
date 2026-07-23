-- C077 — consumption metering: per-project cost attribution + soft budgets.
--
--  * query_costs.project_id — nullable; populated by write sites that know
--    the project (chat/agents via runLLMStream, tabular generate/regenerate).
--    Historic rows stay null.
--  * user_profiles.monthly_budget_aud — optional soft budget (AUD/month).
--    Warnings only (notification at 80%, banner at 100%); NEVER blocks.
--
-- Run in the Supabase SQL editor.

alter table public.query_costs
  add column if not exists project_id uuid;

create index if not exists query_costs_project_idx
  on public.query_costs(project_id)
  where project_id is not null;

create index if not exists query_costs_user_created_idx
  on public.query_costs(user_id, created_at);

alter table public.user_profiles
  add column if not exists monthly_budget_aud numeric;
