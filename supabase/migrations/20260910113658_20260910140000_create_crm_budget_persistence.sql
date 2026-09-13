-- Establish the live persistence layer used by CRM Budget. The page already
-- treats these tables as canonical; until now they only existed in local docs.

create or replace function public.is_timan_budget_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.portal_role in ('timan_backend', 'timan_seller')
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

create or replace function public.is_timan_budget_seller(target_seller_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.portal_role = 'timan_seller'
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, false) = true
      and lower(trim(au.email)) = lower(trim(coalesce(target_seller_email, '')))
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

revoke all on function public.is_timan_budget_user() from public;
revoke all on function public.is_timan_budget_seller(text) from public;
grant execute on function public.is_timan_budget_user() to authenticated;
grant execute on function public.is_timan_budget_seller(text) to authenticated;

create table if not exists public.crm_budget_lines (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  product_key text not null,
  product_name text not null,
  item_number text,
  category text not null check (category in ('machine', 'attachment', 'service', 'other')),
  parent_machine_key text,
  seller_id uuid,
  seller_name text,
  seller_email text not null,
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

create index if not exists idx_crm_budget_lines_year on public.crm_budget_lines(year);
create index if not exists idx_crm_budget_lines_seller on public.crm_budget_lines(lower(seller_email));
create unique index if not exists uq_crm_budget_lines_scope
  on public.crm_budget_lines(year, lower(seller_email), product_key);

create table if not exists public.crm_budget_forecasts (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null references public.crm_budget_lines(id) on delete cascade,
  qty_forecast numeric not null default 0,
  value_forecast numeric not null default 0,
  comments text,
  expected_timing text,
  risk_level text check (risk_level in ('low', 'medium', 'high')),
  probability integer check (probability between 0 and 100),
  monthly_qty integer[] check (monthly_qty is null or array_length(monthly_qty, 1) = 12),
  updated_at timestamptz not null default now(),
  unique (budget_line_id)
);

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
  constraint budget_access_windows_seller_required check (scope = 'all' or seller_email is not null)
);

create index if not exists budget_access_windows_year_idx on public.budget_access_windows(budget_year);
create index if not exists budget_access_windows_open_idx on public.budget_access_windows(status, open_from, open_until);
create index if not exists budget_access_windows_seller_idx on public.budget_access_windows(lower(seller_email));

alter table public.crm_budget_lines enable row level security;
alter table public.crm_budget_forecasts enable row level security;
alter table public.budget_access_windows enable row level security;

drop policy if exists "crm_budget_lines_select" on public.crm_budget_lines;
drop policy if exists "crm_budget_lines_insert" on public.crm_budget_lines;
drop policy if exists "crm_budget_lines_update" on public.crm_budget_lines;
drop policy if exists "crm_budget_lines_delete" on public.crm_budget_lines;
create policy "crm_budget_lines_select" on public.crm_budget_lines for select to authenticated
  using (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));
create policy "crm_budget_lines_insert" on public.crm_budget_lines for insert to authenticated
  with check (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));
create policy "crm_budget_lines_update" on public.crm_budget_lines for update to authenticated
  using (public.is_timan_backend() or public.is_timan_budget_seller(seller_email))
  with check (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));
create policy "crm_budget_lines_delete" on public.crm_budget_lines for delete to authenticated
  using (public.is_timan_backend());

drop policy if exists "crm_budget_forecasts_select" on public.crm_budget_forecasts;
drop policy if exists "crm_budget_forecasts_insert" on public.crm_budget_forecasts;
drop policy if exists "crm_budget_forecasts_update" on public.crm_budget_forecasts;
drop policy if exists "crm_budget_forecasts_delete" on public.crm_budget_forecasts;
create policy "crm_budget_forecasts_select" on public.crm_budget_forecasts for select to authenticated
  using (exists (
    select 1 from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));
create policy "crm_budget_forecasts_insert" on public.crm_budget_forecasts for insert to authenticated
  with check (exists (
    select 1 from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));
create policy "crm_budget_forecasts_update" on public.crm_budget_forecasts for update to authenticated
  using (exists (
    select 1 from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ))
  with check (exists (
    select 1 from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));
create policy "crm_budget_forecasts_delete" on public.crm_budget_forecasts for delete to authenticated
  using (public.is_timan_backend());

drop policy if exists "budget_access_windows_select" on public.budget_access_windows;
drop policy if exists "budget_access_windows_insert" on public.budget_access_windows;
drop policy if exists "budget_access_windows_update" on public.budget_access_windows;
create policy "budget_access_windows_select" on public.budget_access_windows for select to authenticated
  using (public.is_timan_budget_user());
create policy "budget_access_windows_insert" on public.budget_access_windows for insert to authenticated
  with check (public.is_timan_backend());
create policy "budget_access_windows_update" on public.budget_access_windows for update to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

grant select, insert, update, delete on public.crm_budget_lines to authenticated;
grant select, insert, update, delete on public.crm_budget_forecasts to authenticated;
grant select, insert, update on public.budget_access_windows to authenticated;;
