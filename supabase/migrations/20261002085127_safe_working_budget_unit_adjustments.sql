-- Working Budget quantity changes are delta operations. Preserve the current
-- dealer allocation rows and mutate one explicitly selected unit at a time.

create unique index if not exists audit_log_working_budget_adjustment_request_idx
  on public.audit_log (record_id)
  where record_type = 'crm_working_budget_adjustment';

create or replace function public.adjust_crm_working_budget_quantity(
  p_budget_line_id uuid,
  p_month_idx integer,
  p_delta integer,
  p_expected_value integer,
  p_selection jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_monthly integer[];
  v_old_value integer;
  v_new_value integer;
  v_new_total integer;
  v_unit_value numeric;
  v_cell_key text;
  v_month text;
  v_product_code text;
  v_reference_count integer;
  v_original_total integer;
  v_allocated integer;
  v_unallocated integer;
  v_kind text;
  v_dealer_id uuid;
  v_account_number text;
  v_dealer_name text;
  v_available integer;
  v_ref public.budget_references%rowtype;
  v_actor record;
  v_allocation jsonb := null;
  v_existing jsonb;
begin
  if p_budget_line_id is null or p_request_id is null then
    raise exception 'Budget line and request id are required';
  end if;
  if p_month_idx not between 0 and 11 then
    raise exception 'Month must be a value from 0 to 11';
  end if;
  if p_delta not in (-1, 1) then
    raise exception 'Working Budget quantity delta must be -1 or 1';
  end if;

  select * into v_line
  from public.crm_budget_lines line
  where line.id = p_budget_line_id
  for update;
  if not found then
    raise exception 'Working Budget line not found';
  end if;
  if not (
    public.is_timan_backend()
    or public.is_timan_budget_seller(v_line.seller_email)
  ) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;

  select * into v_actor from public.audit_current_actor();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_budget_line_id::text, 0));

  select audit.new_value into v_existing
  from public.audit_log audit
  where audit.record_type = 'crm_working_budget_adjustment'
    and audit.record_id = p_request_id::text
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;

  select * into v_forecast
  from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = p_budget_line_id
  for update;
  if not found or v_forecast.monthly_qty is null or array_length(v_forecast.monthly_qty, 1) <> 12 then
    raise exception 'Working Budget monthly forecast is not initialized';
  end if;

  v_monthly := v_forecast.monthly_qty;
  v_old_value := coalesce(v_monthly[p_month_idx + 1], 0);
  if v_old_value <> p_expected_value then
    raise exception 'Working Budget cell changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;
  if p_delta = -1 and v_old_value <= 0 then
    raise exception 'Working Budget quantity cannot become negative';
  end if;

  v_month := (array['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'])[p_month_idx + 1];
  v_product_code := upper(coalesce(nullif(v_line.item_number, ''), nullif(v_line.product_key, ''), v_line.product_name, '—'));
  v_cell_key := v_line.year::text || '|' || upper(coalesce(nullif(v_line.seller_initials, ''), '—'))
    || '|' || v_product_code || '|' || lpad(p_month_idx::text, 2, '0') || '|arbejdsbudget';

  -- Freeze the inherited original distribution as current Working Budget
  -- references before the first delta. The immutable original dealer rows are
  -- read only and never updated.
  select count(*) into v_reference_count
  from public.budget_references reference
  where reference.cell_key = v_cell_key
    and reference.budget_year = v_line.year
    and reference.budget_type = 'arbejdsbudget';

  select coalesce(sum(dealer.qty), 0)::integer into v_original_total
  from public.crm_budget_dealer_lines dealer
  where dealer.year = v_line.year
    and dealer.month_idx = p_month_idx
    and lower(dealer.seller_email) = lower(v_line.seller_email)
    and lower(dealer.product_key) = lower(v_line.product_key)
    and not dealer.excluded_from_total
    and dealer.qty > 0;

  if v_reference_count = 0
     and v_old_value = v_original_total
     and v_original_total > 0
     and not exists (
       select 1 from public.audit_log audit
       where audit.record_type in ('crm_working_budget_adjustment', 'crm_working_budget_move')
         and audit.status = 'success'
         and audit.new_value ->> 'budget_line_id' = p_budget_line_id::text
         and (
           (audit.record_type = 'crm_working_budget_adjustment'
             and (audit.new_value ->> 'month_idx')::integer = p_month_idx)
           or
           (audit.record_type = 'crm_working_budget_move'
             and p_month_idx in (
               (audit.new_value ->> 'source_month_idx')::integer,
               (audit.new_value ->> 'destination_month_idx')::integer
             ))
         )
     ) then
    insert into public.budget_references (
      cell_key, budget_year, seller_initials, seller_email, product_code,
      model_name, category, month, month_idx, budget_type, old_value, new_value,
      dealer_name, dealer_account_id, dealer_account_number, delta_qty,
      note, created_by_email, created_by_name
    )
    select
      v_cell_key, v_line.year, v_line.seller_initials, v_line.seller_email,
      coalesce(v_line.item_number, v_line.product_key), v_line.product_name, v_line.category,
      v_month, p_month_idx, 'arbejdsbudget', v_old_value, v_old_value,
      coalesce(max(dealer.dealer_name), max(dealer.dealer_account_number), 'Ukendt forhandler'),
      dealer.dealer_account_id, max(dealer.dealer_account_number), sum(dealer.qty)::integer,
      'Arvet fra oprindeligt budget', coalesce((select auth.email()), v_line.seller_email),
      coalesce(v_actor.actor_name, 'System')
    from public.crm_budget_dealer_lines dealer
    where dealer.year = v_line.year
      and dealer.month_idx = p_month_idx
      and lower(dealer.seller_email) = lower(v_line.seller_email)
      and lower(dealer.product_key) = lower(v_line.product_key)
      and not dealer.excluded_from_total
      and dealer.qty > 0
    group by dealer.dealer_account_id, coalesce(dealer.dealer_account_number, dealer.dealer_name_norm, dealer.dealer_name);
  end if;

  select coalesce(sum(reference.delta_qty), 0)::integer into v_allocated
  from public.budget_references reference
  where reference.cell_key = v_cell_key
    and reference.budget_year = v_line.year
    and reference.budget_type = 'arbejdsbudget'
    and coalesce(reference.delta_qty, 0) > 0;
  v_unallocated := greatest(0, v_old_value - v_allocated);

  if p_delta = 1 then
    if p_selection is not null and p_selection <> 'null'::jsonb then
      raise exception 'A new Working Budget unit must start unallocated';
    end if;
    v_allocation := jsonb_build_object('kind', 'unallocated', 'quantity', 1);
  else
    if p_selection is null or p_selection = 'null'::jsonb then
      raise exception 'Select the exact Working Budget unit to remove';
    end if;
    v_kind := coalesce(p_selection ->> 'kind', '');
    if coalesce((p_selection ->> 'quantity')::integer, 0) <> 1 then
      raise exception 'Exactly one Working Budget unit may be removed';
    end if;

    if v_kind = 'unallocated' then
      if v_unallocated < 1 then
        raise exception 'No unallocated Working Budget unit is available';
      end if;
      v_allocation := jsonb_build_object('kind', 'unallocated', 'quantity', 1);
    elsif v_kind = 'dealer' then
      v_dealer_id := nullif(p_selection ->> 'dealer_account_id', '')::uuid;
      v_account_number := nullif(btrim(p_selection ->> 'dealer_account_number'), '');
      v_dealer_name := nullif(btrim(p_selection ->> 'dealer_name'), '');

      select coalesce(sum(reference.delta_qty), 0)::integer into v_available
      from public.budget_references reference
      where reference.cell_key = v_cell_key
        and reference.budget_year = v_line.year
        and reference.budget_type = 'arbejdsbudget'
        and coalesce(reference.delta_qty, 0) > 0
        and case
          when v_dealer_id is not null then reference.dealer_account_id = v_dealer_id
          when v_account_number is not null then reference.dealer_account_number = v_account_number
          else lower(split_part(coalesce(reference.dealer_name, ''), '·', 1)) = lower(v_dealer_name)
        end;
      if v_available < 1 then
        raise exception 'Selected dealer allocation is no longer available';
      end if;

      select reference.* into v_ref
      from public.budget_references reference
      where reference.cell_key = v_cell_key
        and reference.budget_year = v_line.year
        and reference.budget_type = 'arbejdsbudget'
        and coalesce(reference.delta_qty, 0) > 0
        and case
          when v_dealer_id is not null then reference.dealer_account_id = v_dealer_id
          when v_account_number is not null then reference.dealer_account_number = v_account_number
          else lower(split_part(coalesce(reference.dealer_name, ''), '·', 1)) = lower(v_dealer_name)
        end
      order by reference.created_at, reference.id
      for update
      limit 1;

      if v_ref.delta_qty = 1 then
        delete from public.budget_references where id = v_ref.id;
      else
        update public.budget_references
        set delta_qty = delta_qty - 1,
            new_value = v_old_value - 1,
            movement_id = p_request_id
        where id = v_ref.id;
      end if;
      v_allocation := jsonb_build_object(
        'kind', 'dealer',
        'dealer_account_id', coalesce(v_ref.dealer_account_id, v_dealer_id),
        'dealer_account_number', coalesce(v_ref.dealer_account_number, v_account_number),
        'dealer_name', coalesce(v_ref.dealer_name, v_dealer_name),
        'quantity', 1
      );
    else
      raise exception 'Unknown allocation selection kind';
    end if;
  end if;

  v_new_value := v_old_value + p_delta;
  v_monthly[p_month_idx + 1] := v_new_value;
  select coalesce(sum(value), 0)::integer into v_new_total from unnest(v_monthly) value;
  v_unit_value := case
    when coalesce(v_forecast.qty_forecast, 0) > 0 then v_forecast.value_forecast / v_forecast.qty_forecast
    when coalesce(v_line.qty_budget, 0) > 0 then v_line.value_budget / v_line.qty_budget
    else 0
  end;

  update public.crm_budget_forecasts
  set monthly_qty = v_monthly,
      qty_forecast = v_new_total,
      value_forecast = round(v_new_total * v_unit_value),
      updated_at = now()
  where id = v_forecast.id;

  update public.budget_references
  set new_value = v_new_value
  where cell_key = v_cell_key
    and budget_year = v_line.year
    and budget_type = 'arbejdsbudget';

  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role, active_mode,
    seller_context, action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, coalesce(v_actor.actor_email, (select auth.email())),
    v_actor.actor_name, v_actor.actor_role, 'seller:' || coalesce(v_line.seller_initials, v_line.seller_email),
    v_line.seller_email, 'update', 'Budget', 'crm_working_budget_adjustment', p_request_id::text,
    v_line.year || ' · ' || coalesce(v_line.seller_initials, '—') || ' · ' || v_product_code || ' · ' || v_month,
    jsonb_build_object('month_idx', p_month_idx, 'value', v_old_value),
    jsonb_build_object(
      'request_id', p_request_id, 'budget_line_id', p_budget_line_id,
      'year', v_line.year, 'seller_email', v_line.seller_email,
      'seller_initials', v_line.seller_initials, 'product_key', v_line.product_key,
      'product_name', v_line.product_name, 'item_number', v_line.item_number,
      'month_idx', p_month_idx, 'month', v_month, 'old_value', v_old_value,
      'new_value', v_new_value, 'delta', p_delta, 'allocation', v_allocation
    ),
    array['monthly_qty', 'budget_references'], 'success'
  );

  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role, active_mode,
    seller_context, action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, coalesce(v_actor.actor_email, (select auth.email())),
    v_actor.actor_name, v_actor.actor_role, 'seller:' || coalesce(v_line.seller_initials, v_line.seller_email),
    v_line.seller_email, 'update', 'Budget', 'crm_budget', v_cell_key,
    v_line.year || ' · ' || coalesce(v_line.seller_initials, '—') || ' · ' || v_product_code || ' · ' || v_month || ' · Arbejdsbudget',
    jsonb_build_object(
      'cell_key', v_cell_key, 'year', v_line.year, 'seller_initials', v_line.seller_initials,
      'seller_name', v_line.seller_name, 'product_key', v_line.product_key,
      'product_name', v_line.product_name, 'item_number', v_line.item_number,
      'month_idx', p_month_idx, 'month', v_month, 'budget_type', 'arbejdsbudget', 'value', v_old_value
    ),
    jsonb_build_object(
      'cell_key', v_cell_key, 'year', v_line.year, 'seller_initials', v_line.seller_initials,
      'seller_name', v_line.seller_name, 'product_key', v_line.product_key,
      'product_name', v_line.product_name, 'item_number', v_line.item_number,
      'month_idx', p_month_idx, 'month', v_month, 'budget_type', 'arbejdsbudget',
      'value', v_new_value, 'change', p_delta, 'allocation', v_allocation
    ),
    array['value', 'budget_references'], 'success'
  );

  return jsonb_build_object(
    'status', 'applied', 'request_id', p_request_id,
    'month_idx', p_month_idx, 'old_value', v_old_value,
    'new_value', v_new_value, 'delta', p_delta, 'allocation', v_allocation
  );
