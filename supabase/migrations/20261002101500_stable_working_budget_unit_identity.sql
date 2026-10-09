-- Give every Working Budget machine a stable identity. The aggregate forecast
-- remains the quantity projection; this child table identifies the individual
-- units that make up that projection and follows them between months.

create table public.crm_working_budget_units (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null references public.crm_budget_lines(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  month_idx integer not null check (month_idx between 0 and 11),
  dealer_account_id uuid references public.dealer_accounts(id) on delete restrict,
  dealer_account_number text,
  dealer_name text,
  origin_type text not null check (origin_type in ('original_budget', 'working_reference', 'manual_add')),
  origin_id uuid,
  materialization_key text not null,
  status text not null default 'active' check (status in ('active', 'removed')),
  version integer not null default 1 check (version > 0),
  created_by uuid,
  removed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (budget_line_id, sequence_no),
  unique (budget_line_id, materialization_key),
  check (
    (status = 'active' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create index crm_working_budget_units_active_month_idx
  on public.crm_working_budget_units (budget_line_id, month_idx, sequence_no)
  where status = 'active';

create index crm_working_budget_units_dealer_idx
  on public.crm_working_budget_units (dealer_account_id, budget_line_id)
  where dealer_account_id is not null and status = 'active';

alter table public.crm_working_budget_units enable row level security;
revoke all on table public.crm_working_budget_units from public, anon, authenticated;

-- Internal, idempotent materializer. It is deliberately not API-accessible;
-- authorized public RPCs below call it after resolving the caller's scope.
create or replace function public.materialize_crm_working_budget_units(
  p_budget_line_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_month_idx integer;
  v_total integer;
  v_remaining integer;
  v_sequence integer := 0;
  v_cell_key text;
  v_product_code text;
  v_has_references boolean;
  v_original_total integer;
  v_has_change boolean;
  v_source record;
  v_unit_idx integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_budget_line_id::text, 0)
  );

  select * into v_line
  from public.crm_budget_lines line
  where line.id = p_budget_line_id;
  if not found then
    raise exception 'Working Budget line not found';
  end if;

  select * into v_forecast
  from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = p_budget_line_id;
  if not found or v_forecast.monthly_qty is null
     or array_length(v_forecast.monthly_qty, 1) <> 12 then
    raise exception 'Working Budget monthly forecast is not initialized';
  end if;

  -- A line is materialized as one transaction. Any existing row, including a
  -- removed unit retained for audit, proves that this line already has its
  -- canonical identity set.
  if exists (
    select 1 from public.crm_working_budget_units unit
    where unit.budget_line_id = p_budget_line_id
  ) then
    return (
      select count(*)::integer
      from public.crm_working_budget_units unit
      where unit.budget_line_id = p_budget_line_id and unit.status = 'active'
    );
  end if;

  v_product_code := upper(coalesce(
    nullif(v_line.item_number, ''), nullif(v_line.product_key, ''),
    v_line.product_name, '—'
  ));

  for v_month_idx in 0..11 loop
    v_total := greatest(0, coalesce(v_forecast.monthly_qty[v_month_idx + 1], 0));
    v_remaining := v_total;
    if v_total = 0 then
      continue;
    end if;

    v_cell_key := v_line.year::text || '|'
      || upper(coalesce(nullif(v_line.seller_initials, ''), '—')) || '|'
      || v_product_code || '|' || lpad(v_month_idx::text, 2, '0')
      || '|arbejdsbudget';

    select exists (
      select 1 from public.budget_references reference
      where reference.cell_key = v_cell_key
        and reference.budget_year = v_line.year
        and reference.budget_type = 'arbejdsbudget'
        and coalesce(reference.delta_qty, 0) > 0
    ) into v_has_references;

    if v_has_references then
      for v_source in
        select reference.id, reference.dealer_account_id,
               reference.dealer_account_number, reference.dealer_name,
               greatest(0, coalesce(reference.delta_qty, 0))::integer as qty
        from public.budget_references reference
        where reference.cell_key = v_cell_key
          and reference.budget_year = v_line.year
          and reference.budget_type = 'arbejdsbudget'
          and coalesce(reference.delta_qty, 0) > 0
        order by reference.created_at, reference.id
      loop
        for v_unit_idx in 1..least(v_source.qty, v_remaining) loop
          v_sequence := v_sequence + 1;
          insert into public.crm_working_budget_units (
            budget_line_id, sequence_no, month_idx,
            dealer_account_id, dealer_account_number, dealer_name,
            origin_type, origin_id, materialization_key, created_by
          ) values (
            p_budget_line_id, v_sequence, v_month_idx,
            v_source.dealer_account_id, v_source.dealer_account_number,
            split_part(coalesce(v_source.dealer_name, 'Ukendt forhandler'), '·', 1),
            'working_reference', v_source.id,
            'reference:' || v_source.id::text || ':' || v_unit_idx::text,
            (select auth.uid())
          );
          v_remaining := v_remaining - 1;
          exit when v_remaining = 0;
        end loop;
        exit when v_remaining = 0;
      end loop;
    else
      select coalesce(sum(dealer.qty), 0)::integer
      into v_original_total
      from public.crm_budget_dealer_lines dealer
      where dealer.year = v_line.year
        and dealer.month_idx = v_month_idx
        and lower(dealer.seller_email) = lower(v_line.seller_email)
        and lower(dealer.product_key) = lower(v_line.product_key)
        and not dealer.excluded_from_total
        and dealer.qty > 0;

      select exists (
        select 1 from public.audit_log audit
        where audit.status = 'success'
          and (
            (audit.record_type = 'crm_budget'
              and audit.new_value ->> 'cell_key' = v_cell_key)
            or
            (audit.record_type = 'crm_working_budget_adjustment'
              and audit.new_value ->> 'budget_line_id' = p_budget_line_id::text
              and (audit.new_value ->> 'month_idx')::integer = v_month_idx)
            or
            (audit.record_type = 'crm_working_budget_move'
              and audit.new_value ->> 'budget_line_id' = p_budget_line_id::text
              and v_month_idx in (
                (audit.new_value ->> 'source_month_idx')::integer,
                (audit.new_value ->> 'destination_month_idx')::integer
              ))
          )
      ) into v_has_change;

      if not v_has_change and v_original_total = v_total then
        for v_source in
          select dealer.id, dealer.dealer_account_id,
                 dealer.dealer_account_number, dealer.dealer_name,
                 dealer.qty::integer as qty
          from public.crm_budget_dealer_lines dealer
          where dealer.year = v_line.year
            and dealer.month_idx = v_month_idx
            and lower(dealer.seller_email) = lower(v_line.seller_email)
            and lower(dealer.product_key) = lower(v_line.product_key)
            and not dealer.excluded_from_total
            and dealer.qty > 0
          order by dealer.dealer_account_number nulls last,
                   dealer.dealer_name nulls last, dealer.id
        loop
          for v_unit_idx in 1..least(v_source.qty, v_remaining) loop
            v_sequence := v_sequence + 1;
            insert into public.crm_working_budget_units (
              budget_line_id, sequence_no, month_idx,
              dealer_account_id, dealer_account_number, dealer_name,
              origin_type, origin_id, materialization_key, created_by
            ) values (
              p_budget_line_id, v_sequence, v_month_idx,
              v_source.dealer_account_id, v_source.dealer_account_number,
              coalesce(v_source.dealer_name, v_source.dealer_account_number, 'Ukendt forhandler'),
              'original_budget', v_source.id,
              'original:' || v_source.id::text || ':' || v_unit_idx::text,
              (select auth.uid())
            );
            v_remaining := v_remaining - 1;
            exit when v_remaining = 0;
          end loop;
          exit when v_remaining = 0;
        end loop;
      end if;
    end if;

    for v_unit_idx in 1..v_remaining loop
      v_sequence := v_sequence + 1;
      insert into public.crm_working_budget_units (
        budget_line_id, sequence_no, month_idx, origin_type, origin_id,
        materialization_key, created_by
      ) values (
        p_budget_line_id, v_sequence, v_month_idx, 'manual_add', null,
        'materialized-unallocated:' || v_month_idx::text || ':' || v_unit_idx::text,
        (select auth.uid())
      );
    end loop;
  end loop;

  return v_sequence;
end;
$$;

revoke all on function public.materialize_crm_working_budget_units(uuid)
  from public, anon, authenticated;

create or replace function public.list_crm_working_budget_units(
  p_budget_line_id uuid
)
returns table (
  id uuid,
  budget_line_id uuid,
  sequence_no integer,
  month_idx integer,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text,
  origin_type text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
begin
  select * into v_line from public.crm_budget_lines line
  where line.id = p_budget_line_id;
  if not found then
    raise exception 'Working Budget line not found';
  end if;
  if not (
    public.is_timan_backend()
    or public.is_timan_budget_seller(v_line.seller_email)
  ) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;

  perform public.materialize_crm_working_budget_units(p_budget_line_id);

  return query
  select unit.id, unit.budget_line_id, unit.sequence_no, unit.month_idx,
         unit.dealer_account_id, unit.dealer_account_number, unit.dealer_name,
         unit.origin_type, unit.version
  from public.crm_working_budget_units unit
  where unit.budget_line_id = p_budget_line_id and unit.status = 'active'
  order by unit.month_idx, unit.sequence_no;
end;
$$;

create or replace function public.create_crm_working_budget_unit(
  p_budget_line_id uuid,
  p_month_idx integer,
  p_expected_value integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.crm_budget_lines%rowtype;
  v_result jsonb;
  v_existing jsonb;
  v_unit public.crm_working_budget_units%rowtype;
  v_sequence integer;
begin
  select * into v_line from public.crm_budget_lines line
  where line.id = p_budget_line_id for update;
  if not found then raise exception 'Working Budget line not found'; end if;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  if p_month_idx not between 0 and 11 or p_request_id is null then
    raise exception 'A valid month and request id are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_budget_line_id::text, 0));
  perform public.materialize_crm_working_budget_units(p_budget_line_id);

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_adjustment'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;

  v_result := public.adjust_crm_working_budget_quantity(
    p_budget_line_id, p_month_idx, 1, p_expected_value, null, p_request_id
  );
  select coalesce(max(unit.sequence_no), 0) + 1 into v_sequence
  from public.crm_working_budget_units unit
  where unit.budget_line_id = p_budget_line_id;

  insert into public.crm_working_budget_units (
    budget_line_id, sequence_no, month_idx, origin_type,
    materialization_key, created_by
  ) values (
    p_budget_line_id, v_sequence, p_month_idx, 'manual_add',
    'added:' || p_request_id::text, (select auth.uid())
  ) returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_adjustment'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id,
    'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version
  );
end;
$$;

create or replace function public.remove_crm_working_budget_unit(
  p_unit_id uuid,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.crm_working_budget_units%rowtype;
  v_line public.crm_budget_lines%rowtype;
  v_forecast public.crm_budget_forecasts%rowtype;
  v_selection jsonb;
  v_result jsonb;
  v_existing jsonb;
begin
  select * into v_unit from public.crm_working_budget_units unit
  where unit.id = p_unit_id for update;
  if not found then raise exception 'Working Budget unit not found'; end if;

  select * into v_line from public.crm_budget_lines line
  where line.id = v_unit.budget_line_id for update;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_unit.budget_line_id::text, 0));

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_adjustment'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;
  if v_unit.status <> 'active' or v_unit.version <> p_expected_version then
    raise exception 'Working Budget unit changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;

  select * into v_forecast from public.crm_budget_forecasts forecast
  where forecast.budget_line_id = v_unit.budget_line_id for update;
  if not found then raise exception 'Working Budget monthly forecast is not initialized'; end if;

  v_selection := case when v_unit.dealer_account_id is null
    and v_unit.dealer_account_number is null and v_unit.dealer_name is null
    then jsonb_build_object('kind', 'unallocated', 'quantity', 1)
    else jsonb_build_object(
      'kind', 'dealer', 'dealer_account_id', v_unit.dealer_account_id,
      'dealer_account_number', v_unit.dealer_account_number,
      'dealer_name', v_unit.dealer_name, 'quantity', 1
    ) end;

  v_result := public.adjust_crm_working_budget_quantity(
    v_unit.budget_line_id, v_unit.month_idx, -1,
    coalesce(v_forecast.monthly_qty[v_unit.month_idx + 1], 0),
    v_selection, p_request_id
  );

  update public.crm_working_budget_units
  set status = 'removed', version = version + 1, removed_by = (select auth.uid()),
      removed_at = now(), updated_at = now()
  where id = p_unit_id returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no,
        'working_budget_unit_version', v_unit.version
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_adjustment'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id, 'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version
  );
end;
$$;

create or replace function public.move_crm_working_budget_unit(
  p_unit_id uuid,
  p_target_month_idx integer,
  p_expected_version integer,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.crm_working_budget_units%rowtype;
  v_line public.crm_budget_lines%rowtype;
  v_selection jsonb;
  v_result jsonb;
  v_existing jsonb;
  v_source_month_idx integer;
begin
  if p_target_month_idx not between 0 and 11 or p_request_id is null then
    raise exception 'A valid target month and request id are required';
  end if;

  select * into v_unit from public.crm_working_budget_units unit
  where unit.id = p_unit_id for update;
  if not found then raise exception 'Working Budget unit not found'; end if;

  select * into v_line from public.crm_budget_lines line
  where line.id = v_unit.budget_line_id for update;
  if not (public.is_timan_backend() or public.is_timan_budget_seller(v_line.seller_email)) then
    raise exception 'Not authorized for this Working Budget scope' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_unit.budget_line_id::text, 0));

  select audit.new_value into v_existing from public.audit_log audit
  where audit.record_type = 'crm_working_budget_move'
    and audit.record_id = p_request_id::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('status', 'already_applied', 'request_id', p_request_id) || v_existing;
  end if;
  if v_unit.status <> 'active' or v_unit.version <> p_expected_version then
    raise exception 'Working Budget unit changed concurrently; reload before continuing'
      using errcode = '40001';
  end if;
  if v_unit.month_idx = p_target_month_idx then
    raise exception 'Working Budget unit is already in the selected month';
  end if;

  v_source_month_idx := v_unit.month_idx;
  v_selection := case when v_unit.dealer_account_id is null
    and v_unit.dealer_account_number is null and v_unit.dealer_name is null
    then jsonb_build_object('kind', 'unallocated', 'quantity', 1)
    else jsonb_build_object(
      'kind', 'dealer', 'dealer_account_id', v_unit.dealer_account_id,
      'dealer_account_number', v_unit.dealer_account_number,
      'dealer_name', v_unit.dealer_name, 'quantity', 1
    ) end;

  v_result := public.move_crm_working_budget_allocations(
    v_unit.budget_line_id, v_source_month_idx, p_target_month_idx,
    jsonb_build_array(v_selection), p_request_id
  );

  update public.crm_working_budget_units
  set month_idx = p_target_month_idx, version = version + 1, updated_at = now()
  where id = p_unit_id returning * into v_unit;

  update public.audit_log
  set new_value = new_value || jsonb_build_object(
        'working_budget_unit_id', v_unit.id,
        'working_budget_unit_sequence', v_unit.sequence_no,
        'working_budget_unit_version', v_unit.version
      ),
      changed_fields = array_append(changed_fields, 'working_budget_unit_id')
  where record_type = 'crm_working_budget_move'
    and record_id = p_request_id::text;

  return v_result || jsonb_build_object(
    'unit_id', v_unit.id, 'unit_sequence', v_unit.sequence_no,
    'unit_version', v_unit.version,
    'source_month_idx', v_source_month_idx,
    'destination_month_idx', p_target_month_idx
  );
end;
$$;

-- Materialize every current Working Budget projection once. Original Budget
-- and dealer-line rows are read only throughout this backfill.
do $$
declare
  v_forecast record;
begin
  for v_forecast in
    select forecast.budget_line_id
    from public.crm_budget_forecasts forecast
    where forecast.monthly_qty is not null
      and array_length(forecast.monthly_qty, 1) = 12
  loop
    perform public.materialize_crm_working_budget_units(v_forecast.budget_line_id);
  end loop;
end;
$$;

revoke all on function public.list_crm_working_budget_units(uuid)
  from public, anon;
revoke all on function public.create_crm_working_budget_unit(uuid, integer, integer, uuid)
  from public, anon;
revoke all on function public.remove_crm_working_budget_unit(uuid, integer, uuid)
  from public, anon;
revoke all on function public.move_crm_working_budget_unit(uuid, integer, integer, uuid)
  from public, anon;

grant execute on function public.list_crm_working_budget_units(uuid) to authenticated;
grant execute on function public.create_crm_working_budget_unit(uuid, integer, integer, uuid) to authenticated;
grant execute on function public.remove_crm_working_budget_unit(uuid, integer, uuid) to authenticated;
grant execute on function public.move_crm_working_budget_unit(uuid, integer, integer, uuid) to authenticated;

-- Retire the aggregate client mutation entry points. The internal owner calls
-- remain available to the exact-unit wrappers above.
revoke all on function public.adjust_crm_working_budget_quantity(uuid, integer, integer, integer, jsonb, uuid)
  from authenticated;
revoke all on function public.move_crm_working_budget_allocations(uuid, integer, integer, jsonb, uuid)
  from authenticated;
revoke all on function public.move_crm_working_budget_unit(uuid, integer, integer, jsonb, integer, uuid)
  from authenticated;
