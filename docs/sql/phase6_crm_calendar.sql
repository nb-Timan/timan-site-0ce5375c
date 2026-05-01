-- Phase 6 — CRM Calendar (planned dealer activities)
-- Safe / idempotent: create-if-not-exists + add-column-if-not-exists.
-- Outlook / Microsoft Graph sync columns are PROVISIONED but not used yet.

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
    -- Outlook / Microsoft Graph sync (reserved for Phase 7)
    outlook_event_id text,
    outlook_sync_status text,
    outlook_last_synced_at timestamptz,
    -- Audit
    created_by_user_id uuid,
    updated_by_user_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Defensive add-column for older deployments
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
alter table public.crm_calendar_activities add column if not exists updated_by_user_id uuid;
alter table public.crm_calendar_activities add column if not exists created_at timestamptz default now();
alter table public.crm_calendar_activities add column if not exists updated_at timestamptz default now();

create index if not exists idx_crm_cal_start on public.crm_calendar_activities (start_datetime desc);
create index if not exists idx_crm_cal_seller on public.crm_calendar_activities (seller_user_id);
create index if not exists idx_crm_cal_account on public.crm_calendar_activities (account_id);
create index if not exists idx_crm_cal_initials on public.crm_calendar_activities (seller_initials);

-- RLS: leave permissive for now (matches other CRM tables in this project).
-- Tighten in a later phase aligned with the rest of CRM scoping.
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
end $$;
