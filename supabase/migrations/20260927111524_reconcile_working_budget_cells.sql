-- Track initialization at the same granularity as the editable working
-- budget. A forecast row is an aggregate and must never imply that every
-- month for the seller/year was intentionally initialized.
create table if not exists public.crm_working_budget_initialized_cells (
  budget_line_id uuid not null references public.crm_budget_lines(id) on delete cascade,
  month_idx integer not null check (month_idx between 0 and 11),
  baseline_qty integer not null check (baseline_qty >= 0),
  initialized_at timestamptz not null default now(),
  primary key (budget_line_id, month_idx)
);

alter table public.crm_working_budget_initialized_cells enable row level security;

revoke all on table public.crm_working_budget_initialized_cells from anon;
grant select, insert, update on table public.crm_working_budget_initialized_cells to authenticated;

drop policy if exists crm_working_budget_initialized_cells_select
  on public.crm_working_budget_initialized_cells;
create policy crm_working_budget_initialized_cells_select
  on public.crm_working_budget_initialized_cells
  for select to authenticated
  using (exists (
    select 1
    from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));

drop policy if exists crm_working_budget_initialized_cells_insert
  on public.crm_working_budget_initialized_cells;
create policy crm_working_budget_initialized_cells_insert
  on public.crm_working_budget_initialized_cells
  for insert to authenticated
  with check (exists (
    select 1
    from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));

drop policy if exists crm_working_budget_initialized_cells_update
  on public.crm_working_budget_initialized_cells;
create policy crm_working_budget_initialized_cells_update
  on public.crm_working_budget_initialized_cells
  for update to authenticated
  using (exists (
    select 1
    from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ))
  with check (exists (
    select 1
    from public.crm_budget_lines line
    where line.id = budget_line_id
      and (public.is_timan_backend() or public.is_timan_budget_seller(line.seller_email))
  ));

