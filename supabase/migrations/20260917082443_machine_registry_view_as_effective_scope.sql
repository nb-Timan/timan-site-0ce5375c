-- An explicit dealer allow-list is a presentation-scope reduction during
-- Backend View-as. It must win over the authenticated Backend JWT; global
-- access is only appropriate when callers intentionally pass NULL.
do $$
declare
  v_definition text;
  v_old_scope_predicate text :=
    'and (not (select public.is_timan_global_warranty()) or p_allowed_dealers is null or wr.dealer_account_number=any(p_allowed_dealers))';
  v_new_scope_predicate text :=
    'and (case when p_allowed_dealers is null then (select public.is_timan_global_warranty()) else wr.dealer_account_number=any(p_allowed_dealers) end)';
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'machine_registry_page_scoped'
    and pg_get_function_identity_arguments(p.oid) =
      'p_allowed_dealers text[], p_query text, p_dealer text, p_model text, p_warranty_type text, p_health text, p_warranty_match text, p_demo_only boolean, p_date_from date, p_date_to date, p_sort text, p_direction text, p_limit integer, p_offset integer';

  if v_definition is null then
    raise exception 'Expected machine_registry_page_scoped signature is missing';
  end if;
  if position(v_old_scope_predicate in v_definition) = 0 then
    raise exception 'machine_registry_page_scoped does not match the expected View-as scope predicate';
  end if;

  execute replace(v_definition, v_old_scope_predicate, v_new_scope_predicate);
end
$$;
