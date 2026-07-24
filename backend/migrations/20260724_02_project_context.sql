-- Per-project organisational context (extends C033 org context).
--
-- Each project can carry its own context (e.g. matter background, client
-- preferences, house style for that engagement). It is injected into that
-- project's chat + agent prompts alongside the global org context
-- (app_settings 'org_context') and the per-user personal_context.
--
-- Edited by admins on the Admin page. Run in the Supabase SQL editor.

alter table public.projects add column if not exists context text;
