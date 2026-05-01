-- =====================================================================
-- Phase 9c — Lock dealer_accounts to authenticated Timan Backend users
--
-- Reverses phase 9b (which temporarily allowed anon SELECT). The Forhandlere
-- page now requires the user to be signed in via Supabase Auth AND to be a
-- Timan Backend user.
--
-- Safe to run multiple times.
-- =====================================================================

-- Make sure the helper exists and is up to date.
create or replace function public.is_timan_backend()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and portal_role = 'timan_backend'
      and is_active = true
      and approved   = true
  );
$$;

alter table public.dealer_accounts enable row level security;

-- Drop every existing SELECT policy so we end with exactly one.
drop policy if exists dealer_accounts_select_authenticated on public.dealer_accounts;
drop policy if exists dealer_accounts_select_public        on public.dealer_accounts;
drop policy if exists dealer_accounts_select_backend       on public.dealer_accounts;

create policy dealer_accounts_select_backend
  on public.dealer_accounts
  for select
  to authenticated
  using (public.is_timan_backend());

-- Re-assert write policies (idempotent).
drop policy if exists dealer_accounts_insert_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_update_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_delete_backend on public.dealer_accounts;

create policy dealer_accounts_insert_backend
  on public.dealer_accounts for insert
  to authenticated
  with check (public.is_timan_backend());

create policy dealer_accounts_update_backend
  on public.dealer_accounts for update
  to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

create policy dealer_accounts_delete_backend
  on public.dealer_accounts for delete
  to authenticated
  using (public.is_timan_backend());

-- Verify (run while signed in as a timan_backend user via the app):
--   select count(*) from public.dealer_accounts;   -- expect 98
-- Verify with anon key (e.g. curl with the publishable key, no Bearer JWT):
--   should return [] / 0 rows.