create or replace function public.initialize_crm_working_budget_from_original(
  p_year integer,
  p_seller_email text
)
returns table(status text, seeded_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_seller_email text := lower(trim(coalesce(p_seller_email, '')));
  v_seller_initials text;
  v_existing_forecast_count integer := 0;
  v_expected_product_count integer := 0;
  v_initialized_cell_count integer := 0;
  v_ambiguous_cell_count integer := 0;
  v_ambiguous_reference_count integer := 0;
  v_seeded_count integer := 0;
  v_result_status text := 'seeded';
begin
  if p_year is null or v_seller_email = '' then
    raise exception 'Budget year and seller email are required';
  end if;

  if not (
    public.is_timan_backend()
    or public.is_timan_budget_seller(v_seller_email)
  ) then
    raise exception 'Not authorized for this working-budget scope';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_year::text || ':' || v_seller_email, 0)
  );

  select upper(max(scope.seller_initials))
  into v_seller_initials
  from (
    select line.seller_initials
    from public.crm_budget_lines line
    where line.year = p_year and lower(line.seller_email) = v_seller_email
    union all
    select dealer.seller_initials
    from public.crm_budget_dealer_lines dealer
    where dealer.year = p_year and lower(dealer.seller_email) = v_seller_email
  ) scope;

  -- Imported allocations may exist before their planning line. Add only the
  -- canonical shell; the allocation rows remain the original-budget source.
  insert into public.crm_budget_lines (
    year, product_key, product_name, item_number, category,
    parent_machine_key, seller_id, seller_name, seller_email,
    seller_initials, country, qty_budget, value_budget, monthly_split,
    notes, locked
  )
  select
    p_year,
    dealer.product_key,
    coalesce(max(dealer.product_name), dealer.product_key),
    max(dealer.item_number),
    case when dealer.product_key like '%::%' then 'attachment' else 'machine' end,
    case when dealer.product_key like '%::%' then split_part(dealer.product_key, '::', 1) else null end,
    min(dealer.seller_id::text)::uuid,
    max(dealer.seller_name),
    v_seller_email,
    max(dealer.seller_initials),
    null,
    0,
    0,
    '[0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0837]'::jsonb,
    null,
    false
  from public.crm_budget_dealer_lines dealer
  where dealer.year = p_year
    and lower(dealer.seller_email) = v_seller_email
    and not dealer.excluded_from_total
  group by dealer.product_key
  on conflict do nothing;

  select count(*)
  into v_expected_product_count
  from public.crm_budget_lines line
  where line.year = p_year
    and lower(line.seller_email) = v_seller_email
    and (
      line.qty_budget > 0
      or exists (
        select 1
        from public.crm_budget_dealer_lines dealer
        where dealer.year = p_year
          and lower(dealer.seller_email) = v_seller_email
          and dealer.product_key = line.product_key
          and not dealer.excluded_from_total
          and dealer.qty > 0
      )
    );

  if v_expected_product_count = 0 then
    return query select 'no_original_budget'::text, 0;
    return;
  end if;

  select count(distinct forecast.budget_line_id)
  into v_existing_forecast_count
  from public.crm_budget_forecasts forecast
  join public.crm_budget_lines line on line.id = forecast.budget_line_id
  where line.year = p_year
    and lower(line.seller_email) = v_seller_email;

  select count(*)
  into v_initialized_cell_count
  from public.crm_working_budget_initialized_cells initialized
  join public.crm_budget_lines line on line.id = initialized.budget_line_id
  where line.year = p_year
    and lower(line.seller_email) = v_seller_email;

  -- Existing complete budgets predate cell provenance. Backfill markers only;
  -- never recalculate their saved values.
  if v_initialized_cell_count = 0
    and v_existing_forecast_count >= v_expected_product_count
  then
    insert into public.crm_working_budget_initialized_cells (
      budget_line_id, month_idx, baseline_qty
    )
    select line.id, months.month_idx, 0
    from public.crm_budget_lines line
    cross join generate_series(0, 11) as months(month_idx)
    where line.year = p_year
      and lower(line.seller_email) = v_seller_email
      and exists (
        select 1 from public.crm_budget_forecasts forecast
        where forecast.budget_line_id = line.id
      )
    on conflict do nothing;

    return query select 'already_initialized'::text, 0;
    return;
  end if;

  -- A reference without matching audit provenance is intentionally treated
  -- as ambiguous. It may represent an explicit zero and must not be guessed.
  select count(*)
  into v_ambiguous_reference_count
  from public.budget_references reference
  where reference.budget_year = p_year
    and lower(coalesce(reference.seller_email, '')) = v_seller_email
    and reference.budget_type = 'arbejdsbudget'
    and not exists (
      select 1
      from public.audit_log audit
      where audit.module = 'Budget'
        and audit.record_type = 'crm_budget'
        and audit.status = 'success'
        and audit.new_value ->> 'budget_type' = 'arbejdsbudget'
        and audit.new_value ->> 'year' = p_year::text
        and audit.new_value ->> 'month_idx' = reference.month_idx::text
        and (
          audit.new_value ->> 'item_number' = reference.product_code
          or audit.new_value ->> 'product_key' = reference.product_code
        )
        and (
          lower(coalesce(audit.seller_context, '')) = v_seller_email
          or upper(coalesce(audit.new_value ->> 'seller_initials', '')) = v_seller_initials
        )
    );

  if v_ambiguous_reference_count > 0 then
    return query select 'ambiguous_reference_history'::text, 0;
    return;
  end if;

  -- A non-zero legacy value that differs from the original baseline and has
  -- no matching audit evidence cannot safely be classified as initialized or
  -- missing. Zeroes without audit are the known partial-initialization shape.
  with scoped_lines as (
    select line.*,
           greatest(0, round(line.qty_budget))::integer as integer_budget,
           greatest(
             line.created_at,
             coalesce((
               select max(coalesce(dealer.imported_at, dealer.created_at))
               from public.crm_budget_dealer_lines dealer
               where dealer.year = p_year
                 and lower(dealer.seller_email) = v_seller_email
                 and dealer.product_key = line.product_key
                 and not dealer.excluded_from_total
             ), line.created_at)
           ) as baseline_at
    from public.crm_budget_lines line
    where line.year = p_year
      and lower(line.seller_email) = v_seller_email
  ),
  manual_raw as (
    select line.id, months.month_idx, line.integer_budget, line.baseline_at,
           line.integer_budget * coalesce(
             nullif(line.monthly_split ->> months.month_idx, '')::numeric,
             1::numeric / 12
           ) as raw_qty
    from scoped_lines line
    cross join generate_series(0, 11) as months(month_idx)
  ),
  manual_ranked as (
    select raw.*,
           floor(raw.raw_qty)::integer as floor_qty,
           row_number() over (
             partition by raw.id
             order by (raw.raw_qty - floor(raw.raw_qty)) desc, raw.month_idx asc
           ) as fraction_rank,
           raw.integer_budget - sum(floor(raw.raw_qty)::integer) over (partition by raw.id) as remainder
    from manual_raw raw
  ),
  baseline as (
    select line.id, line.product_key, line.item_number, ranked.month_idx, ranked.baseline_at,
           case when dealer.has_dealer_budget then dealer.dealer_qty
             else ranked.floor_qty + case when ranked.fraction_rank <= ranked.remainder then 1 else 0 end
           end::integer as baseline_qty
    from manual_ranked ranked
    join scoped_lines line on line.id = ranked.id
    left join lateral (
      select count(*) > 0 as has_dealer_budget,
             coalesce(sum(dealer.qty), 0)::integer as dealer_qty
      from public.crm_budget_dealer_lines dealer
      where dealer.year = p_year
        and lower(dealer.seller_email) = v_seller_email
        and dealer.product_key = line.product_key
        and dealer.month_idx = ranked.month_idx
        and not dealer.excluded_from_total
        and dealer.qty > 0
    ) dealer on true
  ),
  audit_deltas as (
    select baseline.id, baseline.month_idx,
           count(audit.id)::integer as audit_count,
           coalesce(sum(
             coalesce((audit.new_value ->> 'value')::integer, 0)
             - coalesce((audit.old_value ->> 'value')::integer, 0)
           ), 0)::integer as edit_delta
    from baseline
    left join public.audit_log audit
      on audit.module = 'Budget'
     and audit.record_type = 'crm_budget'
     and audit.status = 'success'
     and audit.new_value ->> 'budget_type' = 'arbejdsbudget'
     and audit.new_value ->> 'year' = p_year::text
     and audit.new_value ->> 'month_idx' = baseline.month_idx::text
     and (
       audit.new_value ->> 'product_key' = baseline.product_key
       or audit.new_value ->> 'item_number' = baseline.item_number
     )
     and (
       lower(coalesce(audit.seller_context, '')) = v_seller_email
       or upper(coalesce(audit.new_value ->> 'seller_initials', '')) = v_seller_initials
     )
     and audit.created_at >= baseline.baseline_at
    group by baseline.id, baseline.month_idx
  )
  select count(*)
  into v_ambiguous_cell_count
  from baseline
  join audit_deltas audit
    on audit.id = baseline.id and audit.month_idx = baseline.month_idx
  join public.crm_budget_forecasts forecast on forecast.budget_line_id = baseline.id
  left join public.crm_working_budget_initialized_cells initialized
    on initialized.budget_line_id = baseline.id and initialized.month_idx = baseline.month_idx
  where initialized.budget_line_id is null
    and coalesce(forecast.monthly_qty[baseline.month_idx + 1], 0) <> 0
    and coalesce(forecast.monthly_qty[baseline.month_idx + 1], 0)
      <> greatest(0, baseline.baseline_qty + audit.edit_delta)
    and audit.audit_count = 0;

  if v_ambiguous_cell_count > 0 then
    return query select 'ambiguous_partial_forecast'::text, 0;
    return;
  end if;

  v_result_status := case when v_existing_forecast_count > 0 then 'reconciled' else 'seeded' end;

  with scoped_lines as (
    select line.*,
           greatest(0, round(line.qty_budget))::integer as integer_budget,
           greatest(
             line.created_at,
             coalesce((
               select max(coalesce(dealer.imported_at, dealer.created_at))
               from public.crm_budget_dealer_lines dealer
               where dealer.year = p_year
                 and lower(dealer.seller_email) = v_seller_email
                 and dealer.product_key = line.product_key
                 and not dealer.excluded_from_total
             ), line.created_at)
           ) as baseline_at
    from public.crm_budget_lines line
    where line.year = p_year
      and lower(line.seller_email) = v_seller_email
  ),
  manual_raw as (
    select line.id, months.month_idx, line.integer_budget, line.baseline_at,
           line.qty_budget, line.value_budget, line.product_key, line.item_number,
           line.integer_budget * coalesce(
             nullif(line.monthly_split ->> months.month_idx, '')::numeric,
             1::numeric / 12
           ) as raw_qty
    from scoped_lines line
    cross join generate_series(0, 11) as months(month_idx)
  ),
  manual_ranked as (
    select raw.*,
           floor(raw.raw_qty)::integer as floor_qty,
           row_number() over (
             partition by raw.id
             order by (raw.raw_qty - floor(raw.raw_qty)) desc, raw.month_idx asc
           ) as fraction_rank,
           raw.integer_budget - sum(floor(raw.raw_qty)::integer) over (partition by raw.id) as remainder
    from manual_raw raw
  ),
  baseline as (
    select ranked.id, ranked.product_key, ranked.item_number, ranked.month_idx,
           ranked.baseline_at, ranked.qty_budget, ranked.value_budget,
           case when dealer.has_dealer_budget then dealer.dealer_qty
             else ranked.floor_qty + case when ranked.fraction_rank <= ranked.remainder then 1 else 0 end
           end::integer as baseline_qty
    from manual_ranked ranked
    left join lateral (
      select count(*) > 0 as has_dealer_budget,
             coalesce(sum(dealer.qty), 0)::integer as dealer_qty
      from public.crm_budget_dealer_lines dealer
      where dealer.year = p_year
        and lower(dealer.seller_email) = v_seller_email
        and dealer.product_key = ranked.product_key
        and dealer.month_idx = ranked.month_idx
        and not dealer.excluded_from_total
        and dealer.qty > 0
    ) dealer on true
  ),
  audit_deltas as (
    select baseline.id, baseline.month_idx,
           coalesce(sum(
             coalesce((audit.new_value ->> 'value')::integer, 0)
             - coalesce((audit.old_value ->> 'value')::integer, 0)
           ), 0)::integer as edit_delta
    from baseline
    left join public.audit_log audit
      on audit.module = 'Budget'
     and audit.record_type = 'crm_budget'
     and audit.status = 'success'
     and audit.new_value ->> 'budget_type' = 'arbejdsbudget'
     and audit.new_value ->> 'year' = p_year::text
     and audit.new_value ->> 'month_idx' = baseline.month_idx::text
     and (
       audit.new_value ->> 'product_key' = baseline.product_key
       or audit.new_value ->> 'item_number' = baseline.item_number
     )
     and (
       lower(coalesce(audit.seller_context, '')) = v_seller_email
       or upper(coalesce(audit.new_value ->> 'seller_initials', '')) = v_seller_initials
     )
     and audit.created_at >= baseline.baseline_at
    group by baseline.id, baseline.month_idx
  ),
  desired_cells as (
    select baseline.*,
           case when initialized.budget_line_id is not null
             then coalesce(forecast.monthly_qty[baseline.month_idx + 1], 0)
             else greatest(0, baseline.baseline_qty + audit.edit_delta)
           end::integer as desired_qty
    from baseline
    join audit_deltas audit
      on audit.id = baseline.id and audit.month_idx = baseline.month_idx
    left join public.crm_budget_forecasts forecast on forecast.budget_line_id = baseline.id
    left join public.crm_working_budget_initialized_cells initialized
      on initialized.budget_line_id = baseline.id and initialized.month_idx = baseline.month_idx
  ),
  resolved as (
    select cell.id,
           array_agg(cell.desired_qty order by cell.month_idx) as monthly_qty,
           sum(cell.desired_qty)::numeric as qty_forecast,
           max(cell.qty_budget) as qty_budget,
           max(cell.value_budget) as value_budget
    from desired_cells cell
    group by cell.id
  )
  insert into public.crm_budget_forecasts (
    budget_line_id, qty_forecast, value_forecast, monthly_qty, updated_at
  )
  select resolved.id, resolved.qty_forecast,
         case
           when existing.qty_forecast > 0
             then round(resolved.qty_forecast * existing.value_forecast / existing.qty_forecast)
           when resolved.qty_budget > 0
             then round(resolved.qty_forecast * resolved.value_budget / resolved.qty_budget)
           else 0
         end,
         resolved.monthly_qty, now()
  from resolved
  left join public.crm_budget_forecasts existing on existing.budget_line_id = resolved.id
  on conflict (budget_line_id) do update
    set qty_forecast = excluded.qty_forecast,
        value_forecast = excluded.value_forecast,
        monthly_qty = excluded.monthly_qty,
        updated_at = excluded.updated_at;

  with scoped_lines as (
    select line.*,
           greatest(0, round(line.qty_budget))::integer as integer_budget
    from public.crm_budget_lines line
    where line.year = p_year and lower(line.seller_email) = v_seller_email
  ),
  manual_raw as (
    select line.id, months.month_idx, line.integer_budget,
           line.integer_budget * coalesce(
             nullif(line.monthly_split ->> months.month_idx, '')::numeric,
             1::numeric / 12
           ) as raw_qty
    from scoped_lines line cross join generate_series(0, 11) as months(month_idx)
  ),
  manual_ranked as (
    select raw.*, floor(raw.raw_qty)::integer floor_qty,
           row_number() over (
             partition by raw.id order by (raw.raw_qty - floor(raw.raw_qty)) desc, raw.month_idx asc
           ) fraction_rank,
           raw.integer_budget - sum(floor(raw.raw_qty)::integer) over (partition by raw.id) remainder
    from manual_raw raw
  ),
  baseline as (
    select line.id, ranked.month_idx,
           case when dealer.has_dealer_budget then dealer.dealer_qty
             else ranked.floor_qty + case when ranked.fraction_rank <= ranked.remainder then 1 else 0 end
           end::integer baseline_qty
    from manual_ranked ranked
    join scoped_lines line on line.id = ranked.id
    left join lateral (
      select count(*) > 0 has_dealer_budget, coalesce(sum(dealer.qty), 0)::integer dealer_qty
      from public.crm_budget_dealer_lines dealer
      where dealer.year = p_year
        and lower(dealer.seller_email) = v_seller_email
        and dealer.product_key = line.product_key
        and dealer.month_idx = ranked.month_idx
        and not dealer.excluded_from_total and dealer.qty > 0
    ) dealer on true
  )
  insert into public.crm_working_budget_initialized_cells (
    budget_line_id, month_idx, baseline_qty
  )
  select baseline.id, baseline.month_idx, baseline.baseline_qty
  from baseline
  join public.crm_budget_forecasts forecast on forecast.budget_line_id = baseline.id
  on conflict do nothing;

  get diagnostics v_seeded_count = row_count;
  return query select v_result_status, v_seeded_count;
