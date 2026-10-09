-- Keep the owner facet in one canonical CTE so rows and summary cards use
-- the same authorized owner cohort. Other list filters remain unchanged.
do $migration$
declare
  v_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_definition text;
  v_counts_anchor constant text := '), counts as (';
  v_count_source constant text := ' from classified_rows ), option_rows as (';
  v_filtered_source constant text := '), filtered_rows as ( select r.* from classified_rows r, args a where';
  v_owner_clause constant text := 'and ( a.owner_filter is null or (a.owner_filter like ''seller:%'' and r.owner_user_id::text = substring(a.owner_filter from 8)) or (a.owner_filter = ''other_timan_sellers'' and r.owner_is_timan_seller and not (r.owner_user_id = any(a.owner_excluded_seller_ids))) or (a.owner_filter = ''partner_created'' and r.created_by_partner) or (a.owner_filter = ''unassigned_timan_seller'' and not r.owner_is_timan_seller) ) ';
  v_owner_cte constant text := '), owner_filtered_rows as ( select r.* from classified_rows r, args a where ( a.owner_filter is null or (a.owner_filter like ''seller:%'' and r.owner_user_id::text = substring(a.owner_filter from 8)) or (a.owner_filter = ''other_timan_sellers'' and r.owner_is_timan_seller and not (r.owner_user_id = any(a.owner_excluded_seller_ids))) or (a.owner_filter = ''partner_created'' and r.created_by_partner) or (a.owner_filter = ''unassigned_timan_seller'' and not r.owner_is_timan_seller) ) ), counts as (';
begin
  select regexp_replace(pg_get_functiondef(v_signature::regprocedure), E'\\s+', ' ', 'g')
    into v_definition;

  if (length(v_definition) - length(replace(v_definition, v_counts_anchor, ''))) / length(v_counts_anchor) <> 1
    or position(v_count_source in v_definition) = 0
    or position(v_filtered_source in v_definition) = 0
    or position(v_owner_clause in v_definition) = 0
  then
    raise exception 'crm_leads_page_query does not match the verified owner-filter shape';
  end if;

  v_definition := replace(v_definition, v_owner_clause, '');
  v_definition := replace(v_definition, v_counts_anchor, v_owner_cte);
  v_definition := replace(v_definition, v_count_source, ' from owner_filtered_rows ), option_rows as (');
  v_definition := replace(
    v_definition,
    v_filtered_source,
    '), filtered_rows as ( select r.* from owner_filtered_rows r, args a where'
  );

  execute v_definition;

  if pg_get_functiondef(v_signature::regprocedure) not like '%owner_filtered_rows%'
    or pg_get_functiondef(v_signature::regprocedure) not like '%from owner_filtered_rows%'
  then
    raise exception 'crm_leads_page_query owner-filter cohort was not applied';
  end if;
end;
$migration$;
