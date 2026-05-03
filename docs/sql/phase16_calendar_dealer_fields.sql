-- =====================================================================
-- Phase 16 — Calendar activity: extra dealer + creator fields
--
-- Why:
--   The "Ny aktivitet" modal now lets a seller pick ANY dealer
--   (not just their own). We must persist the selected dealer's
--   account_number and the dealer's main responsible seller, plus
--   the activity creator's seller context — WITHOUT changing the
--   dealer's ownership in dealer_accounts.
--
-- Safe to run multiple times. No data is changed or deleted.
-- =====================================================================

alter table public.crm_calendar_activities
  add column if not exists dealer_account_number text,
  add column if not exists dealer_assigned_seller_initials text,
  add column if not exists dealer_assigned_seller_email text,
  add column if not exists created_by_email text;

comment on column public.crm_calendar_activities.dealer_account_number is
  'dealer_accounts.account_number of the selected dealer (snapshot, not a FK).';
comment on column public.crm_calendar_activities.dealer_assigned_seller_initials is
  'Snapshot of dealer_accounts.assigned_seller_initials at the time of saving (read-only).';
comment on column public.crm_calendar_activities.dealer_assigned_seller_email is
  'Snapshot of dealer_accounts.assigned_seller_email at the time of saving (read-only).';
comment on column public.crm_calendar_activities.created_by_email is
  'Email of the seller context who created the activity (may differ from dealer assigned seller).';

create index if not exists crm_calendar_activities_dealer_acct_idx
  on public.crm_calendar_activities (dealer_account_number);
