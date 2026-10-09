-- Preserve dealer identity when a Working Budget quantity is moved between
-- months. Existing budget_references remain the canonical allocation rows;
-- this migration only gives those rows a stable dealer id and an atomic move.

alter table public.budget_references
  add column if not exists dealer_account_id uuid references public.dealer_accounts(id) on delete restrict,
  add column if not exists movement_id uuid,
  add column if not exists source_reference_id uuid references public.budget_references(id) on delete set null;

update public.budget_references reference
set dealer_account_id = dealer.id
from public.dealer_accounts dealer
where reference.dealer_account_id is null
  and nullif(btrim(reference.dealer_account_number), '') is not null
  and dealer.account_number = reference.dealer_account_number;

create index if not exists budget_references_dealer_account_idx
  on public.budget_references (dealer_account_id, budget_year, month_idx)
  where dealer_account_id is not null;

create index if not exists budget_references_movement_idx
  on public.budget_references (movement_id)
  where movement_id is not null;

create unique index if not exists audit_log_working_budget_move_request_idx
  on public.audit_log (record_id)
  where record_type = 'crm_working_budget_move';

create or replace function public.move_crm_working_budget_allocations(
  p_budget_line_id uuid,
  p_source_month_idx integer,
  p_destination_month_idx integer,
  p_selections jsonb,
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
  v_source_before integer;
  v_destination_before integer;
  v_source_after integer;
  v_destination_after integer;
  v_move_qty integer;
  v_source_cell_key text;
  v_destination_cell_key text;
  v_source_month text;
  v_destination_month text;
  v_product_code text;
  v_source_reference_count integer;
  v_destination_reference_count integer;
  v_source_original_total integer;
  v_destination_original_total integer;
  v_source_allocated integer;
  v_source_unallocated integer;
  v_selection jsonb;
  v_selection_kind text;
  v_selection_qty integer;
  v_selection_dealer_id uuid;
  v_selection_account_number text;
  v_selection_dealer_name text;
  v_available integer;
  v_remaining integer;
  v_take integer;
  v_ref public.budget_references%rowtype;
  v_actor record;
  v_move_rows jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_duplicate_count integer;
begin
  if p_budget_line_id is null or p_request_id is null then
    raise exception 'Budget line and request id are required';
  end if;
  if p_source_month_idx not between 0 and 11
     or p_destination_month_idx not between 0 and 11
     or p_source_month_idx = p_destination_month_idx then
    raise exception 'Source and destination months must be different values from 0 to 11';
  end if;
  if jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'At least one allocation selection is required';
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_budget_line_id::text, 0)
  );

  -- Check after authorization and serialization so simultaneous calls with
  -- the same request id cannot both apply the move.
  select audit.new_value
  into v_existing
  from public.audit_log audit
  where audit.record_type = 'crm_working_budget_move'
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
  v_source_before := coalesce(v_monthly[p_source_month_idx + 1], 0);
  v_destination_before := coalesce(v_monthly[p_destination_month_idx + 1], 0);
  v_source_month := (array['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'])[p_source_month_idx + 1];
  v_destination_month := (array['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'])[p_destination_month_idx + 1];
  v_product_code := upper(coalesce(nullif(v_line.item_number, ''), nullif(v_line.product_key, ''), v_line.product_name, '—'));
  v_source_cell_key := v_line.year::text || '|' || upper(coalesce(nullif(v_line.seller_initials, ''), '—'))
    || '|' || v_product_code || '|' || lpad(p_source_month_idx::text, 2, '0') || '|arbejdsbudget';
  v_destination_cell_key := v_line.year::text || '|' || upper(coalesce(nullif(v_line.seller_initials, ''), '—'))
    || '|' || v_product_code || '|' || lpad(p_destination_month_idx::text, 2, '0') || '|arbejdsbudget';

  select count(*) into v_source_reference_count
  from public.budget_references reference
  where reference.cell_key = v_source_cell_key
    and reference.budget_year = v_line.year
    and reference.budget_type = 'arbejdsbudget';

  select coalesce(sum(dealer.qty), 0)::integer into v_source_original_total
  from public.crm_budget_dealer_lines dealer
  where dealer.year = v_line.year
    and dealer.month_idx = p_source_month_idx
    and lower(dealer.seller_email) = lower(v_line.seller_email)
    and lower(dealer.product_key) = lower(v_line.product_key)
    and not dealer.excluded_from_total
    and dealer.qty > 0;

  if v_source_reference_count = 0
     and v_source_before = v_source_original_total
     and v_source_original_total > 0
     and not exists (
       select 1 from public.audit_log audit
       where audit.record_type = 'crm_budget'
         and audit.status = 'success'
         and audit.new_value ->> 'cell_key' = v_source_cell_key
     ) then
    insert into public.budget_references (
      cell_key, budget_year, seller_initials, seller_email, product_code,
      model_name, category, month, month_idx, budget_type, old_value, new_value,
      dealer_name, dealer_account_id, dealer_account_number, delta_qty,
      note, created_by_email, created_by_name
    )
    select
      v_source_cell_key, v_line.year, v_line.seller_initials, v_line.seller_email,
      coalesce(v_line.item_number, v_line.product_key), v_line.product_name, v_line.category,
      v_source_month, p_source_month_idx, 'arbejdsbudget',
      v_source_before, v_source_before, coalesce(max(dealer.dealer_name), max(dealer.dealer_account_number), 'Ukendt forhandler'),
      dealer.dealer_account_id, max(dealer.dealer_account_number), sum(dealer.qty)::integer,
      'Arvet fra oprindeligt budget', coalesce((select auth.email()), v_line.seller_email), 'System'
    from public.crm_budget_dealer_lines dealer
    where dealer.year = v_line.year
      and dealer.month_idx = p_source_month_idx
      and lower(dealer.seller_email) = lower(v_line.seller_email)
      and lower(dealer.product_key) = lower(v_line.product_key)
      and not dealer.excluded_from_total
      and dealer.qty > 0
    group by dealer.dealer_account_id, coalesce(dealer.dealer_account_number, dealer.dealer_name_norm, dealer.dealer_name);
  end if;

  select count(*) into v_destination_reference_count
  from public.budget_references reference
  where reference.cell_key = v_destination_cell_key
    and reference.budget_year = v_line.year
    and reference.budget_type = 'arbejdsbudget';

  select coalesce(sum(dealer.qty), 0)::integer into v_destination_original_total
  from public.crm_budget_dealer_lines dealer
  where dealer.year = v_line.year
    and dealer.month_idx = p_destination_month_idx
    and lower(dealer.seller_email) = lower(v_line.seller_email)
    and lower(dealer.product_key) = lower(v_line.product_key)
    and not dealer.excluded_from_total
    and dealer.qty > 0;

  if v_destination_reference_count = 0
     and v_destination_before = v_destination_original_total
     and v_destination_original_total > 0
     and not exists (
       select 1 from public.audit_log audit
       where audit.record_type = 'crm_budget'
         and audit.status = 'success'
         and audit.new_value ->> 'cell_key' = v_destination_cell_key
     ) then
    insert into public.budget_references (
      cell_key, budget_year, seller_initials, seller_email, product_code,
      model_name, category, month, month_idx, budget_type, old_value, new_value,
      dealer_name, dealer_account_id, dealer_account_number, delta_qty,
      note, created_by_email, created_by_name
    )
    select
      v_destination_cell_key, v_line.year, v_line.seller_initials, v_line.seller_email,
      coalesce(v_line.item_number, v_line.product_key), v_line.product_name, v_line.category,
      v_destination_month, p_destination_month_idx, 'arbejdsbudget',
      v_destination_before, v_destination_before, coalesce(max(dealer.dealer_name), max(dealer.dealer_account_number), 'Ukendt forhandler'),
      dealer.dealer_account_id, max(dealer.dealer_account_number), sum(dealer.qty)::integer,
      'Arvet fra oprindeligt budget', coalesce((select auth.email()), v_line.seller_email), 'System'
    from public.crm_budget_dealer_lines dealer
    where dealer.year = v_line.year
      and dealer.month_idx = p_destination_month_idx
      and lower(dealer.seller_email) = lower(v_line.seller_email)
      and lower(dealer.product_key) = lower(v_line.product_key)
      and not dealer.excluded_from_total
      and dealer.qty > 0
    group by dealer.dealer_account_id, coalesce(dealer.dealer_account_number, dealer.dealer_name_norm, dealer.dealer_name);
  end if;

  select count(*) into v_duplicate_count
  from (
    select
      coalesce(selection ->> 'kind', ''),
      coalesce(selection ->> 'dealer_account_id', selection ->> 'dealer_account_number', lower(selection ->> 'dealer_name'), '')
    from jsonb_array_elements(p_selections) selection
    group by 1, 2
    having count(*) > 1
  ) duplicates;
  if v_duplicate_count > 0 then
    raise exception 'Duplicate allocation selections are not allowed';
  end if;

  select coalesce(sum(greatest(0, (selection ->> 'quantity')::integer)), 0)::integer
  into v_move_qty
  from jsonb_array_elements(p_selections) selection;
  if v_move_qty <= 0 or v_move_qty > v_source_before then
    raise exception 'Move quantity exceeds the source month';
  end if;

  select coalesce(sum(reference.delta_qty), 0)::integer into v_source_allocated
  from public.budget_references reference
  where reference.cell_key = v_source_cell_key
    and reference.budget_year = v_line.year
    and reference.budget_type = 'arbejdsbudget'
    and coalesce(reference.delta_qty, 0) > 0;
  v_source_unallocated := greatest(0, v_source_before - v_source_allocated);

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    v_selection_kind := coalesce(v_selection ->> 'kind', '');
    v_selection_qty := coalesce((v_selection ->> 'quantity')::integer, 0);
    if v_selection_qty <= 0 then
      raise exception 'Selected quantity must be positive';
    end if;

    if v_selection_kind = 'unallocated' then
      if v_selection_qty > v_source_unallocated then
        raise exception 'Selected unallocated quantity exceeds the available quantity';
      end if;
      v_source_unallocated := v_source_unallocated - v_selection_qty;
      v_move_rows := v_move_rows || jsonb_build_array(jsonb_build_object(
        'kind', 'unallocated', 'quantity', v_selection_qty
      ));
      continue;
    end if;

    if v_selection_kind <> 'dealer' then
      raise exception 'Unknown allocation selection kind';
    end if;
    v_selection_dealer_id := nullif(v_selection ->> 'dealer_account_id', '')::uuid;
    v_selection_account_number := nullif(btrim(v_selection ->> 'dealer_account_number'), '');
    v_selection_dealer_name := nullif(btrim(v_selection ->> 'dealer_name'), '');

    select coalesce(sum(reference.delta_qty), 0)::integer into v_available
    from public.budget_references reference
    where reference.cell_key = v_source_cell_key
      and reference.budget_year = v_line.year
      and reference.budget_type = 'arbejdsbudget'
      and coalesce(reference.delta_qty, 0) > 0
      and case
        when v_selection_dealer_id is not null then reference.dealer_account_id = v_selection_dealer_id
        when v_selection_account_number is not null then reference.dealer_account_number = v_selection_account_number
        else lower(split_part(coalesce(reference.dealer_name, ''), '·', 1)) = lower(v_selection_dealer_name)
      end;
    if v_selection_qty > v_available then
      raise exception 'Selected dealer quantity exceeds the available quantity';
    end if;

    v_remaining := v_selection_qty;
    for v_ref in
      select reference.*
      from public.budget_references reference
      where reference.cell_key = v_source_cell_key
        and reference.budget_year = v_line.year
        and reference.budget_type = 'arbejdsbudget'
        and coalesce(reference.delta_qty, 0) > 0
        and case
          when v_selection_dealer_id is not null then reference.dealer_account_id = v_selection_dealer_id
          when v_selection_account_number is not null then reference.dealer_account_number = v_selection_account_number
          else lower(split_part(coalesce(reference.dealer_name, ''), '·', 1)) = lower(v_selection_dealer_name)
        end
      order by reference.created_at, reference.id
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_ref.delta_qty);
      insert into public.budget_references (
        cell_key, budget_year, seller_initials, seller_email, product_code,
        model_name, category, month, month_idx, budget_type, old_value, new_value,
        dealer_name, dealer_account_id, dealer_account_number, contact_name,
        lead_id, demo_id, note, created_by_email, created_by_name, delta_qty,
        reference_group_id, movement_id, source_reference_id
      ) values (
        v_destination_cell_key, v_ref.budget_year, v_ref.seller_initials, v_ref.seller_email,
        v_ref.product_code, v_ref.model_name, v_ref.category, v_destination_month,
        p_destination_month_idx, v_ref.budget_type, v_destination_before,
        v_destination_before + v_move_qty, v_ref.dealer_name,
        coalesce(v_ref.dealer_account_id, v_selection_dealer_id),
        coalesce(v_ref.dealer_account_number, v_selection_account_number),
        v_ref.contact_name, v_ref.lead_id, v_ref.demo_id, v_ref.note,
        coalesce((select auth.email()), v_ref.created_by_email),
        coalesce(v_actor.actor_name, v_ref.created_by_name), v_take,
        p_request_id::text, p_request_id, v_ref.id
      );

      if v_take = v_ref.delta_qty then
        delete from public.budget_references where id = v_ref.id;
      else
        update public.budget_references
        set delta_qty = delta_qty - v_take,
            new_value = v_source_before - v_move_qty,
            movement_id = p_request_id
        where id = v_ref.id;
      end if;
      v_remaining := v_remaining - v_take;
    end loop;

    v_move_rows := v_move_rows || jsonb_build_array(jsonb_build_object(
      'kind', 'dealer',
      'dealer_account_id', v_selection_dealer_id,
      'dealer_account_number', v_selection_account_number,
      'dealer_name', v_selection_dealer_name,
      'quantity', v_selection_qty
    ));
  end loop;

  v_source_after := v_source_before - v_move_qty;
  v_destination_after := v_destination_before + v_move_qty;
  v_monthly[p_source_month_idx + 1] := v_source_after;
  v_monthly[p_destination_month_idx + 1] := v_destination_after;

  update public.crm_budget_forecasts
  set monthly_qty = v_monthly,
      qty_forecast = (select coalesce(sum(value), 0) from unnest(v_monthly) value),
      updated_at = now()
  where id = v_forecast.id;

  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role, active_mode,
    seller_context, action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, coalesce(v_actor.actor_email, (select auth.email())),
    v_actor.actor_name, v_actor.actor_role, 'seller:' || coalesce(v_line.seller_initials, v_line.seller_email),
    v_line.seller_email, 'update', 'Budget', 'crm_working_budget_move', p_request_id::text,
    v_line.year || ' · ' || coalesce(v_line.seller_initials, '—') || ' · ' || v_product_code
      || ' · ' || v_source_month || ' → ' || v_destination_month,
    jsonb_build_object(
      'source_month_idx', p_source_month_idx, 'source_value', v_source_before,
      'destination_month_idx', p_destination_month_idx, 'destination_value', v_destination_before
    ),
    jsonb_build_object(
      'request_id', p_request_id,
      'budget_line_id', p_budget_line_id,
      'year', v_line.year,
      'seller_email', v_line.seller_email,
      'seller_initials', v_line.seller_initials,
      'product_key', v_line.product_key,
      'product_name', v_line.product_name,
      'item_number', v_line.item_number,
      'source_month_idx', p_source_month_idx,
      'source_month', v_source_month,
      'destination_month_idx', p_destination_month_idx,
      'destination_month', v_destination_month,
      'source_value', v_source_after,
      'destination_value', v_destination_after,
      'quantity', v_move_qty,
      'allocations', v_move_rows
    ),
    array['monthly_qty', 'budget_references'], 'success'
  );

  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role, active_mode,
    seller_context, action, module, record_type, record_id, record_label,
    old_value, new_value, changed_fields, status
  )
  select
    v_actor.actor_user_id, coalesce(v_actor.actor_email, (select auth.email())),
    v_actor.actor_name, v_actor.actor_role, 'seller:' || coalesce(v_line.seller_initials, v_line.seller_email),
    v_line.seller_email, 'update', 'Budget', 'crm_budget', cell.cell_key,
    v_line.year || ' · ' || coalesce(v_line.seller_initials, '—') || ' · ' || v_product_code
      || ' · ' || cell.month || ' · Arbejdsbudget',
    jsonb_build_object(
      'cell_key', cell.cell_key, 'year', v_line.year, 'seller_initials', v_line.seller_initials,
      'seller_name', v_line.seller_name, 'product_key', v_line.product_key,
      'product_name', v_line.product_name, 'item_number', v_line.item_number,
      'month_idx', cell.month_idx, 'month', cell.month,
      'budget_type', 'arbejdsbudget', 'value', cell.old_value
    ),
    jsonb_build_object(
      'cell_key', cell.cell_key, 'year', v_line.year, 'seller_initials', v_line.seller_initials,
      'seller_name', v_line.seller_name, 'product_key', v_line.product_key,
      'product_name', v_line.product_name, 'item_number', v_line.item_number,
      'month_idx', cell.month_idx, 'month', cell.month,
      'budget_type', 'arbejdsbudget', 'value', cell.new_value,
      'change', cell.new_value - cell.old_value,
      'movement_id', p_request_id,
      'movement', jsonb_build_object(
        'source_month_idx', p_source_month_idx,
        'source_month', v_source_month,
        'destination_month_idx', p_destination_month_idx,
        'destination_month', v_destination_month,
        'quantity', v_move_qty,
        'allocations', v_move_rows
      )
    ),
    array['value', 'budget_references'], 'success'
  from (values
    (v_source_cell_key, p_source_month_idx, v_source_month, v_source_before, v_source_after),
    (v_destination_cell_key, p_destination_month_idx, v_destination_month, v_destination_before, v_destination_after)
  ) as cell(cell_key, month_idx, month, old_value, new_value);

  return jsonb_build_object(
    'status', 'applied',
    'request_id', p_request_id,
    'source_month_idx', p_source_month_idx,
    'destination_month_idx', p_destination_month_idx,
    'source_value', v_source_after,
    'destination_value', v_destination_after,
    'quantity', v_move_qty,
    'allocations', v_move_rows
  );
end;
$$;

revoke all on function public.move_crm_working_budget_allocations(uuid, integer, integer, jsonb, uuid) from public;
revoke all on function public.move_crm_working_budget_allocations(uuid, integer, integer, jsonb, uuid) from anon;
grant execute on function public.move_crm_working_budget_allocations(uuid, integer, integer, jsonb, uuid) to authenticated;
