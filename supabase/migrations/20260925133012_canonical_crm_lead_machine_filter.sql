-- Keep the CRM Leads machine facet stable and human-readable while preserving
-- the existing raw machine/equipment snapshots on each lead.
create or replace function public.crm_lead_equipment_values(
  p_machine text,
  p_equipment text default null
)
returns text[]
language plpgsql
immutable
parallel safe
security invoker
set search_path = public
as $function$
declare
  result text[] := '{}'::text[];
  source text;
  segment text;
  part text;
begin
  foreach source in array array[coalesce(p_machine, ''), coalesce(p_equipment, '')]
  loop
    if nullif(trim(source), '') is null then
      continue;
    end if;

    source := regexp_replace(
      source,
      ',[[:space:]]*Equipment:',
      chr(31) || 'Equipment:',
      'gi'
    );

    foreach segment in array string_to_array(source, chr(31))
    loop
      segment := trim(segment);
      if segment = '' then
        continue;
      end if;

      if segment ~* '^Equipment:' then
        if not segment = any(result) then
          result := array_append(result, segment);
        end if;
        continue;
      end if;

      foreach part in array string_to_array(segment, ',')
      loop
        part := trim(part);
        if part <> ''
          and lower(part) not in ('all', 'equipment')
          and part !~* '^(rc[-[:space:]]?751|rc[-[:space:]]?1000s?|timan[[:space:]]*2620|new[[:space:]]*2620|2620|timan[[:space:]]*3330|3330|cs[-[:space:]]?200[[:space:]]+tractor|loader[[:space:]]*line[[:space:]]*/[[:space:]]*tractor[[:space:]]*equipment|full[[:space:]]*line|tool[-[:space:]]?trac[[:space:]]*5740|third[-[:space:]]*party[[:space:]]*equipment)$'
          and not part = any(result)
        then
          result := array_append(result, part);
        end if;
      end loop;
    end loop;
  end loop;

  return result;
end;
$function$;

create or replace function public.crm_lead_machine_families(
  p_machine text,
  p_equipment text default null
)
returns text[]
language plpgsql
immutable
parallel safe
security invoker
set search_path = public
as $function$
declare
  result text[] := '{}'::text[];
  source text := coalesce(p_machine, '');
begin
  if source ~* '(^|,[[:space:]]*)rc[-[:space:]]?751([[:space:]]*,|$)' then
    result := array_append(result, 'RC-751');
  end if;
  if source ~* '(^|,[[:space:]]*)rc[-[:space:]]?1000s?([[:space:]]*,|$)' then
    result := array_append(result, 'RC-1000s');
  end if;
  if source ~* '(^|,[[:space:]]*)(timan[[:space:]]*2620|new[[:space:]]*2620|2620)([[:space:]]*,|$)' then
    result := array_append(result, 'Timan 2620');
  end if;
  if source ~* '(^|,[[:space:]]*)(timan[[:space:]]*)?3330([[:space:]]*,|$)' then
    result := array_append(result, 'Timan 3330');
  end if;
  if source ~* '(^|,[[:space:]]*)cs[-[:space:]]?200[[:space:]]+tractor([[:space:]]*,|$)'
    or source ~* 'Equipment:[[:space:]]*Loader[[:space:]]*line[[:space:]]*/[[:space:]]*Tractor[[:space:]]*Equipment[[:space:]]*-[[:space:]]*Tractor[[:space:]]*-'
  then
    result := array_append(result, 'CS-200 til traktor');
  end if;
  if source ~* '(^|,[[:space:]]*)(loader[[:space:]]*line[[:space:]]*/[[:space:]]*tractor[[:space:]]*equipment|full[[:space:]]*line|tool[-[:space:]]?trac[[:space:]]*5740|third[-[:space:]]*party[[:space:]]*equipment)([[:space:]]*,|$)' then
    result := array_append(result, 'Loader-Line');
  end if;
  if cardinality(result) = 0
    and (
      source ~* '(^|,[[:space:]]*)equipment([[:space:]]*,|$)'
      or cardinality(public.crm_lead_equipment_values(p_machine, p_equipment)) > 0
    )
  then
    result := array_append(result, 'Kun redskab');
  end if;

  return result;
end;
$function$;

revoke all on function public.crm_lead_equipment_values(text, text) from public;
revoke all on function public.crm_lead_machine_families(text, text) from public;
grant execute on function public.crm_lead_equipment_values(text, text) to anon, authenticated, service_role;
grant execute on function public.crm_lead_machine_families(text, text) to anon, authenticated, service_role;

-- Patch only the two list-filter predicates in the current canonical RPC. This
-- preserves owner scope, View-as, counters, status handling, and result shape.
do $migration$
declare
  signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  definition text;
  old_machine constant text := 'and ( p_machine_filter is null or p_machine_filter = '''' or exists ( select 1 from unnest(string_to_array(coalesce(r.machine, ''''), '','')) part where trim(part) = p_machine_filter ) )';
  new_machine constant text := 'and ( p_machine_filter is null or p_machine_filter = '''' or p_machine_filter = any(public.crm_lead_machine_families(r.machine, r.equipment)) )';
  old_equipment constant text := 'and ( p_equipment_filter is null or p_equipment_filter = '''' or exists ( select 1 from unnest(string_to_array(coalesce(r.equipment, ''''), '','')) part where trim(part) = p_equipment_filter ) )';
  new_equipment constant text := 'and ( p_equipment_filter is null or p_equipment_filter = '''' or p_equipment_filter = any(public.crm_lead_equipment_values(r.machine, r.equipment)) )';
begin
  select regexp_replace(pg_get_functiondef(signature::regprocedure), E'\\s+', ' ', 'g')
    into definition;

  if position(old_machine in definition) = 0
    or position(old_equipment in definition) = 0
  then
    raise exception 'crm_leads_page_query does not match the verified machine/equipment filter shape';
  end if;

  definition := replace(definition, old_machine, new_machine);
  definition := replace(definition, old_equipment, new_equipment);
  execute definition;

  if position('crm_lead_machine_families(r.machine, r.equipment)' in pg_get_functiondef(signature::regprocedure)) = 0
    or position('crm_lead_equipment_values(r.machine, r.equipment)' in pg_get_functiondef(signature::regprocedure)) = 0
  then
    raise exception 'canonical CRM lead machine/equipment filters were not applied';
  end if;
end;
$migration$;
