-- Commercial spreadsheet hints are provenance only. A missing Portal match is
-- normal supply data; only contradictory canonical identities require action.

create or replace function public.planning_supply_import_real_conflict_reason(
  p_item_number text,
  p_serial_number text,
  p_supply_unit_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_serial_key text := regexp_replace(upper(coalesce(p_serial_number, '')), '[^A-Z0-9]+', '', 'g');
  v_unit_id uuid := p_supply_unit_id;
  v_same_serial_count integer;
  v_other_item_count integer;
  v_order_relations integer;
  v_quote_relations integer;
  v_warranty_orders integer;
begin
  if v_serial_key = '' then
    return null;
  end if;

  select count(*), count(*) filter (where u.item_number <> btrim(p_item_number))
  into v_same_serial_count, v_other_item_count
  from public.planning_supply_units u
  where regexp_replace(upper(coalesce(u.serial_number, '')), '[^A-Z0-9]+', '', 'g') = v_serial_key;

  if v_same_serial_count > 1 then
    return 'duplicate_serial_identity';
  end if;
  if v_other_item_count > 0 then
    return 'serial_item_number_mismatch';
  end if;

  if v_unit_id is null then
    select u.id into v_unit_id
    from public.planning_supply_units u
    where u.item_number = btrim(p_item_number)
      and regexp_replace(upper(coalesce(u.serial_number, '')), '[^A-Z0-9]+', '', 'g') = v_serial_key
    order by u.source_updated_at desc, u.id
    limit 1;
  end if;

  if v_unit_id is not null then
    select
      count(distinct coalesce(r.configuration_id::text, nullif(r.demand_key, ''), r.id::text))
        filter (where r.reservation_type = 'order'),
      count(distinct coalesce(r.configuration_id::text, nullif(r.demand_key, ''), r.id::text))
        filter (where r.reservation_type in ('soft_quote', 'locked_quote'))
    into v_order_relations, v_quote_relations
    from public.planning_reservations r
    where r.supply_unit_id = v_unit_id and r.status = 'active';

    if v_order_relations > 1 then
      return 'multiple_active_order_relations';
    end if;
    if v_order_relations > 0 and v_quote_relations > 0 then
      return 'contradictory_order_quote_relations';
    end if;

    if exists (
      select 1
      from public.planning_supply_conflicts c
      where c.supply_unit_id = v_unit_id
        and c.status = 'open'
        and c.field_name <> 'commercial_relation'
    ) then
      return 'existing_canonical_conflict';
    end if;
  end if;

  select count(distinct coalesce(
    nullif(btrim(w.legacy_portal_order_number), ''),
    nullif(btrim(w.legacy_erp_order_number), '')
  ))
  into v_warranty_orders
  from public.warranty_registrations w
  where regexp_replace(upper(coalesce(w.machine_serial_number, '')), '[^A-Z0-9]+', '', 'g') = v_serial_key
    and coalesce(w.is_active_in_source, true)
    and coalesce(nullif(btrim(w.legacy_portal_order_number), ''),
      nullif(btrim(w.legacy_erp_order_number), '')) is not null;

  if v_warranty_orders > 1 then
    return 'multiple_portal_orders';
  end if;

  return null;
end;
$$;

revoke all on function public.planning_supply_import_real_conflict_reason(text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.planning_supply_import_real_conflict_reason(text,text,uuid)
  to service_role;

alter function public.planning_process_supply_import_core(
  text, text, text, jsonb, boolean, date
) rename to planning_process_supply_import_hint_legacy;

revoke all on function public.planning_process_supply_import_hint_legacy(
  text, text, text, jsonb, boolean, date
) from public, anon, authenticated;

create function public.planning_process_supply_import_core(
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
  v_sanitized_rows jsonb;
  v_result jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_original jsonb;
  v_unit public.planning_supply_units%rowtype;
  v_unit_id uuid;
  v_real_reason text;
  v_expected_status text;
  v_conflict_field text;
  v_outcome text;
  v_batch_id uuid;
  v_new integer := 0;
  v_existing integer := 0;
  v_updated integer := 0;
  v_complete integer := 0;
  v_future integer := 0;
  v_unknown integer := 0;
  v_quote integer := 0;
  v_order integer := 0;
  v_sold integer := 0;
  v_free integer := 0;
  v_duplicates integer := 0;
  v_conflicts integer := 0;
  v_invalid integer := 0;
begin
  select coalesce(jsonb_agg(
    jsonb_set(value, '{has_ignored_commercial_data}', 'false'::jsonb, true)
    order by ordinality
  ), '[]'::jsonb)
  into v_sanitized_rows
  from jsonb_array_elements(p_rows) with ordinality;

  v_result := public.planning_process_supply_import_hint_legacy(
    p_file_name, p_file_sha256, p_item_number, v_sanitized_rows, p_confirm, p_as_of
  );

  if coalesce(v_result ->> 'alreadyImported', 'false')::boolean
    or jsonb_typeof(v_result -> 'rows') <> 'array'
    or jsonb_array_length(v_result -> 'rows') = 0 then
    return v_result;
  end if;

  v_batch_id := nullif(v_result ->> 'batchId', '')::uuid;

  for v_row in select value from jsonb_array_elements(v_result -> 'rows')
  loop
    select value into v_original
    from jsonb_array_elements(p_rows)
    where coalesce((value ->> 'row_number')::integer, 0)
      = coalesce((v_row ->> 'rowNumber')::integer, 0)
    limit 1;

    v_unit := null;
    v_unit_id := null;
    v_real_reason := null;
    v_expected_status := v_row ->> 'supplyStatus';
    v_outcome := v_row ->> 'outcome';

    if v_row ->> 'validationError' is null then
      select u.* into v_unit
      from public.planning_supply_units u
      where u.item_number = btrim(p_item_number)
        and regexp_replace(upper(coalesce(u.serial_number, '')), '[^A-Z0-9]+', '', 'g')
          = regexp_replace(upper(coalesce(v_row ->> 'serialNumber', '')), '[^A-Z0-9]+', '', 'g')
      order by u.source_updated_at desc, u.id
      limit 1;
      v_unit_id := v_unit.id;

      if v_unit_id is null then
        select u.* into v_unit
        from public.planning_supply_units u
        where regexp_replace(upper(coalesce(u.serial_number, '')), '[^A-Z0-9]+', '', 'g')
          = regexp_replace(upper(coalesce(v_row ->> 'serialNumber', '')), '[^A-Z0-9]+', '', 'g')
        order by u.source_updated_at desc, u.id
        limit 1;
        v_unit_id := v_unit.id;
      end if;

      v_real_reason := public.planning_supply_import_real_conflict_reason(
        p_item_number, v_row ->> 'serialNumber', v_unit_id
      );

      if v_real_reason is null and v_unit.id is not null
        and v_unit.production_reference is not null
        and v_row ->> 'productionReference' is not null
        and v_unit.production_reference <> v_row ->> 'productionReference' then
        v_real_reason := 'conflicting_production_identity';
      end if;

      v_expected_status := case
        when v_real_reason is not null then 'blocked'
        when v_row ->> 'portalState' = 'historical' then 'unavailable'
        when v_row ->> 'productionCompletedAt' is null then 'in_production'
        when (v_row ->> 'productionCompletedAt')::date <= p_as_of then 'available'
        else 'incoming'
      end;

      if v_real_reason is not null then
        v_outcome := 'conflict';
        v_conflict_field := case v_real_reason
          when 'serial_item_number_mismatch' then 'item_number'
          when 'duplicate_serial_identity' then 'serial_number'
          when 'conflicting_production_identity' then 'production_reference'
          else 'portal_relation'
        end;

        if p_confirm and v_unit_id is not null then
          insert into public.planning_supply_conflicts
            (supply_unit_id, field_name, existing_value, incoming_value,
              existing_source_system, incoming_source_system)
          values (
            v_unit_id,
            v_conflict_field,
            coalesce(to_jsonb(v_unit) ->> v_conflict_field, v_real_reason),
            coalesce(v_row ->> case v_conflict_field
              when 'item_number' then 'itemNumber'
              when 'serial_number' then 'serialNumber'
              when 'production_reference' then 'productionReference'
              else 'portalState'
            end, v_real_reason),
            coalesce(v_unit.source_system, 'portal'),
            'manual_supply_import'
          )
          on conflict (supply_unit_id, field_name) where status = 'open'
          do update set incoming_value = excluded.incoming_value,
            detected_at = now(), resolved_at = null;

          update public.planning_supply_units
          set supply_status = 'blocked', ingested_at = now()
          where id = v_unit_id;

          update public.planning_supply_import_batch_rows
          set outcome = 'conflict', conflict_reason = v_real_reason
          where batch_id = v_batch_id
            and source_record_key = v_row ->> 'sourceRecordKey';
        end if;
      elsif p_confirm and v_unit_id is not null then
        update public.planning_supply_conflicts
        set status = 'resolved', resolved_at = now()
        where supply_unit_id = v_unit_id
          and field_name = 'commercial_relation'
          and status = 'open';
      end if;

      v_row := v_row
        || jsonb_build_object(
          'hasIgnoredCommercialData', coalesce((v_original ->> 'has_ignored_commercial_data')::boolean, false),
          'outcome', v_outcome,
          'supplyStatus', v_expected_status,
          'conflictReason', v_real_reason
        );
    end if;

    v_rows := v_rows || jsonb_build_array(v_row);

    if v_outcome = 'new' then v_new := v_new + 1;
    elsif v_outcome = 'existing' then v_existing := v_existing + 1;
    elsif v_outcome = 'updated' then v_updated := v_updated + 1;
    elsif v_outcome = 'duplicate' then v_duplicates := v_duplicates + 1;
    elsif v_outcome = 'conflict' then v_conflicts := v_conflicts + 1;
    elsif v_outcome = 'invalid' then v_invalid := v_invalid + 1;
    end if;

    if v_row ->> 'validationError' is null then
      if v_row ->> 'portalState' = 'quote' then v_quote := v_quote + 1;
      elsif v_row ->> 'portalState' = 'order' then v_order := v_order + 1;
      elsif v_row ->> 'portalState' = 'historical' then v_sold := v_sold + 1;
      elsif v_expected_status = 'available' then v_complete := v_complete + 1; v_free := v_free + 1;
      elsif v_expected_status = 'incoming' then v_future := v_future + 1;
      elsif v_expected_status = 'in_production' then v_unknown := v_unknown + 1;
      end if;
    end if;
  end loop;

  v_result := jsonb_set(v_result, '{rows}', v_rows, true);
  v_result := jsonb_set(v_result, '{summary}',
    (v_result -> 'summary') || jsonb_build_object(
      'newMachines', v_new,
      'existingMatches', v_existing,
      'updatedMachines', v_updated,
      'completedCandidates', v_complete,
      'futureUnits', v_future,
      'plannedDateUnknown', v_unknown,
      'quoteReserved', v_quote,
      'orderReserved', v_order,
      'soldCompleted', v_sold,
      'freeStock', v_free,
      'duplicates', v_duplicates,
      'conflicts', v_conflicts,
      'invalidRows', v_invalid
    ), true);

  if p_confirm and v_batch_id is not null then
    update public.planning_supply_import_batches
    set new_machine_count = v_new,
      existing_match_count = v_existing,
      updated_machine_count = v_updated,
      conflict_count = v_conflicts
    where id = v_batch_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.planning_process_supply_import_core(
  text, text, text, jsonb, boolean, date
) from public, anon, authenticated;

create or replace function public.planning_reject_conflicted_supply_import()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.outcome = 'conflict' and not exists (
    select 1
    from public.planning_supply_conflicts c
    where c.supply_unit_id = new.supply_unit_id
      and c.status = 'open'
      and c.field_name <> 'commercial_relation'
  ) then
    raise exception using
      errcode = '23514',
      message = 'PLANNING_IMPORT_REQUIRES_CLEAN_PREVIEW';
  end if;
  return new;
end;
$$;

revoke all on function public.planning_reject_conflicted_supply_import()
  from public, anon, authenticated;
grant execute on function public.planning_reject_conflicted_supply_import()
  to service_role;

-- Reclassify only the historical false-positive conflict shape. The helper
-- deliberately ignores commercial_relation itself and blocks real conflicts.
with reclassifiable as (
  select u.id,
    case
      when exists (
        select 1 from public.warranty_registrations w
        where regexp_replace(upper(coalesce(w.machine_serial_number, '')), '[^A-Z0-9]+', '', 'g')
          = regexp_replace(upper(coalesce(u.serial_number, '')), '[^A-Z0-9]+', '', 'g')
          and coalesce(w.is_active_in_source, true)
      ) then 'unavailable'
      when u.production_completed_at is null then 'in_production'
      when u.production_completed_at <= current_date then 'available'
      else 'incoming'
    end as next_status
  from public.planning_supply_units u
  join public.planning_supply_conflicts c
    on c.supply_unit_id = u.id
    and c.field_name = 'commercial_relation'
    and c.status = 'open'
  where c.existing_value = 'portal_relation_missing'
    and public.planning_supply_import_real_conflict_reason(
      u.item_number, u.serial_number, u.id
    ) is null
)
update public.planning_supply_units u
set supply_status = r.next_status,
  ingested_at = now()
from reclassifiable r
where u.id = r.id;

update public.planning_supply_conflicts c
set status = 'resolved', resolved_at = now()
from public.planning_supply_units u
where u.id = c.supply_unit_id
  and c.field_name = 'commercial_relation'
  and c.status = 'open'
  and c.existing_value = 'portal_relation_missing'
  and public.planning_supply_import_real_conflict_reason(
    u.item_number, u.serial_number, u.id
  ) is null;

comment on function public.planning_supply_import_real_conflict_reason(text,text,uuid)
  is 'Returns only objective canonical Planning conflicts; unmatched commercial source hints are not conflicts.';
