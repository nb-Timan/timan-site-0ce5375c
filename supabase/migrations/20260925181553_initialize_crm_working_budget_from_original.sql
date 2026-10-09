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
  v_seeded_count integer := 0;
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

  -- Serialize initialization per seller/year. This prevents two page loads
  -- from racing and ensures a manual edit can never be overwritten by seed.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_year::text || ':' || v_seller_email, 0)
  );

  -- Any persisted forecast means this seller/year is already initialized.
  -- This deliberately protects partially edited years as well.
  if exists (
    select 1
    from public.crm_budget_forecasts forecast
    join public.crm_budget_lines line on line.id = forecast.budget_line_id
    where line.year = p_year
      and lower(line.seller_email) = v_seller_email
  ) then
    return query select 'already_initialized'::text, 0;
    return;
  end if;

  -- A historical work-budget reference without a forecast is ambiguous.
  -- Preserve it instead of guessing that zero means uninitialized.
  if exists (
    select 1
    from public.budget_references reference
    where reference.budget_year = p_year
      and lower(coalesce(reference.seller_email, '')) = v_seller_email
      and reference.budget_type = 'arbejdsbudget'
  ) then
    return query select 'ambiguous_reference_history'::text, 0;
    return;
  end if;

  -- Imported dealer budgets can exist before a crm_budget_lines planning row.
  -- Create only the canonical seller/year/product shell; dealer allocations
  -- remain exclusively in crm_budget_dealer_lines.
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
    max(dealer.seller_id),
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

  -- Resolve the same canonical monthly source as CRM Budget:
  -- a positive dealer allocation wins for that month; otherwise the manual
  -- budget line's largest-remainder monthly split is used.
  with scoped_lines as (
    select line.*,
           greatest(0, round(line.qty_budget))::integer as integer_budget
    from public.crm_budget_lines line
    where line.year = p_year
      and lower(line.seller_email) = v_seller_email
  ),
  manual_raw as (
    select line.id,
           month_idx,
           line.integer_budget,
           line.value_budget,
           line.qty_budget,
           line.integer_budget * coalesce(
             nullif(line.monthly_split ->> month_idx, '')::numeric,
             1::numeric / 12
           ) as raw_qty
    from scoped_lines line
    cross join generate_series(0, 11) as month_idx
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
  monthly as (
    select ranked.id,
           ranked.month_idx,
           ranked.value_budget,
           ranked.qty_budget,
           case
             when dealer.has_dealer_budget then dealer.dealer_qty
             else ranked.floor_qty + case when ranked.fraction_rank <= ranked.remainder then 1 else 0 end
           end::integer as resolved_qty
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
  resolved as (
    select monthly.id,
           array_agg(monthly.resolved_qty order by monthly.month_idx) as monthly_qty,
           sum(monthly.resolved_qty)::numeric as qty_forecast,
           max(monthly.value_budget) as value_budget,
           max(monthly.qty_budget) as qty_budget
    from monthly
    group by monthly.id
  )
  insert into public.crm_budget_forecasts (
    budget_line_id, qty_forecast, value_forecast, monthly_qty, updated_at
  )
  select
    resolved.id,
    resolved.qty_forecast,
    case
      when resolved.qty_budget > 0
        then round(resolved.qty_forecast * resolved.value_budget / resolved.qty_budget)
      else 0
    end,
    resolved.monthly_qty,
    now()
  from resolved
  on conflict (budget_line_id) do nothing;

  get diagnostics v_seeded_count = row_count;
  return query select
    case when v_seeded_count > 0 then 'seeded' else 'no_original_budget' end::text,
    v_seeded_count;
end;
$$;

revoke all on function public.initialize_crm_working_budget_from_original(integer, text) from public;
revoke all on function public.initialize_crm_working_budget_from_original(integer, text) from anon;
grant execute on function public.initialize_crm_working_budget_from_original(integer, text) to authenticated;
