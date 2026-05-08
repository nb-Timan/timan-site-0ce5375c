-- Phase 34 (revised) — Create crm_budget_forecasts if missing,
-- and add monthly_qty so Arbejdsbudget round-trips per month exactly.
-- Idempotent: safe to run multiple times.

create table if not exists public.crm_budget_lines (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  product_key text not null,
  product_name text not null,
  item_number text,
  category text not null check (category in ('machine','attachment','service','other')),
  parent_machine_key text,
  seller_id uuid,
  seller_name text,
  seller_email text,
  seller_initials text,
  country text,
  qty_budget numeric not null default 0,
  value_budget numeric not null default 0,
  monthly_split jsonb not null default
    '[0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0837]'::jsonb,
  notes text,
  locked boolean not null default false,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_budget_lines_year   on public.crm_budget_lines(year);
create index if not exists idx_crm_budget_lines_seller on public.crm_budget_lines(seller_id);

create table if not exists public.crm_budget_forecasts (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null
    references public.crm_budget_lines(id) on delete cascade,
  qty_forecast numeric not null default 0,
  value_forecast numeric not null default 0,
  comments text,
  expected_timing text,
  risk_level text check (risk_level in ('low','medium','high')),
  probability int check (probability between 0 and 100),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_budget_forecasts_budget_line_id_key'
  ) then
    alter table public.crm_budget_forecasts
      add constraint crm_budget_forecasts_budget_line_id_key
      unique (budget_line_id);
  end if;
end$$;

alter table public.crm_budget_forecasts
  add column if not exists monthly_qty integer[];

alter table public.crm_budget_forecasts
  drop constraint if exists crm_budget_forecasts_monthly_qty_len;
alter table public.crm_budget_forecasts
  add constraint crm_budget_forecasts_monthly_qty_len
  check (monthly_qty is null or array_length(monthly_qty, 1) = 12);

comment on column public.crm_budget_forecasts.monthly_qty is
  'Per-month Arbejdsbudget quantities (length 12, Jan..Dec). When present, the UI uses these values verbatim and does NOT redistribute qty_forecast across monthly_split.';

alter table public.crm_budget_lines     enable row level security;
alter table public.crm_budget_forecasts enable row level security;

drop policy if exists "crm_budget_lines auth read"   on public.crm_budget_lines;
drop policy if exists "crm_budget_lines auth write"  on public.crm_budget_lines;
create policy "crm_budget_lines auth read"
  on public.crm_budget_lines for select to authenticated using (true);
create policy "crm_budget_lines auth write"
  on public.crm_budget_lines for all    to authenticated using (true) with check (true);

drop policy if exists "crm_budget_forecasts auth read"  on public.crm_budget_forecasts;
drop policy if exists "crm_budget_forecasts auth write" on public.crm_budget_forecasts;
create policy "crm_budget_forecasts auth read"
  on public.crm_budget_forecasts for select to authenticated using (true);
create policy "crm_budget_forecasts auth write"
  on public.crm_budget_forecasts for all    to authenticated using (true) with check (true);
