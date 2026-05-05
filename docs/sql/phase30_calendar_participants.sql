-- Phase 30: multi-seller participants on planned calendar activities.
-- Run manually in Supabase SQL Editor. Safe to re-run.
--
-- NOTE: If Phase 6 (docs/sql/phase6_crm_calendar.sql) was never applied in
-- this environment, the table public.crm_calendar_activities does not exist
-- yet and the app has been silently using its localStorage fallback. This
-- script therefore (re)creates the base table idempotently before adding
-- the new participant column. It is safe to run even if Phase 6 was already
-- applied — every statement uses IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1) Base table (mirrors phase6_crm_calendar.sql, idempotent)
-- ---------------------------------------------------------------------------
create table if not exists public.crm_calendar_activities (
    id uuid primary key default gen_random_uuid(),
    title text not null default '',
    start_datetime timestamptz not null,
    end_datetime timestamptz,
    account_id uuid,
    dealer_name text,
    seller_user_id uuid,
    seller_initials text,
    seller_name text,
    activity_type text not null default 'andet',
    note text,
    status text not null default 'planned',
    outlook_event_id text,
    outlook_sync_status text,
    outlook_last_synced_at timestamptz,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Defensive add-columns for older deployments / partial Phase 6 runs
alter table public.crm_calendar_activities add column if not exists end_datetime timestamptz;
alter table public.crm_calendar_activities add column if not exists account_id uuid;
alter table public.crm_calendar_activities add column if not exists dealer_name text;
alter table public.crm_calendar_activities add column if not exists seller_user_id uuid;
alter table public.crm_calendar_activities add column if not exists seller_initials text;
alter table public.crm_calendar_activities add column if not exists seller_name text;
alter table public.crm_calendar_activities add column if not exists activity_type text;
alter table public.crm_calendar_activities add column if not exists note text;
alter table public.crm_calendar_activities add column if not exists status text;
alter table public.crm_calendar_activities add column if not exists outlook_event_id text;
alter table public.crm_calendar_activities add column if not exists outlook_sync_status text;
alter table public.crm_calendar_activities add column if not exists outlook_last_synced_at timestamptz;
alter table public.crm_calendar_activities add column if not exists created_by_user_id uuid;
alter table public.crm_calendar_activities add column if not exists created_by_email text;
alter table public.crm_calendar_activities add column if not exists updated_by_user_id uuid;
alter table public.crm_calendar_activities add column if not exists created_at timestamptz default now();
alter table public.crm_calendar_activities add column if not exists updated_at timestamptz default now();

-- Phase 16 dealer snapshot columns (additive, safe)
alter table public.crm_calendar_activities add column if not exists dealer_account_number text;
alter table public.crm_calendar_activities add column if not exists dealer_assigned_seller_initials text;
alter table public.crm_calendar_activities add column if not exists dealer_assigned_seller_email text;

create index if not exists idx_crm_cal_start    on public.crm_calendar_activities (start_datetime desc);
create index if not exists idx_crm_cal_seller   on public.crm_calendar_activities (seller_user_id);
create index if not exists idx_crm_cal_account  on public.crm_calendar_activities (account_id);
create index if not exists idx_crm_cal_initials on public.crm_calendar_activities (seller_initials);

-- RLS permissive (matches other CRM tables in this project)
alter table public.crm_calendar_activities enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='crm_calendar_activities' and policyname='crm_cal_all'
  ) then
    create policy crm_cal_all on public.crm_calendar_activities
      for all using (true) with check (true);
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2) Phase 30: participant_seller_initials
-- ---------------------------------------------------------------------------
alter table public.crm_calendar_activities
  add column if not exists participant_seller_initials text[] not null default '{}';

create index if not exists crm_calendar_activities_participants_idx
  on public.crm_calendar_activities using gin (participant_seller_initials);
