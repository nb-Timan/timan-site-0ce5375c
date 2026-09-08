-- Financial machine fields are internal Timan data. Keep the existing RLS
-- scope unchanged, but make the read model return null for external users.
do $$
declare
  v_definition text;
  v_old_payload text := '''revenue'',revenue,''costAmount'',cost_amount,''contributionMarginAmount'',contribution_margin_amount,''grossSalesPrice'',gross_sales_price,''discountAmount'',discount_amount,''discountPercent'',discount_percent,';
  v_new_payload text := '''revenue'',case when (select can_view_financials from request_access) then revenue else null end,''costAmount'',case when (select can_view_financials from request_access) then cost_amount else null end,''contributionMarginAmount'',case when (select can_view_financials from request_access) then contribution_margin_amount else null end,''grossSalesPrice'',case when (select can_view_financials from request_access) then gross_sales_price else null end,''discountAmount'',case when (select can_view_financials from request_access) then discount_amount else null end,''discountPercent'',case when (select can_view_financials from request_access) then discount_percent else null end,';
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
  if position('with legacy_commercial as (' in v_definition) = 0
    or position(v_old_payload in v_definition) = 0 then
    raise exception 'machine_registry_page_scoped does not match the expected commercial read model';
  end if;

  v_definition := replace(
    v_definition,
    'with legacy_commercial as (',
    $replacement$with request_access as (
  select exists (
    select 1 from public.app_users au
    where au.portal_role in ('timan_backend', 'timan_service', 'timan_seller')
      and coalesce(au.is_active, false) and coalesce(au.approved, false)
      and (au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  ) as can_view_financials
), legacy_commercial as ($replacement$
  );
  v_definition := replace(v_definition, v_old_payload, v_new_payload);
  execute v_definition;
end
$$;
