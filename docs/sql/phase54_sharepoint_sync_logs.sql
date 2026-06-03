-- phase54_sharepoint_sync_logs.sql
-- Persistent log of SharePoint → dealer_accounts sync runs.
-- Written by the `sharepoint-sync-dealers` Edge Function (service role).
-- Read-only by Timan Backend users via RLS.

create table if not exists public.sharepoint_sync_logs (
  id              uuid primary key default gen_random_uuid(),
  ran_at          timestamptz not null default now(),
  ran_by_email    text,
  ran_by_user_id  uuid,
  dry_run         boolean not null,
  fetched         integer not null default 0,
  valid           integer not null default 0,
  created         integer not null default 0,
  updated         integer not null default 0,
  skipped         integer not null default 0,
  warnings        integer not null default 0,
  duration_ms     integer not null default 0,
  warning_details jsonb not null default '[]'::jsonb,
  error           text
);

-- Data API needs grants. service_role writes from the Edge Function.
-- Authenticated users can read so Timan Backend page can show history.
grant select on public.sharepoint_sync_logs to authenticated;
grant all on public.sharepoint_sync_logs to service_role;

alter table public.sharepoint_sync_logs enable row level security;

-- Only Timan Backend can read logs.
drop policy if exists sharepoint_sync_logs_select_backend on public.sharepoint_sync_logs;
create policy sharepoint_sync_logs_select_backend
on public.sharepoint_sync_logs
for select
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where lower(au.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
      and au.portal_role = 'timan_backend'
      and au.is_active = true
      and au.approved = true
  )
);

create index if not exists sharepoint_sync_logs_ran_at_idx
  on public.sharepoint_sync_logs (ran_at desc);
