-- Selective SharePoint dealer sync audit metadata.
-- The historic sync-log definition existed as documentation but was never
-- migrated to the linked database. Create the expected append-only log table
-- idempotently before adding the selective-sync audit fields.

create table if not exists public.sharepoint_sync_logs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  ran_by_email text,
  ran_by_user_id uuid,
  dry_run boolean not null,
  fetched integer not null default 0,
  valid integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  warnings integer not null default 0,
  duration_ms integer not null default 0,
  warning_details jsonb not null default '[]'::jsonb,
  error text
);

alter table public.sharepoint_sync_logs
  add column if not exists selected_count integer not null default 0,
  add column if not exists selected_account_ids jsonb not null default '[]'::jsonb,
  add column if not exists change_details jsonb not null default '[]'::jsonb;

comment on column public.sharepoint_sync_logs.selected_account_ids is
  'Explicit dealer account-number allowlist used for a real selective SharePoint sync.';

comment on column public.sharepoint_sync_logs.selected_count is
  'Number of explicitly selected dealer account numbers for this sync run.';

comment on column public.sharepoint_sync_logs.change_details is
  'Field-level Portal-to-SharePoint masterdata diff for the selected records at sync time.';

grant select on public.sharepoint_sync_logs to authenticated;
grant all on public.sharepoint_sync_logs to service_role;

alter table public.sharepoint_sync_logs enable row level security;

drop policy if exists sharepoint_sync_logs_select_backend on public.sharepoint_sync_logs;
create policy sharepoint_sync_logs_select_backend
on public.sharepoint_sync_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.app_users au
    where lower(au.email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
      and au.portal_role = 'timan_backend'
      and au.is_active = true
      and au.approved = true
  )
);

create index if not exists sharepoint_sync_logs_ran_at_idx
  on public.sharepoint_sync_logs (ran_at desc);
