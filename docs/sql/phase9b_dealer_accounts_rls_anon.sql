-- =====================================================================
-- Phase 9b — Fix: dealer_accounts visible from the app
--
-- Problem: the portal queries Supabase using the publishable (anon) key
-- without going through Supabase Auth. The previous SELECT policy was
-- scoped to the 'authenticated' role only, so PostgREST returned [] (200)
-- and Timan Backend → Forhandlere showed 0 rows even though the table
-- contains 98 records.
--
-- Fix: allow both 'anon' and 'authenticated' to SELECT. Writes remain
-- restricted to Timan Backend (insert/update/delete unchanged).
--
-- Also ensures the optional 'customer_type_label' column exists so the
-- frontend can display either customer_type or customer_type_label.
--
-- Safe to run multiple times.
-- =====================================================================

-- Ensure column the UI reads exists (no-op if you already have it).
alter table public.dealer_accounts
  add column if not exists customer_type_label text;

-- Replace the SELECT policy.
drop policy if exists dealer_accounts_select_authenticated on public.dealer_accounts;
drop policy if exists dealer_accounts_select_public        on public.dealer_accounts;

create policy dealer_accounts_select_public
  on public.dealer_accounts
  for select
  to anon, authenticated
  using (true);

-- Verify:
--   select count(*) from public.dealer_accounts;     -- should be 98
--   -- From the app (anon key) the same count should now be returned.