end;
$$;

-- Add an optimistic concurrency check around the existing canonical atomic
-- move. Both functions execute in the same transaction and lock the same row.
create or replace function public.move_crm_working_budget_unit(
  p_budget_line_id uuid,
  p_source_month_idx integer,
  p_destination_month_idx integer,
  p_selections jsonb,
  p_expected_source_value integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
begin
  select * into v_line
  from public.crm_budget_lines line
  where line.id = p_budget_line_id
  for update;
  if not found then
    raise exception 'Working Budget line not found';
  end if;
  if not (
    public.is_timan_backend()
    or public.is_timan_budget_seller(v_line.seller_email)
  ) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_budget_line_id::text, 0));
  select * into v_forecast
  from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = p_budget_line_id
  for update;
  if not found or v_forecast.monthly_qty is null or array_length(v_forecast.monthly_qty, 1) <> 12 then
    raise exception 'Working Budget monthly forecast is not initialized';
  end if;
  if coalesce(v_forecast.monthly_qty[p_source_month_idx + 1], 0) <> p_expected_source_value then
    raise exception 'Working Budget source changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;

  return public.move_crm_working_budget_allocations(
    p_budget_line_id,
    p_source_month_idx,
    p_destination_month_idx,
    p_selections,
    p_request_id
  );
end;
$$;

revoke all on function public.adjust_crm_working_budget_quantity(uuid, integer, integer, integer, jsonb, uuid) from public, anon;
revoke all on function public.move_crm_working_budget_unit(uuid, integer, integer, jsonb, integer, uuid) from public, anon;
grant execute on function public.adjust_crm_working_budget_quantity(uuid, integer, integer, integer, jsonb, uuid) to authenticated;
grant execute on function public.move_crm_working_budget_unit(uuid, integer, integer, jsonb, integer, uuid) to authenticated;
