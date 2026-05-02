-- =====================================================================
-- Phase 11 — Dealer ⇄ User relationship model
--
-- Goals:
--   • Make public.dealer_accounts the master for dealer/seller assignment.
--   • Allow MANY app_users to belong to ONE dealer_account.
--   • Provide a stats view aggregating activity (configurations) by
--     dealer_account, regardless of which individual user created the row.
--   • Track pending-signup notifications for Timan Backend users.
--
-- Safe to run multiple times (idempotent).
-- Does NOT change configurator pricing, product data, quote/order logic.
-- =====================================================================

-- ---------- 1) dealer_accounts: ensure customer_type_label column ----
-- The UI already reads either customer_type or customer_type_label.
alter table public.dealer_accounts
  add column if not exists customer_type_label text;

-- Helpful index on dealer link from app_users
create index if not exists app_users_dealer_number_idx
  on public.app_users (dealer_number);

-- ---------- 2) Stats view: per-dealer aggregated activity --------------
-- Joins dealer_accounts ⇄ app_users (by account_number) ⇄ configurations
-- (by created_by_user_id). All counts aggregate at dealer level so that
-- multiple users from the same dealer count under the same dealer/seller.

create or replace view public.dealer_account_stats as
with users as (
  select
    da.id              as dealer_id,
    da.account_number,
    count(au.id)::int  as user_count,
    max(au.last_login) as last_user_login,
    array_agg(distinct au.id)
      filter (where au.id is not null) as user_ids
  from public.dealer_accounts da
  left join public.app_users au
    on au.dealer_number = da.account_number
  group by da.id, da.account_number
),
acts as (
  select
    da.id as dealer_id,
    count(c.id) filter (where c.case_type = 'quote')::int as quote_count,
    count(c.id) filter (where c.case_type = 'order')::int as order_count,
    count(c.id)::int                                        as activity_count,
    max(c.last_saved_at)                                    as last_activity_at
  from public.dealer_accounts da
  left join public.app_users au on au.dealer_number = da.account_number
  left join public.configurations c on c.created_by_user_id = au.id
  group by da.id
)
select
  da.id,
  da.account_number,
  da.company_name,
  da.customer_type,
  da.customer_type_label,
  da.country,
  da.assigned_seller_initials,
  da.assigned_seller_name,
  da.assigned_seller_email,
  coalesce(u.user_count, 0)        as user_count,
  coalesce(a.activity_count, 0)    as activity_count,
  coalesce(a.quote_count, 0)       as quote_count,
  coalesce(a.order_count, 0)       as order_count,
  greatest(
    coalesce(u.last_user_login, 'epoch'::timestamptz),
    coalesce(a.last_activity_at,   'epoch'::timestamptz)
  ) as last_activity_at,
  u.user_ids
from public.dealer_accounts da
left join users u on u.dealer_id = da.id
left join acts  a on a.dealer_id = da.id;

-- View inherits RLS from underlying tables (security_invoker).
alter view public.dealer_account_stats set (security_invoker = true);

-- ---------- 3) Pending users notification --------------------------------
-- Backend users see a bell badge. We expose a tiny SECURITY DEFINER helper
-- so the frontend doesn't need broad SELECT on app_users.

create or replace function public.pending_user_count()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.app_users
  where coalesce(approved, false) = false
    and coalesce(status, 'pending') = 'pending';
$$;

revoke all on function public.pending_user_count() from public;
grant execute on function public.pending_user_count() to authenticated;

-- =====================================================================
-- Verify:
--   select * from public.dealer_account_stats limit 5;
--   select public.pending_user_count();
-- =====================================================================
