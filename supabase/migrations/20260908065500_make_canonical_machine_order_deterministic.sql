-- Duplicate source rows for one serial must resolve deterministically. This
-- keeps the canonical SP row and its MO assignment together.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'machine_registry_page_scoped'
    and pg_get_function_identity_arguments(p.oid) =
      'p_allowed_dealers text[], p_query text, p_dealer text, p_model text, p_warranty_type text, p_health text, p_warranty_match text, p_demo_only boolean, p_date_from date, p_date_to date, p_sort text, p_direction text, p_limit integer, p_offset integer';

  if v_definition is null or position('wr.delivery_date desc nulls last,wr.created_at desc' in v_definition) = 0 then
    raise exception 'machine registry function did not contain the expected canonical source ordering';
  end if;

  execute replace(
    v_definition,
    'wr.delivery_date desc nulls last,wr.created_at desc',
    'wr.delivery_date desc nulls last,wr.created_at desc,wr.sharepoint_form_id desc nulls last,wr.id'
  );
end
$$;
