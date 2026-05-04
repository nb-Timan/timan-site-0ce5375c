-- Phase 22: Budget references — optional context attached to a budget cell change.
-- Run in Supabase SQL Editor.

create table if not exists public.budget_references (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Cell coordinates (matches budgetCellKey in code)
  cell_key text not null,
  budget_year int not null,
  seller_initials text,
  seller_email text,
  product_code text,
  model_name text,
  category text,
  month text,
  month_idx int,
  budget_type text not null check (budget_type in ('budget','arbejdsbudget')),

  -- Snapshot at the time the reference was attached
  old_value numeric,
  new_value numeric,

  -- Reference fields (all optional)
  dealer_name text,
  contact_name text,
  lead_id text,
  demo_id text,
  note text,

  -- Authorship
  created_by_email text,
  created_by_name text
);

create index if not exists budget_references_cell_key_idx
  on public.budget_references (cell_key, created_at desc);
create index if not exists budget_references_year_seller_idx
  on public.budget_references (budget_year, seller_initials);
create index if not exists budget_references_lead_idx
  on public.budget_references (lead_id) where lead_id is not null;
create index if not exists budget_references_demo_idx
  on public.budget_references (demo_id) where demo_id is not null;

alter table public.budget_references enable row level security;

-- Authenticated users may insert references they author.
drop policy if exists "budget_references insert authenticated" on public.budget_references;
create policy "budget_references insert authenticated"
on public.budget_references
for insert
to authenticated
with check (true);

-- Backend users see everything.
drop policy if exists "budget_references read backend" on public.budget_references;
create policy "budget_references read backend"
on public.budget_references
for select
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and au.role = 'timan_backend'
  )
);

-- Sellers see references where they are the subject or the author.
drop policy if exists "budget_references read seller" on public.budget_references;
create policy "budget_references read seller"
on public.budget_references
for select
to authenticated
using (
  exists (
    select 1 from public.app_users au
    where au.user_id = auth.uid()
      and (
        lower(au.email) = lower(coalesce(budget_references.seller_email, ''))
        or lower(au.email) = lower(coalesce(budget_references.created_by_email, ''))
      )
  )
);
