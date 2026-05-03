-- =====================================================================
-- Phase 17 — Time-limited budget access windows
--
-- Why:
--   The CRM Budget page must let Timan Backend OPEN a budget year for
--   editing for a limited time, either for ALL sellers or a single
--   seller. When the window closes (open_until passes, or backend
--   closes it manually) the budget becomes read-only again.
--
-- Safe to run multiple times. Does not change configurator pricing,
-- product data, quote/order calculations, or n8n webhook logic.
-- Existing budget rows are not modified.
-- =====================================================================

-- ---------- 1) Table -----------------------------------------------------
create table if not exists public.budget_access_windows (
  id uuid primary key default gen_random_uuid(),
  budget_year integer not null,
  scope text not null check (scope in ('all', 'seller')),
  seller_initials text,
  seller_email text,
  open_from timestamptz not null default now(),
  open_until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint budget_access_windows_seller_required
    check (scope = 'all' or seller_email is not null)
);

create index if not exists budget_access_windows_year_idx
  on public.budget_access_windows (budget_year);
create index if not exists budget_access_windows_open_idx
  on public.budget_access_windows (status, open_from, open_until);
create index if not exists budget_access_windows_seller_idx
  on public.budget_access_windows (seller_email);

comment on table public.budget_access_windows is
  'Time-limited unlock windows for the CRM Budget editor. Opened by Timan Backend.';

-- ---------- 2) RLS -------------------------------------------------------
alter table public.budget_access_windows enable row level security;

-- Helper: re-uses the existing is_timan_backend() function (Phase 13).
-- Anyone authenticated can READ active windows so sellers can see the
-- countdown, but only Timan Backend can INSERT/UPDATE.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'budget_access_windows'
      and policyname = 'budget_access_windows_select_authed'
  ) then
    create policy budget_access_windows_select_authed
      on public.budget_access_windows
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'budget_access_windows'
      and policyname = 'budget_access_windows_insert_backend'
  ) then
    create policy budget_access_windows_insert_backend
      on public.budget_access_windows
      for insert
      to authenticated
      with check (public.is_timan_backend());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'budget_access_windows'
      and policyname = 'budget_access_windows_update_backend'
  ) then
    create policy budget_access_windows_update_backend
      on public.budget_access_windows
      for update
      to authenticated
      using (public.is_timan_backend())
      with check (public.is_timan_backend());
  end if;
end $$;
