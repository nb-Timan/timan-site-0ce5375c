-- =====================================================================
-- Phase 12 — Dealer account blocking & soft delete
--
-- Adds the ability for Timan Backend admins to block (suspend) and
-- soft-delete dealer accounts WITHOUT touching any linked user data,
-- quotes, orders, configurator pricing, or n8n webhook logic.
--
-- Safe to run multiple times (idempotent).
-- Run in Supabase SQL editor.
-- =====================================================================

-- ---------- 1) New columns on dealer_accounts ------------------------
alter table public.dealer_accounts
  add column if not exists is_blocked  boolean not null default false,
  add column if not exists blocked_at  timestamptz,
  add column if not exists blocked_by  text,
  add column if not exists is_deleted  boolean not null default false,
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  text;

create index if not exists dealer_accounts_is_blocked_idx
  on public.dealer_accounts (is_blocked) where is_blocked = true;
create index if not exists dealer_accounts_is_deleted_idx
  on public.dealer_accounts (is_deleted) where is_deleted = true;

-- ---------- 2) Refresh dealer_account_stats view ---------------------
-- Include the new flags so the UI can reflect blocked/deleted state.
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
  da.is_blocked,
  da.blocked_at,
  da.blocked_by,
  da.is_deleted,
  da.deleted_at,
  da.deleted_by,
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

alter view public.dealer_account_stats set (security_invoker = true);

-- =====================================================================
-- Verify:
--   select id, company_name, is_blocked, is_deleted from public.dealer_accounts limit 5;
-- =====================================================================
