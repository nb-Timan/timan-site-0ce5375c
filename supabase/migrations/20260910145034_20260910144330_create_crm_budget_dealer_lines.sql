-- Dealer-attributed CRM Budget rows for fiscal-year seed imports and future
-- dealer dashboards. This table complements crm_budget_lines; it does not
-- write, aggregate, or alter existing budget data.
create table public.crm_budget_dealer_lines (
  id uuid primary key default gen_random_uuid(),

  -- `year` is the fiscal-year start, e.g. 2026 for FY 2026/27.
  year integer not null,
  -- Uses the portal's existing calendar-month index: Jan = 0 ... Dec = 11.
  month_idx integer not null check (month_idx between 0 and 11),

  seller_id uuid references public.app_users(id) on delete set null,
  seller_name text,
  seller_email text not null check (btrim(seller_email) <> ''),
  seller_initials text,

  -- Imports must use dealer_account_id. The name fallback preserves the
  -- existing service contract for non-imported, manually created rows.
  dealer_account_id uuid references public.dealer_accounts(id) on delete restrict,
  dealer_account_number text,
  dealer_name text,
  dealer_name_norm text,

  product_key text not null check (btrim(product_key) <> ''),
  product_name text,
  item_number text,
  qty integer not null check (qty >= 0),
  excluded_from_total boolean not null default false,

  -- Source metadata makes the FY 2026/27 seed auditable and idempotent.
  import_source text,
  import_batch_id text,
  imported_at timestamptz,
  imported_by text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dealer_account_id is not null or dealer_name_norm is not null)
);

create index idx_crm_budget_dealer_lines_year_seller
  on public.crm_budget_dealer_lines (year, lower(seller_email));

create index idx_crm_budget_dealer_lines_dealer_year
  on public.crm_budget_dealer_lines (dealer_account_id, year)
  where dealer_account_id is not null;

create index idx_crm_budget_dealer_lines_import_batch
  on public.crm_budget_dealer_lines (import_batch_id)
  where import_batch_id is not null;

-- One canonical dealer allocation per seller, month and product. This lets a
-- re-run of the approved import update the same row instead of adding a copy.
create unique index ux_crm_budget_dealer_lines_identity_account
  on public.crm_budget_dealer_lines
    (year, month_idx, lower(seller_email), dealer_account_id, product_key)
  where dealer_account_id is not null;

create unique index ux_crm_budget_dealer_lines_identity_name
  on public.crm_budget_dealer_lines
    (year, month_idx, lower(seller_email), dealer_name_norm, product_key)
  where dealer_account_id is null;

create trigger crm_budget_dealer_lines_set_updated_at
  before update on public.crm_budget_dealer_lines
  for each row execute function public.set_updated_at();

alter table public.crm_budget_dealer_lines enable row level security;

create policy "crm_budget_dealer_lines_select"
  on public.crm_budget_dealer_lines
  for select to authenticated
  using (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));

create policy "crm_budget_dealer_lines_insert"
  on public.crm_budget_dealer_lines
  for insert to authenticated
  with check (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));

create policy "crm_budget_dealer_lines_update"
  on public.crm_budget_dealer_lines
  for update to authenticated
  using (public.is_timan_backend() or public.is_timan_budget_seller(seller_email))
  with check (public.is_timan_backend() or public.is_timan_budget_seller(seller_email));

create policy "crm_budget_dealer_lines_delete"
  on public.crm_budget_dealer_lines
  for delete to authenticated
  using (public.is_timan_backend());

grant select, insert, update, delete on public.crm_budget_dealer_lines to authenticated;;
