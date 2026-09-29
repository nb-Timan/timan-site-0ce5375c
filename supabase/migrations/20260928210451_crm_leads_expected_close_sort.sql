-- Add canonical expected-close sorting to the existing paged Leads RPC while
-- preserving its current cohort predicates, counters, owner scope and RLS.
do $migration$
declare
  signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  definition text;
  old_open_date constant text := 'l.next_followup_date::text as next_followup, case';
  new_open_date constant text := 'l.next_followup_date::text as next_followup, l.expected_close_date::text as expected_close_date, case';
  old_demo_date constant text := 'd.followup_date::text as next_followup, d.result_status as display_status';
  new_demo_date constant text := 'd.followup_date::text as next_followup, null::text as expected_close_date, d.result_status as display_status';
  old_sort constant text := 'case when p_sort = ''prob_desc'' then coalesce(probability, -1) end desc, case when p_sort = ''default''';
  new_sort constant text := 'case when p_sort = ''prob_desc'' then coalesce(probability, -1) end desc, case when p_sort = ''expected_close_asc'' then expected_close_date end asc nulls last, case when p_sort = ''expected_close_desc'' then expected_close_date end desc nulls last, case when p_sort = ''default''';
  old_json constant text := '''next_followup'', next_followup, ''status'', display_status';
  new_json constant text := '''next_followup'', next_followup, ''expected_close_date'', expected_close_date, ''status'', display_status';
begin
  select regexp_replace(pg_get_functiondef(signature::regprocedure), E'\\s+', ' ', 'g')
    into definition;

  if position('expected_close_asc' in definition) > 0
    or position(old_open_date in definition) = 0
    or position(old_demo_date in definition) = 0
    or position(old_sort in definition) = 0
    or position(old_json in definition) = 0
  then
    raise exception 'crm_leads_page_query does not match the verified expected-close sort shape';
  end if;

  definition := replace(definition, old_open_date, new_open_date);
  definition := replace(definition, old_demo_date, new_demo_date);
  definition := replace(definition, old_sort, new_sort);
  definition := replace(definition, old_json, new_json);
  execute definition;

  definition := regexp_replace(pg_get_functiondef(signature::regprocedure), E'\\s+', ' ', 'g');
  if position('l.expected_close_date::text as expected_close_date' in definition) = 0
    or position('expected_close_asc' in definition) = 0
    or position('expected_close_desc' in definition) = 0
    or position('nulls last' in definition) = 0
  then
    raise exception 'canonical CRM expected-close sorting was not applied';
  end if;
end;
$migration$;
