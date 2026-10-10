-- Canonical production RPC test; all test writes are rolled back in a subtransaction.
-- This is not a migration or a real Fabric snapshot. No private field values are returned.
do $test$
declare
  before_users jsonb;
  after_users jsonb;
  before_dealers text;
  before_relations text;
  before_shadow jsonb;
  after_shadow jsonb;
  snapshot uuid := gen_random_uuid();
  amount integer;
  changes jsonb;
  result jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') into before_users from public.app_users u;
  select md5(coalesce(jsonb_agg(to_jsonb(d) order by id)::text,'[]')) into before_dealers from public.dealer_accounts d;
  select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]')) into before_relations from public.partner_account_relations r;
  select jsonb_build_object(
    'rows',(select coalesce(jsonb_agg(to_jsonb(s) order by company,source_row_number),'[]') from public.fabric_partner_master_shadow s),
    'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by snapshot_id),'[]') from public.fabric_partner_shadow_runs r),
    'state',(select to_jsonb(s) from public.fabric_partner_shadow_state s)
  ) into before_shadow;
  if jsonb_array_length(before_shadow->'rows')<>0 or jsonb_array_length(before_shadow->'runs')<>0
    or (before_shadow->'state'->>'row_count')::integer<>0 then
    raise exception 'ISOLATED_TEST_REQUIRES_UNUSED_SHADOW';
  end if;
  begin
    amount := public.fabric_partner_shadow_ingest(snapshot,now(),jsonb_build_array(jsonb_build_object(
      'company','DAT','account_number','CODEX_SHADOW_ISOLATED_TEST','account_raw','CODEX_SHADOW_ISOLATED_TEST',
      'company_name','Isolated shadow verification - rolled back','address1',null,'address2',null,
      'postal_code',null,'city',null,'zipcity_raw',null,'zipcity_validation','EMPTY','country',null,'iso_country','DK',
      'phone',null,'email',null,'c5_invoice_account_number',null,'c5_group',null,'c5_partner_type_code','5',
      'c5_salesrep',null,'language',0,'vat_number',null,'currency','DKK','payment',null,
      'c5_blocked',0,'c5_approved',1,'source_row_number',-9999991,'source_last_changed',null
    )));
    if amount<>1 or not exists(select 1 from public.fabric_partner_master_shadow where source_row_number=-9999991)
      or not exists(select 1 from public.fabric_partner_shadow_runs where snapshot_id=snapshot) then
      raise exception 'ISOLATED_SHADOW_WRITE_NOT_PROVEN';
    end if;
    select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') into after_users from public.app_users u;
    select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(b.row->>'id',a.row->>'id'),
      'columns',(select jsonb_agg(k order by k) from (
        select jsonb_object_keys(coalesce(b.row,'{}')) k union select jsonb_object_keys(coalesce(a.row,'{}')) k
      ) keys where b.row->k is distinct from a.row->k))), '[]') into changes
    from jsonb_array_elements(before_users) b(row)
    full join jsonb_array_elements(after_users) a(row) on b.row->>'id'=a.row->>'id'
    where b.row is distinct from a.row;
    result := jsonb_build_object('test','isolated_production_rpc', 'shadow_rows_written',amount,
      'user_rows_checked',jsonb_array_length(before_users),'app_users_unchanged',before_users=after_users,
      'changed_user_rows',changes,
      'dealer_accounts_unchanged',before_dealers=(select md5(coalesce(jsonb_agg(to_jsonb(d) order by id)::text,'[]')) from public.dealer_accounts d),
      'relations_unchanged',before_relations=(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id)::text,'[]')) from public.partner_account_relations r),
      'tested_at',clock_timestamp());
    raise exception using errcode='ZX001',message='ROLLBACK_ISOLATED_SHADOW_TEST';
  exception when sqlstate 'ZX001' then
    null;
  end;
  select jsonb_build_object(
    'rows',(select coalesce(jsonb_agg(to_jsonb(s) order by company,source_row_number),'[]') from public.fabric_partner_master_shadow s),
    'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by snapshot_id),'[]') from public.fabric_partner_shadow_runs r),
    'state',(select to_jsonb(s) from public.fabric_partner_shadow_state s)
  ) into after_shadow;
  result := result || jsonb_build_object('shadow_test_rolled_back',before_shadow=after_shadow,
    'app_users_unchanged_after_rollback',before_users=(select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') from public.app_users u));
  perform set_config('timan.shadow_safety_result',result::text,true);
end $test$;
select current_setting('timan.shadow_safety_result')::jsonb as controlled_result;