end;
$$;

revoke all on function public.initialize_crm_working_budget_from_original(integer, text) from public;
revoke all on function public.initialize_crm_working_budget_from_original(integer, text) from anon;
grant execute on function public.initialize_crm_working_budget_from_original(integer, text) to authenticated;

-- Targeted repair for the proven JTN 2026/27 legacy partial state. The values
-- are derived from original dealer allocations plus post-import audit deltas;
-- no annual or monthly quantity is hardcoded.
do $$
declare
  v_email constant text := 'jtn@timan.dk';
  v_year constant integer := 2026;
  v_original_total integer;
  v_current_total integer;
  v_valid_edit_count integer;
  v_ambiguous_count integer;
begin
  select coalesce(sum(dealer.qty), 0)::integer, max(coalesce(forecast_total.total, 0))::integer
  into v_original_total, v_current_total
  from public.crm_budget_dealer_lines dealer
  cross join lateral (
    select coalesce(sum(forecast.qty_forecast), 0)::integer total
    from public.crm_budget_lines line
    left join public.crm_budget_forecasts forecast on forecast.budget_line_id = line.id
    where line.year = v_year and lower(line.seller_email) = v_email
  ) forecast_total
  where dealer.year = v_year and lower(dealer.seller_email) = v_email
    and not dealer.excluded_from_total and dealer.qty > 0;

  select count(*) into v_valid_edit_count
  from public.audit_log audit
  where audit.module = 'Budget' and audit.record_type = 'crm_budget' and audit.status = 'success'
    and audit.new_value ->> 'budget_type' = 'arbejdsbudget'
    and audit.new_value ->> 'year' = v_year::text
    and lower(coalesce(audit.seller_context, '')) = v_email
    and audit.created_at >= (
      select max(coalesce(dealer.imported_at, dealer.created_at))
      from public.crm_budget_dealer_lines dealer
      where dealer.year = v_year and lower(dealer.seller_email) = v_email
        and not dealer.excluded_from_total
    );

  select count(*) into v_ambiguous_count
  from public.budget_references reference
  where reference.budget_year = v_year
    and lower(coalesce(reference.seller_email, '')) = v_email
    and reference.budget_type = 'arbejdsbudget';

  if v_original_total <> 74 or v_current_total <> 1
    or v_valid_edit_count <> 1 or v_ambiguous_count <> 0
  then
    raise exception 'JTN working-budget reconciliation guard failed (original %, current %, edits %, references %)',
      v_original_total, v_current_total, v_valid_edit_count, v_ambiguous_count;
  end if;

  insert into public.crm_budget_lines (
    year, product_key, product_name, item_number, category,
    parent_machine_key, seller_id, seller_name, seller_email,
    seller_initials, country, qty_budget, value_budget, monthly_split,
    notes, locked
  )
  select v_year, dealer.product_key, coalesce(max(dealer.product_name), dealer.product_key),
         max(dealer.item_number),
         case when dealer.product_key like '%::%' then 'attachment' else 'machine' end,
         case when dealer.product_key like '%::%' then split_part(dealer.product_key, '::', 1) else null end,
         min(dealer.seller_id::text)::uuid, max(dealer.seller_name), v_email,
         max(dealer.seller_initials), null, 0, 0,
         '[0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0837]'::jsonb,
         null, false
  from public.crm_budget_dealer_lines dealer
  where dealer.year = v_year and lower(dealer.seller_email) = v_email
    and not dealer.excluded_from_total
  group by dealer.product_key
  on conflict do nothing;

  with baseline as (
    select line.id, line.product_key, line.item_number, months.month_idx,
           coalesce(sum(dealer.qty) filter (
             where not dealer.excluded_from_total and dealer.qty > 0
           ), 0)::integer baseline_qty,
           greatest(line.created_at, coalesce(max(coalesce(dealer.imported_at, dealer.created_at)), line.created_at)) baseline_at
    from public.crm_budget_lines line
    cross join generate_series(0, 11) as months(month_idx)
    left join public.crm_budget_dealer_lines dealer
      on dealer.year = v_year and lower(dealer.seller_email) = v_email
     and dealer.product_key = line.product_key and dealer.month_idx = months.month_idx
    where line.year = v_year and lower(line.seller_email) = v_email
    group by line.id, line.product_key, line.item_number, line.created_at, months.month_idx
  ),
  audit_deltas as (
    select baseline.id, baseline.month_idx,
           coalesce(sum(
             coalesce((audit.new_value ->> 'value')::integer, 0)
             - coalesce((audit.old_value ->> 'value')::integer, 0)
           ), 0)::integer edit_delta
    from baseline
    left join public.audit_log audit
      on audit.module = 'Budget' and audit.record_type = 'crm_budget' and audit.status = 'success'
     and audit.new_value ->> 'budget_type' = 'arbejdsbudget'
     and audit.new_value ->> 'year' = v_year::text
     and audit.new_value ->> 'month_idx' = baseline.month_idx::text
     and (audit.new_value ->> 'product_key' = baseline.product_key
       or audit.new_value ->> 'item_number' = baseline.item_number)
     and lower(coalesce(audit.seller_context, '')) = v_email
     and audit.created_at >= baseline.baseline_at
    group by baseline.id, baseline.month_idx
  ),
  resolved as (
    select baseline.id,
           array_agg(greatest(0, baseline.baseline_qty + audit.edit_delta) order by baseline.month_idx) monthly_qty,
           sum(greatest(0, baseline.baseline_qty + audit.edit_delta))::numeric qty_forecast
    from baseline join audit_deltas audit
      on audit.id = baseline.id and audit.month_idx = baseline.month_idx
    group by baseline.id
  )
  insert into public.crm_budget_forecasts (
    budget_line_id, qty_forecast, value_forecast, monthly_qty, updated_at
  )
  select resolved.id, resolved.qty_forecast,
         case when existing.qty_forecast > 0
           then round(resolved.qty_forecast * existing.value_forecast / existing.qty_forecast)
           else 0 end,
         resolved.monthly_qty, now()
  from resolved
  left join public.crm_budget_forecasts existing on existing.budget_line_id = resolved.id
  on conflict (budget_line_id) do update
    set qty_forecast = excluded.qty_forecast,
        value_forecast = excluded.value_forecast,
        monthly_qty = excluded.monthly_qty,
        updated_at = excluded.updated_at;

  insert into public.crm_working_budget_initialized_cells (
    budget_line_id, month_idx, baseline_qty
  )
  select line.id, months.month_idx,
         coalesce(sum(dealer.qty) filter (
           where not dealer.excluded_from_total and dealer.qty > 0
         ), 0)::integer
  from public.crm_budget_lines line
  cross join generate_series(0, 11) as months(month_idx)
  left join public.crm_budget_dealer_lines dealer
    on dealer.year = v_year and lower(dealer.seller_email) = v_email
   and dealer.product_key = line.product_key and dealer.month_idx = months.month_idx
  where line.year = v_year and lower(line.seller_email) = v_email
  group by line.id, months.month_idx
  on conflict do nothing;
end;
$$;
