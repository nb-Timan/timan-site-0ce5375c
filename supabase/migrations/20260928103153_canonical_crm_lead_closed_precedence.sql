-- Keep canonical closed lead state ahead of historical demo and linked-sales
-- presentation in every server-side CRM cohort. Rows and counters continue to
-- derive from the same display_status -> tab_bucket classification.
do $migration$
declare
  v_page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_dashboard_signature constant text := 'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)';
  v_page text;
  v_dashboard text;
  v_old_status constant text := 'case when coalesce(lse.has_submitted_order, false) then ''Vundet'' when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' when l.demo_has_run = ''yes'' then ''Demo afholdt'' else case';
  v_new_status constant text := 'case when lower(trim(coalesce(l.status, ''''))) = ''closed'' and l.pipeline_stage = ''Won'' then ''Vundet'' when lower(trim(coalesce(l.status, ''''))) = ''closed'' and l.pipeline_stage = ''Lost'' then ''Tabt'' when trim(coalesce(l.next_activity, '''')) in (''Closed with order'', ''Lukket med ordre'') then ''Vundet'' when trim(coalesce(l.next_activity, '''')) in (''Closed without order'', ''Lukket uden ordre'', ''Not relevant'') then ''Tabt'' when coalesce(lse.has_submitted_order, false) then ''Vundet'' when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' when l.demo_has_run = ''yes'' then ''Demo afholdt'' else case';
  v_old_probability constant text := 'case when coalesce(lse.has_submitted_order, false) then 100 when coalesce(lse.has_sent_quote, false) then 70 when l.demo_has_run = ''yes'' then coalesce(l.probability, 50) else case';
  v_new_probability constant text := 'case when lower(trim(coalesce(l.status, ''''))) = ''closed'' and l.pipeline_stage = ''Won'' then 100 when lower(trim(coalesce(l.status, ''''))) = ''closed'' and l.pipeline_stage = ''Lost'' then 0 when trim(coalesce(l.next_activity, '''')) in (''Closed with order'', ''Lukket med ordre'') then 100 when trim(coalesce(l.next_activity, '''')) in (''Closed without order'', ''Lukket uden ordre'', ''Not relevant'') then 0 when coalesce(lse.has_submitted_order, false) then 100 when coalesce(lse.has_sent_quote, false) then 70 when l.demo_has_run = ''yes'' then coalesce(l.probability, 50) else case';
begin
  select regexp_replace(pg_get_functiondef(v_page_signature::regprocedure), E'\\s+', ' ', 'g')
    into v_page;

  if (length(v_page) - length(replace(v_page, v_old_status, ''))) / length(v_old_status) <> 1
    or (length(v_page) - length(replace(v_page, v_old_probability, ''))) / length(v_old_probability) <> 1
    or position('count(*) filter (where tab_bucket = ''open'')' in v_page) = 0
    or position('when ''open'' then r.tab_bucket = ''open''' in v_page) = 0
  then
    raise exception 'crm_leads_page_query does not match the verified status/counter shape';
  end if;

  v_page := replace(v_page, v_old_status, v_new_status);
  v_page := replace(v_page, v_old_probability, v_new_probability);
  execute v_page;

  select regexp_replace(pg_get_functiondef(v_dashboard_signature::regprocedure), E'\\s+', ' ', 'g')
    into v_dashboard;

  if (length(v_dashboard) - length(replace(v_dashboard, v_old_status, ''))) / length(v_old_status) <> 1 then
    raise exception 'crm_dashboard_lead_kpis does not match the verified status shape';
  end if;

  v_dashboard := replace(v_dashboard, v_old_status, v_new_status);
  execute v_dashboard;

  if position(v_new_status in regexp_replace(pg_get_functiondef(v_page_signature::regprocedure), E'\\s+', ' ', 'g')) = 0
    or position(v_new_probability in regexp_replace(pg_get_functiondef(v_page_signature::regprocedure), E'\\s+', ' ', 'g')) = 0
    or position(v_new_status in regexp_replace(pg_get_functiondef(v_dashboard_signature::regprocedure), E'\\s+', ' ', 'g')) = 0
  then
    raise exception 'canonical CRM lead closed precedence was not applied';
  end if;
end;
$migration$;
