-- Reuse the existing Leads cohort parameter for the canonical two-calendar-month
-- Expected Close filter. Overdue follow-up remains independent and unchanged.
do $migration$
declare
  signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  definition text;
  old_args_end constant text := '(timezone(''Europe/Copenhagen'', coalesce(p_now, now())))::date as today ), demo_source_leads as (';
  new_args_end constant text := '(timezone(''Europe/Copenhagen'', coalesce(p_now, now())))::date as today ), expected_close_window as ( select today as start_date, make_date( extract(year from (date_trunc(''month'', today)::date + interval ''2 months''))::integer, extract(month from (date_trunc(''month'', today)::date + interval ''2 months''))::integer, least( extract(day from today)::integer, extract(day from ((date_trunc(''month'', today)::date + interval ''3 months'') - interval ''1 day''))::integer ) ) as end_date from args ), demo_source_leads as (';
  old_classification constant text := 'end as followup_tone, concat_ws(';
  new_classification constant text := 'end as followup_tone, ( r.expected_close_date is not null and r.expected_close_date::date >= (select start_date from expected_close_window) and r.expected_close_date::date <= (select end_date from expected_close_window) ) as expected_close_in_two_months, concat_ws(';
  old_later_count constant text := 'count(*) filter (where tab_bucket = ''open'' and followup_tone = ''later'')::int as later_count';
  new_later_count constant text := 'count(*) filter (where tab_bucket = ''open'' and expected_close_in_two_months)::int as later_count';
  old_filter constant text := 'p_followup_filter is null or (r.tab_bucket = ''open'' and r.followup_tone = p_followup_filter)';
  new_filter constant text := 'p_followup_filter is null or ( r.tab_bucket = ''open'' and ( (p_followup_filter = ''overdue'' and r.followup_tone = ''overdue'') or (p_followup_filter = ''later'' and r.expected_close_in_two_months) ) )';
  old_desc_sort constant text := ', case when p_sort = ''expected_close_desc'' then expected_close_date end desc nulls last';
begin
  select regexp_replace(pg_get_functiondef(signature::regprocedure), E'\\s+', ' ', 'g')
    into definition;

  if position(old_args_end in definition) = 0
    or position(old_classification in definition) = 0
    or position(old_later_count in definition) = 0
    or position(old_filter in definition) = 0
    or position(old_desc_sort in definition) = 0
  then
    raise exception 'crm_leads_page_query does not match the verified Expected Close filter shape';
  end if;

  definition := replace(definition, old_args_end, new_args_end);
  definition := replace(definition, old_classification, new_classification);
  definition := replace(definition, old_later_count, new_later_count);
  definition := replace(definition, old_filter, new_filter);
  definition := replace(definition, old_desc_sort, '');
  execute definition;

  definition := regexp_replace(pg_get_functiondef(signature::regprocedure), E'\\s+', ' ', 'g');
  if position('expected_close_in_two_months' in definition) = 0
    or position('p_followup_filter = ''later'' and r.expected_close_in_two_months' in definition) = 0
    or position('expected_close_asc' in definition) = 0
    or position('expected_close_desc' in definition) > 0
  then
    raise exception 'canonical CRM Expected Close filter was not applied';
  end if;
end;
$migration$;
