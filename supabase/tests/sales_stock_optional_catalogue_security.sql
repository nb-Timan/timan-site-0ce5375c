-- Read-only assertions, also executed by the isolated PGlite runner.
do $$
declare v_table text; v_function text; v_role text; v_permission text;
begin
  foreach v_table in array array['configurations','sales_stock_configuration_assets','sales_stock_pricing_audit'] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||v_table)::regclass) then
      raise exception 'RLS must remain enabled: %',v_table;
    end if;
  end loop;
  foreach v_table in array array['sales_stock_configuration_assets','sales_stock_pricing_audit'] loop
    foreach v_role in array array['anon','authenticated'] loop
      foreach v_permission in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
        if has_table_privilege(v_role,'public.'||v_table,v_permission) then
          raise exception 'Direct client writes must remain denied: % % %',v_role,v_table,v_permission;
        end if;
      end loop;
    end loop;
  end loop;
  foreach v_function in array array['guard_sales_stock_configuration','sync_sales_stock_configuration_assets',
    'sales_stock_actor_can_manage','sales_stock_guard_physical_group','loan_guard_asset_allocation'] loop
    foreach v_role in array array['anon','authenticated'] loop
      if has_function_privilege(v_role,'public.'||v_function||'()','EXECUTE') then
        raise exception 'Private helper must not be client executable: % %',v_role,v_function;
      end if;
    end loop;
    if not (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc
      where oid=('public.'||v_function||'()')::regprocedure) then
      raise exception 'Private helper must retain definer/empty search path: %',v_function;
    end if;
  end loop;
  if not exists(select 1 from pg_index where indexrelid='public.sales_stock_asset_one_live_sale_idx'::regclass
    and indisunique and indisvalid and pg_get_expr(indpred,indrelid) like '%ACTIVE%' and pg_get_expr(indpred,indrelid) like '%SOLD%') then
    raise exception 'One live physical sale uniqueness must remain intact';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.sales_stock_configuration_assets'::regclass
    and tgname='sales_stock_guard_physical_group_trigger' and tgenabled='O') then
    raise exception 'Shared Brik reservation trigger must remain enabled';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.sales_stock_pricing_audit'::regclass
    and tgname='prevent_sales_stock_pricing_audit_mutation' and tgenabled='O') then
    raise exception 'Append-only pricing audit trigger must remain enabled';
  end if;
  if exists(select 1 from pg_attribute where attrelid='public.sales_stock_configuration_assets'::regclass
    and attname in ('catalog_item_number','item_type','original_list_price') and attnotnull) then
    raise exception 'Unknown catalogue/type/original facts must be nullable';
  end if;
  if not exists(select 1 from pg_attribute where attrelid='public.sales_stock_configuration_assets'::regclass
    and attname='quantity' and atttypid='numeric'::regtype and attnotnull) then
    raise exception 'Quantity must be a separate native numeric fact';
  end if;
end;
$$;
