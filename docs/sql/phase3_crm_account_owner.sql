-- Phase 3 — CRM / Sales Portal access foundation.
--
-- HOW TO RUN
-- 1. Open Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent). No existing rows are dropped or overwritten.
--
-- WHAT THIS DOES
-- - Adds an "account owner" relationship to public.app_users so any
--   dealer/importer/service partner/dealer user row can be assigned to a
--   responsible Timan Sælger (also a row in app_users).
-- - Adds the same owner relationship to public.configurations so each
--   offer/order can be scoped to its owning seller.
-- - Adds a helper view public.crm_my_accounts which returns the rows
--   visible to the currently configured seller (used later by the CRM
--   area). Today the SPA filters in JS using crmScope.ts; the view is
--   future-proofing for proper auth.uid()-based RLS.
--
-- WHAT THIS DOES NOT DO
-- - Does not change pricing, discounts, configurator calculations,
--   order/PDF logic, n8n flows or login/auth.
-- - Does not enforce hard RLS yet (current SPA uses the publishable key);
--   permissive policies remain. Tighten when auth is wired through.

-- 1) Account-owner columns on app_users -------------------------------------------------
alter table public.app_users
  add column if not exists account_owner_user_id  uuid references public.app_users(id) on delete set null,
  add column if not exists account_owner_name     text,
  add column if not exists account_owner_initials text,
  add column if not exists account_owner_email    text;

create index if not exists app_users_account_owner_idx
  on public.app_users (account_owner_user_id);

-- Convenience: keep the denormalised fields in sync when only the user_id is set.
create or replace function public.sync_account_owner_fields()
returns trigger
language plpgsql
as $$
declare
  owner record;
begin
  if new.account_owner_user_id is null then
    new.account_owner_name     := null;
    new.account_owner_initials := null;
    new.account_owner_email    := null;
    return new;
  end if;

  if (tg_op = 'INSERT')
     or (new.account_owner_user_id is distinct from old.account_owner_user_id) then
    select id, full_name, initials, email
      into owner
      from public.app_users
     where id = new.account_owner_user_id;

    if owner.id is not null then
      new.account_owner_name     := coalesce(owner.full_name, split_part(owner.email,'@',1));
      new.account_owner_initials := coalesce(owner.initials, upper(left(coalesce(owner.full_name, owner.email), 3)));
      new.account_owner_email    := owner.email;
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_sync_account_owner on public.app_users;
create trigger trg_sync_account_owner
before insert or update of account_owner_user_id on public.app_users
for each row execute function public.sync_account_owner_fields();

-- 2) assigned_seller_id on configurations (offers/orders) -------------------------------
alter table public.configurations
  add column if not exists assigned_seller_id uuid
    references public.app_users(id) on delete set null;

create index if not exists configurations_assigned_seller_idx
  on public.configurations (assigned_seller_id);

-- 3) Helper view: rows owned by a given seller ------------------------------------------
-- Today the SPA passes the seller id explicitly (no auth.uid() yet). Later
-- this can be flipped to use auth.uid() once login wires Supabase Auth into
-- the backend admin flow.
create or replace view public.crm_accounts_view
with (security_invoker = on)
as
select
  u.id,
  u.email,
  u.full_name,
  u.role,
  u.partner_type,
  u.portal_role,
  u.company,
  u.country,
  u.dealer_number,
  u.account_owner_user_id,
  u.account_owner_name,
  u.account_owner_initials,
  u.account_owner_email
from public.app_users u
where u.role = 'partner'
   or u.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user');

-- Notes:
-- * No DROP/DELETE statements — re-running this file is safe.
-- * Existing app_users + configurations rows keep all current fields/values.
