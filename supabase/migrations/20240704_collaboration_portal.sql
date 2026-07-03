-- ============================================================
-- Collaboration Portal Migration
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Add is_admin flag to user_profiles
alter table public.user_profiles
  add column if not exists is_admin boolean not null default false;

-- 2. Set Peter as admin (matches on email from auth.users)
update public.user_profiles
set is_admin = true
where user_id = (
  select id from auth.users where email = 'pdombkins@gmail.com' limit 1
);

-- 3. Invitations tracking table
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_invitations_email
  on public.invitations(email);

create index if not exists idx_invitations_invited_by
  on public.invitations(invited_by);

-- Only admins can read/write invitations via service role (backend does this)
revoke all on public.invitations from anon, authenticated;

-- 4. Reload PostgREST schema cache
notify pgrst, 'reload schema';

-- ============================================================
-- IMPORTANT: After running this SQL, also go to:
-- Supabase Dashboard → Authentication → Providers → Email
-- and turn OFF "Enable email signups" so only invited
-- users can create accounts.
-- ============================================================
