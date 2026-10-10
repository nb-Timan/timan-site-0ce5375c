-- One-time server-administrator operation; execute only after the archive schema migration.
-- Explicit Timan approval: 2026-10-10, FINAL PRE-GO-LIVE QA CLEANUP.
-- No hard-delete, physical update, reservation rewrite or sequence reset.
begin isolation level repeatable read;
do $archive$
declare
  ids uuid[] := array[
    '40aac887-8ceb-44f8-ae5e-98ae906b4318',
    '97dcaa42-ddf1-4a60-b38d-a57b1966387b',
    '971c98c9-450e-410a-a44b-bb999d782350',
    'cfc41c91-13d3-4829-8c91-d323309cbbb5',
    'f0801ee7-2bd5-41fb-80f8-79c38d3180f0',
    '008c1e64-710d-40bc-8c15-f0dc1e3ac514',
    '75ad47cf-b88b-48ac-b77b-7b6561e53e25'
  ]::uuid[];
  numbers text[] := array['U-6601','U-6602','U-6603','U-6604','U-6605','U-6606','U-6607'];
  source_before jsonb := '{}'::jsonb;
  source_after jsonb := '{}'::jsonb;
  row_fingerprint text;
  policy_before text;
  policy_after text;
  acl_before text;
  acl_after text;
  allocator_before jsonb;
  allocator_after jsonb;
  archive_count integer;
  t record;
begin
  perform 1 from public.loan_cases c where c.id = any(ids) order by c.id for update;
  if (select count(*) from unnest(ids,numbers) q(id,number)
      join public.loan_cases c on c.id=q.id and c.loan_number=q.number
      where c.status::text in ('CANCELLED','CLOSED_OK')) <> 7 then
    raise exception 'STOP: exact seven approved terminal case identities do not match';
  end if;
  if exists(select 1 from private.loan_prelaunch_qa_archive where case_id=any(ids) or original_loan_number=any(numbers)) then
    raise exception 'STOP: archive already contains approved identities; inspect instead of replaying';
  end if;
  perform 1 from public.loan_asset_allocations a join public.loan_case_items i on i.id=a.case_item_id
    where i.case_id=any(ids) for update of a;
  if exists(select 1 from public.loan_asset_allocations a join public.loan_case_items i on i.id=a.case_item_id
      where i.case_id=any(ids) and a.allocation_status <> 'released') then
    raise exception 'STOP: a target still has an unreleased allocation; archive must not hide a reservation';
  end if;

  select jsonb_build_object('last_value',last_value,'is_called',is_called)
    into allocator_before from public.loan_number_seq;
  select md5(string_agg(concat(schemaname,tablename,policyname,cmd,roles,qual,with_check),'|' order by schemaname,tablename,policyname))
    into policy_before from pg_policies where schemaname in ('public','storage');
  select md5(string_agg(p.oid::text||coalesce(p.proacl::text,''),'|' order by p.oid))
    into acl_before from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'loan_%';

  -- Fingerprint every public source table and private storage metadata. This
  -- protects unapproved cases, physical stock, Product Master, CRM and users too.
  for t in select schemaname,tablename from pg_tables
      where schemaname='public' or (schemaname='storage' and tablename='objects')
      order by schemaname,tablename loop
    execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),%L order by md5(to_jsonb(r)::text)),%L)) from %I.%I r','','',t.schemaname,t.tablename)
      into row_fingerprint;
    source_before := source_before || jsonb_build_object(t.schemaname||'.'||t.tablename,row_fingerprint);
  end loop;

  insert into private.loan_prelaunch_qa_archive
    (case_id,original_loan_number,authorization_reference,archive_reason,original_case_checksum)
  select c.id,c.loan_number,'Timan explicit approval 2026-10-10: FINAL PRE-GO-LIVE QA CLEANUP',
    'Approved synthetic pre-launch case; retain immutable evidence outside operational Portal',
    md5(to_jsonb(c)::text)
  from public.loan_cases c join unnest(ids,numbers) q(id,number) on c.id=q.id and c.loan_number=q.number;
  get diagnostics archive_count = row_count;
  if archive_count <> 7 then raise exception 'STOP: expected exactly seven archive markers'; end if;

  for t in select schemaname,tablename from pg_tables
      where schemaname='public' or (schemaname='storage' and tablename='objects')
      order by schemaname,tablename loop
    execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),%L order by md5(to_jsonb(r)::text)),%L)) from %I.%I r','','',t.schemaname,t.tablename)
      into row_fingerprint;
    source_after := source_after || jsonb_build_object(t.schemaname||'.'||t.tablename,row_fingerprint);
  end loop;
  if source_before is distinct from source_after then raise exception 'STOP: protected source rows changed; transaction rolled back'; end if;
  select jsonb_build_object('last_value',last_value,'is_called',is_called)
    into allocator_after from public.loan_number_seq;
  if allocator_before is distinct from allocator_after then raise exception 'STOP: allocator changed during operation'; end if;
  select md5(string_agg(concat(schemaname,tablename,policyname,cmd,roles,qual,with_check),'|' order by schemaname,tablename,policyname))
    into policy_after from pg_policies where schemaname in ('public','storage');
  select md5(string_agg(p.oid::text||coalesce(p.proacl::text,''),'|' order by p.oid))
    into acl_after from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'loan_%';
  if policy_before is distinct from policy_after or acl_before is distinct from acl_after then
    raise exception 'STOP: existing policy/grant definition changed';
  end if;
  perform set_config('loans.qa_archive_evidence',jsonb_build_object(
    'archived',archive_count,'protected_tables',(select count(*) from jsonb_object_keys(source_before)),
    'protected_source_unchanged',source_before=source_after,
    'source_fingerprint',md5(source_before::text),'policies_unchanged',policy_before=policy_after,
    'function_acl_unchanged',acl_before=acl_after,'allocator',allocator_after,
    'next_number_if_no_concurrent_creation','U-'||((allocator_after->>'last_value')::bigint+case when (allocator_after->>'is_called')::boolean then 1 else 0 end),
    'markers',(select jsonb_agg(jsonb_build_object('case_id',q.case_id,'loan_number',q.original_loan_number,'original_case_checksum',q.original_case_checksum) order by q.original_loan_number)
      from private.loan_prelaunch_qa_archive q where q.case_id=any(ids))
  )::text,false);
end
$archive$;
commit;
select current_setting('loans.qa_archive_evidence')::jsonb as archive_evidence;
