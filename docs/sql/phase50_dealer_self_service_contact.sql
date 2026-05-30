-- Phase 50 — Dealer self-service contact info.
--
-- HOW TO RUN
-- 1. Open Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- WHAT THIS DOES
-- A) Adds four new contact-info columns to public.dealer_accounts:
--      - vat_number
--      - primary_contact_name
--      - primary_contact_email
--      - primary_contact_phone
-- B) Adds a security-definer helper public.current_user_dealer_number()
--    that resolves the calling auth user's app_users.dealer_number.
-- C) Adds RLS policies so an external dealer-side user may:
--      - SELECT their own row in public.dealer_accounts
--      - UPDATE their own row in public.dealer_accounts (column-restricted)
--    Backend / service policies from phase9c remain untouched.
-- D) Column-level GRANT UPDATE restricts what authenticated users can write
--    (defense-in-depth on top of RLS). Backend keeps full access via
--    is_timan_backend() policy.
--
-- WHAT THIS DOES NOT DO
-- - No importer/service-partner → sub-dealer relation. Awaiting decision.
-- - No seller-scope SELECT/UPDATE policy on dealer_accounts.
-- - No changes to portal_form_submissions policies.

-- A) Columns ----------------------------------------------------------------
alter table public.dealer_accounts
  add column if not exists vat_number             text,
  add column if not exists primary_contact_name   text,
  add column if not exists primary_contact_email  text,
  add column if not exists primary_contact_phone  text;

-- B) Helper -----------------------------------------------------------------
create or replace function public.current_user_dealer_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select dealer_number
  from public.app_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_user_dealer_number() to authenticated;

-- C) RLS policies for the dealer-side user ----------------------------------
-- (Backend policies from phase9c remain in place; these are additive.)

drop policy if exists dealer_accounts_select_own on public.dealer_accounts;
create policy dealer_accounts_select_own
  on public.dealer_accounts
  for select
  to authenticated
  using (
    account_number is not null
    and account_number = public.current_user_dealer_number()
  );

drop policy if exists dealer_accounts_update_own on public.dealer_accounts;
create policy dealer_accounts_update_own
  on public.dealer_accounts
  for update
  to authenticated
  using (
    account_number is not null
    and account_number = public.current_user_dealer_number()
  )
  with check (
    account_number is not null
    and account_number = public.current_user_dealer_number()
  );

-- D) Grants -----------------------------------------------------------------
-- SELECT on the whole row (RLS filters to own row for non-backend users).
grant select on public.dealer_accounts to authenticated;

-- UPDATE restricted to the contact-info columns only. Other columns
-- (account_number, assigned_seller_*, parent_account_number, is_blocked, …)
-- are NOT grantable to authenticated, so the dealer cannot change them
-- even though the row passes RLS.
grant update (
  address,
  postal_code,
  city,
  email,
  phone,
  vat_number,
  primary_contact_name,
  primary_contact_email,
  primary_contact_phone
) on public.dealer_accounts to authenticated;

-- service_role keeps full access (unchanged).
grant all on public.dealer_accounts to service_role;

-- VERIFICATION (run while signed in as a dealer user via the app):
--   select account_number, company_name, vat_number, primary_contact_name
--   from public.dealer_accounts;
-- Expect: exactly the caller's own row.
--
-- Attempt to update a forbidden column (should error: permission denied):
--   update public.dealer_accounts set assigned_seller_email = 'x@y.z'
--   where account_number = public.current_user_dealer_number();
--
-- Attempt to update an allowed column (should succeed):
--   update public.dealer_accounts set primary_contact_name = 'Test'
--   where account_number = public.current_user_dealer_number();
