-- Manual supply imports are a bootstrap adapter for the canonical Planning
-- supply model. Commercial/customer facts are resolved from Portal sources
-- and are deliberately absent from the import payload.

create unique index planning_supply_units_normalized_serial_unique
  on public.planning_supply_units (
    item_number,
    regexp_replace(upper(serial_number), '[^A-Z0-9]+', '', 'g')
  ) where serial_number is not null;

create table public.planning_supply_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null references public.planning_supply_sources(source_system),
  source_filename text not null,
  source_file_sha256 text not null check (source_file_sha256 ~ '^[a-f0-9]{64}$'),
  item_number text not null,
  source_row_count integer not null check (source_row_count >= 0),
  unique_serial_count integer not null default 0 check (unique_serial_count >= 0),
  new_machine_count integer not null default 0 check (new_machine_count >= 0),
  existing_match_count integer not null default 0 check (existing_match_count >= 0),
  updated_machine_count integer not null default 0 check (updated_machine_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  imported_by uuid not null references public.app_users(id),
  imported_at timestamptz not null default now(),
  unique (source_system, source_file_sha256)
);

create table public.planning_supply_import_batch_rows (
  batch_id uuid not null references public.planning_supply_import_batches(id) on delete restrict,
  source_row_number integer not null check (source_row_number > 0),
  source_record_key text not null,
  supply_unit_id uuid references public.planning_supply_units(id) on delete restrict,
  outcome text not null check (outcome in ('new', 'existing', 'updated', 'conflict')),
  conflict_reason text,
  primary key (batch_id, source_row_number)
);

alter table public.planning_supply_import_batches enable row level security;
alter table public.planning_supply_import_batch_rows enable row level security;

create policy planning_supply_import_batches_backend_read
  on public.planning_supply_import_batches for select to authenticated
  using (
    public.can_access_planning() and exists (
      select 1 from public.app_users u
      where u.auth_user_id = auth.uid()
        and u.portal_role::text = 'timan_backend'
        and u.approved is true and u.is_active is true
    )
  );
create policy planning_supply_import_rows_backend_read
  on public.planning_supply_import_batch_rows for select to authenticated
  using (
    public.can_access_planning() and exists (
      select 1 from public.app_users u
      where u.auth_user_id = auth.uid()
        and u.portal_role::text = 'timan_backend'
        and u.approved is true and u.is_active is true
    )
  );

revoke all on public.planning_supply_import_batches,
  public.planning_supply_import_batch_rows from public, anon, authenticated;
grant select on public.planning_supply_import_batches,
  public.planning_supply_import_batch_rows to authenticated;
grant all on public.planning_supply_import_batches,
  public.planning_supply_import_batch_rows to service_role;

insert into public.planning_supply_sources
  (source_system, connected, freshness_limit_hours)
values ('manual_supply_import', false, 720)
on conflict (source_system) do nothing;

