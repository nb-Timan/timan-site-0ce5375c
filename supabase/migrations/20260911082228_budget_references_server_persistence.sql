create table public.budget_references (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cell_key text not null,
  budget_year integer not null,
  seller_initials text,
  seller_email text,
  product_code text,
  model_name text,
  category text,
  month text,
  month_idx integer,
  budget_type text not null check (budget_type in ('budget', 'arbejdsbudget')),
  old_value numeric,
  new_value numeric,
  dealer_name text,
  dealer_account_number text,
  contact_name text,
  lead_id uuid,
  demo_id uuid,
  note text,
  created_by_email text,
  created_by_name text,
  delta_qty integer check (delta_qty is null or delta_qty >= 0),
  reference_group_id text
);

create index budget_references_cell_scope_idx
  on public.budget_references (cell_key, budget_year, budget_type, created_at desc);

create index budget_references_seller_scope_idx
  on public.budget_references (seller_email, budget_year, created_at desc);

create index budget_references_group_idx
  on public.budget_references (reference_group_id)
  where reference_group_id is not null;

alter table public.budget_references enable row level security;

revoke all on table public.budget_references from anon;
grant select, insert, update, delete on table public.budget_references to authenticated;

create policy budget_references_select
  on public.budget_references
  for select
  to authenticated
  using (
    (select public.is_timan_backend())
    or (select public.is_timan_budget_seller(seller_email))
  );

create policy budget_references_insert
  on public.budget_references
  for insert
  to authenticated
  with check (
    (select public.is_timan_backend())
    or (select public.is_timan_budget_seller(seller_email))
  );

create policy budget_references_update
  on public.budget_references
  for update
  to authenticated
  using (
    (select public.is_timan_backend())
    or (select public.is_timan_budget_seller(seller_email))
  )
  with check (
    (select public.is_timan_backend())
    or (select public.is_timan_budget_seller(seller_email))
  );

create policy budget_references_delete
  on public.budget_references
  for delete
  to authenticated
  using (
    (select public.is_timan_backend())
    or (select public.is_timan_budget_seller(seller_email))
  );
