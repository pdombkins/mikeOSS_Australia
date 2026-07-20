-- Migration date: 2026-07-21
-- C014 — Workflows orchestration layer: optional multi-step plan template
-- (same step schema as agent_steps). skill_md workflows keep working
-- unchanged; a workflow with a plan_template runs as an agent run.

alter table public.workflows
  add column if not exists plan_template jsonb;