create or replace function public.planning_process_supply_import(
  p_file_name text,
  p_file_sha256 text,
  p_item_number text,
  p_rows jsonb,
  p_confirm boolean default false,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_batch public.planning_supply_import_batches%rowtype;
  v_row jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_seen text[] := array[]::text[];
  v_row_number integer;
  v_serial text;
  v_serial_key text;
  v_reference text;
  v_sales_order text;
  v_completed date;
  v_week smallint;
  v_year smallint;
  v_has_hint boolean;
  v_error text;
  v_source_key text;
  v_portal_state text;
  v_supply_status text;
  v_outcome text;
  v_conflict_reason text;
  v_unit public.planning_supply_units%rowtype;
  v_unit_id uuid;
  v_total integer := 0;
  v_new integer := 0;
  v_existing integer := 0;
  v_updated integer := 0;
  v_complete integer := 0;
  v_future integer := 0;
  v_quote integer := 0;
  v_order integer := 0;
  v_sold integer := 0;
  v_free integer := 0;
  v_duplicates integer := 0;
  v_conflicts integer := 0;
  v_invalid integer := 0;
begin
  select u.* into v_actor
  from public.app_users u
  where u.auth_user_id = auth.uid()
    and u.portal_role::text = 'timan_backend'
    and u.approved is true and u.is_active is true
    and 'planning' = any(coalesce(u.allowed_areas, array[]::text[]));
  if not found then
    raise exception using errcode = '42501', message = 'PLANNING_IMPORT_FORBIDDEN';
  end if;
  if nullif(btrim(coalesce(p_file_name, '')), '') is null
    or p_file_sha256 !~ '^[a-f0-9]{64}$'
    or nullif(btrim(coalesce(p_item_number, '')), '') is null
    or p_as_of is null
    or jsonb_typeof(p_rows) <> 'array'
    or jsonb_array_length(p_rows) = 0
    or jsonb_array_length(p_rows) > 5000
    or not exists (
      select 1 from public.planning_machine_products m
      where m.item_number = btrim(p_item_number)
    ) then
    raise exception using errcode = '23514', message = 'PLANNING_IMPORT_INVALID_REQUEST';
  end if;

  if p_confirm then
    select b.* into v_batch
    from public.planning_supply_import_batches b
    where b.source_system = 'manual_supply_import'
      and b.source_file_sha256 = p_file_sha256;
    if found then
      return jsonb_build_object(
        'preview', false, 'alreadyImported', true, 'batchId', v_batch.id,
        'summary', jsonb_build_object(
          'sourceRows', v_batch.source_row_count,
          'uniqueSerials', v_batch.unique_serial_count,
          'newMachines', v_batch.new_machine_count,
          'existingMatches', v_batch.existing_match_count,
          'updatedMachines', v_batch.updated_machine_count,
          'completedCandidates', 0, 'futureUnits', 0,
          'quoteReserved', 0, 'orderReserved', 0, 'soldCompleted', 0,
          'freeStock', 0, 'duplicates', 0,
          'conflicts', v_batch.conflict_count, 'invalidRows', 0
        ),
        'rows', '[]'::jsonb
      );
    end if;
    insert into public.planning_supply_import_batches
      (source_system, source_filename, source_file_sha256, item_number,
        source_row_count, imported_by)
    values ('manual_supply_import', btrim(p_file_name), p_file_sha256,
      btrim(p_item_number), jsonb_array_length(p_rows), v_actor.id)
    returning * into v_batch;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;
    v_error := null;
    v_conflict_reason := null;
    v_unit_id := null;
    v_completed := null;
    v_week := null;
    v_year := null;
    v_portal_state := 'none';
    v_supply_status := 'blocked';
    v_outcome := 'invalid';
    v_unit := null;
    v_row_number := coalesce((v_row ->> 'row_number')::integer, v_total + 1);
    v_serial := upper(btrim(coalesce(v_row ->> 'serial_number', '')));
    v_serial_key := regexp_replace(v_serial, '[^A-Z0-9]+', '', 'g');
    v_reference := upper(btrim(coalesce(v_row ->> 'production_reference', '')));
    v_sales_order := nullif(btrim(coalesce(v_row ->> 'sales_order_number', '')), '');
    v_has_hint := coalesce((v_row ->> 'has_ignored_commercial_data')::boolean, false);

    if exists (
      select 1 from jsonb_object_keys(v_row) key
      where key not in ('row_number', 'serial_number', 'machine_ident_number',
        'production_reference', 'sales_order_number', 'production_completed_at',
        'production_completed_week', 'production_completed_year',
        'has_ignored_commercial_data', 'validation_error')
    ) then
      v_error := 'unsupported_field';
    elsif v_serial_key = '' or v_serial_key not like regexp_replace(upper(btrim(p_item_number)), '[^A-Z0-9]+', '', 'g') || '%' then
      v_error := 'invalid_serial';
    elsif v_reference !~ '^S[0-9]+-[0-9]+$' then
      v_error := 'invalid_production_reference';
    elsif v_serial_key = any(v_seen) then
      v_error := 'duplicate_in_file';
    end if;
    begin
      if v_error is null then
        v_completed := (v_row ->> 'production_completed_at')::date;
        v_week := nullif(v_row ->> 'production_completed_week', '')::smallint;
        v_year := nullif(v_row ->> 'production_completed_year', '')::smallint;
        if v_completed is null
          or (v_week is not null and (v_week < 1 or v_week > 53))
          or (v_year is not null and (v_year < 1900 or v_year > 2200)) then
          v_error := 'invalid_production_date';
        end if;
      end if;
    exception when others then
      v_error := 'invalid_production_date';
    end;
    if v_error is null then v_seen := array_append(v_seen, v_serial_key); end if;
    v_source_key := btrim(p_item_number) || ':' || v_serial_key;

    if v_error is not null then
      if v_error = 'duplicate_in_file' then v_duplicates := v_duplicates + 1;
      else v_invalid := v_invalid + 1; end if;
      v_outcome := case when v_error = 'duplicate_in_file' then 'duplicate' else 'invalid' end;
      v_supply_status := 'blocked';
      v_portal_state := 'none';
    else
      select u.* into v_unit
      from public.planning_supply_units u
      where u.item_number = btrim(p_item_number)
        and regexp_replace(upper(u.serial_number), '[^A-Z0-9]+', '', 'g') = v_serial_key
      order by u.source_updated_at desc, u.id limit 1;

      select case
        when exists (
          select 1 from public.planning_reservations r
          where r.supply_unit_id = v_unit.id and r.status = 'active'
            and r.reservation_type = 'order'
        ) then 'order'
        when exists (
          select 1 from public.planning_reservations r
          where r.supply_unit_id = v_unit.id and r.status = 'active'
            and r.reservation_type in ('soft_quote', 'locked_quote')
        ) then 'quote'
        when exists (
          select 1 from public.warranty_registrations w
          where regexp_replace(upper(coalesce(w.machine_serial_number, '')),
            '[^A-Z0-9]+', '', 'g') = v_serial_key
            and coalesce(w.is_active_in_source, true)
        ) then 'historical'
        else 'none'
      end into v_portal_state;

      v_supply_status := case
        when v_portal_state = 'historical' then 'unavailable'
        when v_has_hint and v_portal_state = 'none' then 'blocked'
        when v_completed <= p_as_of then 'available'
        else 'incoming'
      end;
      if v_portal_state = 'quote' then v_quote := v_quote + 1;
      elsif v_portal_state = 'order' then v_order := v_order + 1;
      elsif v_portal_state = 'historical' then v_sold := v_sold + 1;
      elsif v_supply_status = 'available' then v_complete := v_complete + 1; v_free := v_free + 1;
      elsif v_supply_status = 'incoming' then v_future := v_future + 1;
      end if;

      if v_has_hint and v_portal_state = 'none' then
        v_outcome := 'conflict';
        v_conflict_reason := 'commercial_source_hint_without_portal_match';
        v_conflicts := v_conflicts + 1;
      elsif v_unit.id is null then
        v_outcome := 'new'; v_new := v_new + 1;
      elsif v_unit.production_reference is not distinct from v_reference
        and v_unit.sales_order_number is not distinct from v_sales_order
        and v_unit.production_completed_at is not distinct from v_completed
        and v_unit.production_completed_week is not distinct from v_week
        and v_unit.production_completed_year is not distinct from v_year
        and v_unit.supply_status = v_supply_status then
        v_outcome := 'existing'; v_existing := v_existing + 1;
      else
        v_outcome := 'updated'; v_updated := v_updated + 1;
      end if;

      if p_confirm then
        if v_unit.id is not null then
          insert into public.planning_supply_unit_records
            (supply_unit_id, source_system, source_record_key)
          values (v_unit.id, 'manual_supply_import', v_source_key)
          on conflict (source_system, source_record_key) do nothing;
        end if;
        v_unit_id := public.planning_ingest_supply_unit(
          'manual_supply_import', v_source_key, btrim(p_item_number), v_serial,
          v_supply_status, now(), jsonb_strip_nulls(jsonb_build_object(
            'machine_ident_number', v_serial,
            'production_reference', v_reference,
            'sales_order_number', v_sales_order,
            'production_completed_at', v_completed,
            'production_completed_week', v_week,
            'production_completed_year', v_year,
            'available_at', v_completed
          ))
        );
        insert into public.planning_supply_import_batch_rows
          (batch_id, source_row_number, source_record_key, supply_unit_id,
            outcome, conflict_reason)
        values (v_batch.id, v_row_number, v_source_key, v_unit_id,
          v_outcome, v_conflict_reason);
      end if;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'rowNumber', v_row_number,
      'itemNumber', btrim(p_item_number),
      'serialNumber', v_serial,
      'machineIdentNumber', v_serial,
      'productionReference', v_reference,
      'salesOrderNumber', v_sales_order,
      'productionCompletedAt', v_completed,
      'productionCompletedWeek', v_week,
      'productionCompletedYear', v_year,
      'hasIgnoredCommercialData', v_has_hint,
      'validationError', v_error,
      'sourceRecordKey', v_source_key,
      'outcome', v_outcome,
      'supplyStatus', v_supply_status,
      'portalState', v_portal_state,
      'conflictReason', v_conflict_reason
    ));
  end loop;

  if p_confirm and (v_invalid > 0 or v_duplicates > 0) then
    raise exception using errcode = '23514', message = 'PLANNING_IMPORT_REQUIRES_CLEAN_PREVIEW';
  end if;
  if p_confirm then
    update public.planning_supply_import_batches set
      unique_serial_count = cardinality(v_seen),
      new_machine_count = v_new,
      existing_match_count = v_existing,
      updated_machine_count = v_updated,
      conflict_count = v_conflicts
    where id = v_batch.id;
    update public.planning_supply_sources set connected = true,
      last_synced_at = now()
    where source_system = 'manual_supply_import';
  end if;

  return jsonb_build_object(
    'preview', not p_confirm, 'alreadyImported', false,
    'batchId', case when p_confirm then v_batch.id else null end,
    'summary', jsonb_build_object(
      'sourceRows', v_total,
      'uniqueSerials', cardinality(v_seen),
      'newMachines', v_new,
      'existingMatches', v_existing,
      'updatedMachines', v_updated,
      'completedCandidates', v_complete,
      'futureUnits', v_future,
      'quoteReserved', v_quote,
      'orderReserved', v_order,
      'soldCompleted', v_sold,
      'freeStock', v_free,
      'duplicates', v_duplicates,
      'conflicts', v_conflicts,
      'invalidRows', v_invalid
    ),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.planning_process_supply_import(
  text,text,text,jsonb,boolean,date) from public, anon;
grant execute on function public.planning_process_supply_import(
  text,text,text,jsonb,boolean,date) to authenticated;

-- Commercial values shown on a Planning unit are resolved from the Portal's
-- canonical machine registry, never copied from the uploaded workbook.
create or replace function public.planning_get_unit_private_details(p_unit_id uuid)
returns table (
  dealer_name text,
  customer_name text,
  source_comment text,
  production_notes text,
  responsible_initials text
)
language sql stable security definer set search_path = ''
as $$
  select coalesce(pd.company_name, wd.company_name),
    coalesce(u.customer_name, w.customer_name),
    u.source_comment, u.production_notes, u.responsible_initials
  from public.planning_supply_units u
  left join public.dealer_accounts pd on pd.id = u.dealer_account_id
  left join lateral (
    select wr.dealer_account_id, wr.customer_name
    from public.warranty_registrations wr
    where regexp_replace(upper(coalesce(wr.machine_serial_number, '')),
      '[^A-Z0-9]+', '', 'g') = regexp_replace(upper(coalesce(u.serial_number, '')),
      '[^A-Z0-9]+', '', 'g')
      and coalesce(wr.is_active_in_source, true)
    order by wr.updated_at desc nulls last, wr.id desc
    limit 1
  ) w on true
  left join public.dealer_accounts wd on wd.id = w.dealer_account_id
  where u.id = p_unit_id
    and public.can_access_planning()
    and exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.portal_role::text = 'timan_backend'
        and a.approved is true and a.is_active is true
    );
$$;
revoke all on function public.planning_get_unit_private_details(uuid) from public, anon;
grant execute on function public.planning_get_unit_private_details(uuid) to authenticated;
