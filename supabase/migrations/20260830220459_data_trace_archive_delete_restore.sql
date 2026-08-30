-- Backend-only data trace archive/delete/restore.
--
-- This is intentionally not soft delete in active domain tables. A successful
-- delete stores a complete restore package in a private schema first, then
-- removes supported exclusive rows from public active tables.

create schema if not exists private_archive;

create sequence if not exists private_archive.data_trace_deletion_number_seq
  start with 1
  increment by 1;

create table if not exists private_archive.data_trace_deletions (
  id uuid primary key default gen_random_uuid(),
  deletion_number text not null unique,
  archive_schema_version integer not null default 1,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid not null references public.app_users(id) on delete restrict,
  deleted_by_email text not null,
  root_lookup_type text not null,
  root_identifier text not null,
  reason text not null,
  preview jsonb not null,
  record_count integer not null default 0,
  status text not null default 'deleted',
  restored_at timestamptz,
  restored_by_user_id uuid references public.app_users(id) on delete restrict,
  restored_by_email text,
  restore_status text,
  restore_error text,
  constraint data_trace_deletions_status_check
    check (status in ('deleted', 'restored', 'restore_blocked')),
  constraint data_trace_deletions_restore_status_check
    check (restore_status is null or restore_status in ('success', 'blocked', 'failed'))
);

create table if not exists private_archive.data_trace_archive_records (
  id bigserial primary key,
  deletion_id uuid not null references private_archive.data_trace_deletions(id) on delete cascade,
  table_schema text not null default 'public',
  table_name text not null,
  primary_key jsonb not null,
  row_data jsonb not null,
  restore_order integer not null,
  delete_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.data_trace_delete_audit_log (
  id uuid primary key default gen_random_uuid(),
  deletion_number text not null unique,
  deleted_at timestamptz not null default now(),
  deleted_by_user_id uuid references public.app_users(id) on delete set null,
  deleted_by_email text,
  root_lookup_type text not null,
  root_identifier text not null,
  reason text not null,
  record_count integer not null default 0,
  status text not null default 'deleted',
  restored_at timestamptz,
  restored_by_user_id uuid references public.app_users(id) on delete set null,
  restored_by_email text,
  restore_status text,
  constraint data_trace_delete_audit_status_check
    check (status in ('deleted', 'restored', 'restore_blocked'))
);

alter table private_archive.data_trace_deletions enable row level security;
alter table private_archive.data_trace_archive_records enable row level security;
alter table public.data_trace_delete_audit_log enable row level security;

revoke all on schema private_archive from public, anon, authenticated;
revoke all on all tables in schema private_archive from public, anon, authenticated;
revoke all on all sequences in schema private_archive from public, anon, authenticated;
revoke all on public.data_trace_delete_audit_log from anon;
grant select on public.data_trace_delete_audit_log to authenticated;

drop policy if exists data_trace_delete_audit_backend_select on public.data_trace_delete_audit_log;
create policy data_trace_delete_audit_backend_select
on public.data_trace_delete_audit_log
for select
to authenticated
using (public.is_timan_backend());

create or replace function private_archive.data_trace_current_backend_user()
returns table(user_id uuid, email text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select au.id, au.email
    from public.app_users au
   where au.auth_user_id = (select auth.uid())
     and au.portal_role::text = 'timan_backend'
     and au.approved = true
     and au.is_active = true
   limit 1
$$;

create or replace function private_archive.data_trace_next_number()
returns text
language sql
security definer
set search_path = private_archive, pg_temp
as $$
  select 'SLET-' || lpad(nextval('private_archive.data_trace_deletion_number_seq')::text, 4, '0')
$$;

create or replace function public.preview_data_trace_deletion(
  p_lookup_type text,
  p_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private_archive, pg_temp
as $$
declare
  v_admin record;
  v_lookup text := lower(trim(coalesce(p_lookup_type, '')));
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_config_ids uuid[] := '{}';
  v_lead_ids uuid[] := '{}';
  v_demo_ids uuid[] := '{}';
  v_warranty_ids uuid[] := '{}';
  v_dealer_ids uuid[] := '{}';
  v_removed jsonb := '[]'::jsonb;
  v_kept jsonb := '[]'::jsonb;
begin
  select * into v_admin from private_archive.data_trace_current_backend_user();
  if v_admin.user_id is null then
    raise exception 'not authorised';
  end if;
  if v_identifier = '' then
    raise exception 'identifier is required';
  end if;

  if v_lookup = 'quote' then
    select array_agg(id) into v_config_ids
      from public.configurations
     where quote_number = v_identifier
        or id::text = v_identifier;
    select coalesce(v_config_ids, '{}') || coalesce(array_agg(id), '{}') into v_config_ids
      from public.configurations
     where source_quote_id = any(coalesce(v_config_ids, '{}'));
  elsif v_lookup = 'order' then
    select array_agg(id) into v_config_ids
      from public.configurations
     where order_number = v_identifier
        or id::text = v_identifier;
  elsif v_lookup = 'lead' then
    select array_agg(id) into v_lead_ids
      from public.crm_leads
     where id::text = v_identifier
        or lead_no::text = regexp_replace(v_identifier, '[^0-9]', '', 'g');
    select array_agg(id) into v_config_ids
      from public.configurations
     where lead_id = any(coalesce(v_lead_ids, '{}'));
    select array_agg(id) into v_demo_ids
      from public.crm_demo_leads
     where source_lead_id = any(coalesce(v_lead_ids, '{}'));
  elsif v_lookup = 'demo' then
    select array_agg(id) into v_demo_ids
      from public.crm_demo_leads
     where id::text = v_identifier
        or demo_no::text = regexp_replace(v_identifier, '[^0-9]', '', 'g');
    select array_agg(id) into v_lead_ids
      from public.crm_leads
     where converted_demo_lead_id = any(coalesce(v_demo_ids, '{}'));
    select array_agg(id) into v_config_ids
      from public.configurations
     where lead_id = any(coalesce(v_lead_ids, '{}'));
  elsif v_lookup = 'warranty' then
    select array_agg(id) into v_warranty_ids
      from public.warranty_registrations
     where id::text = v_identifier
        or certificate_number = v_identifier
        or sharepoint_item_id = v_identifier
        or sharepoint_form_id::text = regexp_replace(v_identifier, '[^0-9]', '', 'g');
  elsif v_lookup = 'serial' then
    select array_agg(id) into v_warranty_ids
      from public.warranty_registrations
     where machine_serial_number = v_identifier
        or machine_serial_raw = v_identifier;
  elsif v_lookup = 'dealer' then
    select array_agg(id) into v_dealer_ids
      from public.dealer_accounts
     where id::text = v_identifier
        or account_number = v_identifier;
    select array_agg(id) into v_lead_ids
      from public.crm_leads
     where linked_dealer_id = any(coalesce(v_dealer_ids, '{}'));
    select array_agg(id) into v_config_ids
      from public.configurations
     where dealer_account_id = any(coalesce(v_dealer_ids, '{}'))
        or dealer_number = v_identifier;
    select array_agg(id) into v_warranty_ids
      from public.warranty_registrations
     where dealer_account_id = any(coalesce(v_dealer_ids, '{}'))
        or dealer_account_number = v_identifier;
  elsif v_lookup = 'tsb' then
    return jsonb_build_object(
      'supported', false,
      'reason', 'TSB root kan ikke slettes i denne version, fordi remote public schema ikke indeholder en aktiv TSB-tabel med verificerbare relationer.',
      'rootLookupType', v_lookup,
      'rootIdentifier', v_identifier
    );
  else
    raise exception 'unsupported lookup type %', v_lookup;
  end if;

  v_config_ids := coalesce(v_config_ids, '{}');
  v_lead_ids := coalesce(v_lead_ids, '{}');
  v_demo_ids := coalesce(v_demo_ids, '{}');
  v_warranty_ids := coalesce(v_warranty_ids, '{}');
  v_dealer_ids := coalesce(v_dealer_ids, '{}');

  select jsonb_agg(x) into v_removed
  from (
    select 'configuration_items' as table_name, count(*)::int as count from public.configuration_items where configuration_id = any(v_config_ids)
    union all select 'crm_activities', count(*)::int from public.crm_activities where configuration_id = any(v_config_ids) or quote_id = any(v_config_ids) or order_id = any(v_config_ids) or account_id = any(v_dealer_ids)
    union all select 'crm_calendar_activities', count(*)::int from public.crm_calendar_activities where account_id = any(v_dealer_ids) or (dealer_account_number = v_identifier and cardinality(v_dealer_ids) > 0)
    union all select 'configurations', count(*)::int from public.configurations where id = any(v_config_ids)
    union all select 'crm_lead_shares', count(*)::int from public.crm_lead_shares where lead_id = any(v_lead_ids)
    union all select 'crm_leads', count(*)::int from public.crm_leads where id = any(v_lead_ids)
    union all select 'crm_demo_leads', count(*)::int from public.crm_demo_leads where id = any(v_demo_ids)
    union all select 'warranty_registration_history', count(*)::int from public.warranty_registration_history where registration_id = any(v_warranty_ids)
    union all select 'warranty_registrations', count(*)::int from public.warranty_registrations where id = any(v_warranty_ids)
    union all select 'dealer_note_comments', count(*)::int from public.dealer_note_comments dnc join public.dealer_notes dn on dn.id = dnc.note_id where dn.dealer_number = v_identifier and cardinality(v_dealer_ids) > 0
    union all select 'dealer_notes', count(*)::int from public.dealer_notes where dealer_number = v_identifier and cardinality(v_dealer_ids) > 0
    union all select 'dealer_contract_upload_files', count(*)::int from public.dealer_contract_upload_files f join public.dealer_contracts dc on dc.id = f.contract_id where dc.dealer_account_id = any(v_dealer_ids)
    union all select 'dealer_contract_upload_versions', count(*)::int from public.dealer_contract_upload_versions v join public.dealer_contracts dc on dc.id = v.contract_id where dc.dealer_account_id = any(v_dealer_ids)
    union all select 'dealer_contracts', count(*)::int from public.dealer_contracts where dealer_account_id = any(v_dealer_ids)
    union all select 'dealer_contacts', count(*)::int from public.dealer_contacts where dealer_account_id = any(v_dealer_ids)
    union all select 'dealer_account_aliases', count(*)::int from public.dealer_account_aliases where dealer_account_id = any(v_dealer_ids)
    union all select 'partner_account_relations', count(*)::int from public.partner_account_relations where source_account_id = any(v_dealer_ids) or target_account_id = any(v_dealer_ids)
    union all select 'dealer_accounts', count(*)::int from public.dealer_accounts where id = any(v_dealer_ids)
  ) x
  where x.count > 0;

  v_kept := jsonb_build_array(
    jsonb_build_object(
      'type', 'shared_reference',
      'label', case when cardinality(v_dealer_ids) > 0 then 'Direkte forhandler-root valgt: forhandler fjernes med datasporret.' else 'Forhandler/partner beholdes som delt reference.' end
    ),
    jsonb_build_object(
      'type', 'storage_objects',
      'label', 'Storage-objekter flyttes ikke af denne database-RPC. Tilknyttet filmetadata arkiveres, og fysisk filhåndtering skal ske via Supabase Storage API, hvis det senere kræves.'
    )
  );

  return jsonb_build_object(
    'supported', true,
    'rootLookupType', v_lookup,
    'rootIdentifier', v_identifier,
    'confirmationText', 'SLET ' || v_identifier,
    'willRemove', coalesce(v_removed, '[]'::jsonb),
    'willKeep', v_kept,
    'recordCount', coalesce((select sum((item->>'count')::int) from jsonb_array_elements(coalesce(v_removed, '[]'::jsonb)) item), 0),
    'resolvedIds', jsonb_build_object(
      'configurations', v_config_ids,
      'leads', v_lead_ids,
      'demos', v_demo_ids,
      'warranties', v_warranty_ids,
      'dealers', v_dealer_ids
    )
  );
end;
$$;

create or replace function private_archive.archive_query_rows(
  p_deletion_id uuid,
  p_table_name text,
  p_where_sql text,
  p_restore_order integer,
  p_delete_order integer
)
returns integer
language plpgsql
security definer
set search_path = public, private_archive, pg_temp
as $$
declare
  v_count integer := 0;
begin
  execute format(
    'insert into private_archive.data_trace_archive_records (deletion_id, table_name, primary_key, row_data, restore_order, delete_order)
     select $1, %L, jsonb_build_object(''id'', id::text), to_jsonb(t), $2, $3 from public.%I t where %s',
    p_table_name,
    p_table_name,
    p_where_sql
  )
  using p_deletion_id, p_restore_order, p_delete_order;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.execute_data_trace_deletion(
  p_lookup_type text,
  p_identifier text,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private_archive, pg_temp
as $$
declare
  v_admin record;
  v_preview jsonb;
  v_ids jsonb;
  v_deletion_id uuid;
  v_deletion_number text;
  v_record_count integer := 0;
  v_identifier text := trim(coalesce(p_identifier, ''));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select * into v_admin from private_archive.data_trace_current_backend_user();
  if v_admin.user_id is null then raise exception 'not authorised'; end if;
  if v_reason = '' then raise exception 'reason is required'; end if;
  if trim(coalesce(p_confirmation, '')) <> ('SLET ' || v_identifier) then
    raise exception 'confirmation mismatch';
  end if;

  v_preview := public.preview_data_trace_deletion(p_lookup_type, v_identifier);
  if coalesce((v_preview->>'supported')::boolean, false) is false then
    raise exception 'lookup type is not supported: %', p_lookup_type;
  end if;
  if coalesce((v_preview->>'recordCount')::int, 0) = 0 then
    raise exception 'no records found';
  end if;

  v_deletion_number := private_archive.data_trace_next_number();
  insert into private_archive.data_trace_deletions (
    deletion_number, deleted_by_user_id, deleted_by_email, root_lookup_type, root_identifier, reason, preview, record_count
  )
  values (
    v_deletion_number, v_admin.user_id, v_admin.email, lower(trim(p_lookup_type)), v_identifier, v_reason, v_preview, 0
  )
  returning id into v_deletion_id;

  v_ids := v_preview->'resolvedIds';

  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'configuration_items', format('configuration_id = any(%L::uuid[])', translate((v_ids->'configurations')::text, '[]', '{}')), 30, 10);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'crm_activities', format('configuration_id = any(%1$L::uuid[]) or quote_id = any(%1$L::uuid[]) or order_id = any(%1$L::uuid[]) or account_id = any(%2$L::uuid[])', translate((v_ids->'configurations')::text, '[]', '{}'), translate((v_ids->'dealers')::text, '[]', '{}')), 31, 11);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'crm_calendar_activities', format('account_id = any(%1$L::uuid[]) or (dealer_account_number = %2$L and cardinality(%1$L::uuid[]) > 0)', translate((v_ids->'dealers')::text, '[]', '{}'), v_identifier), 32, 12);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'crm_lead_shares', format('lead_id = any(%L::uuid[])', translate((v_ids->'leads')::text, '[]', '{}')), 33, 13);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'warranty_registration_history', format('registration_id = any(%L::uuid[])', translate((v_ids->'warranties')::text, '[]', '{}')), 34, 14);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_note_comments', format('note_id in (select id from public.dealer_notes where dealer_number = %L)', v_identifier), 35, 15);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_contract_upload_versions', format('contract_id in (select id from public.dealer_contracts where dealer_account_id = any(%L::uuid[]))', translate((v_ids->'dealers')::text, '[]', '{}')), 36, 16);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_contract_upload_files', format('contract_id in (select id from public.dealer_contracts where dealer_account_id = any(%L::uuid[]))', translate((v_ids->'dealers')::text, '[]', '{}')), 37, 17);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'configurations', format('id = any(%L::uuid[])', translate((v_ids->'configurations')::text, '[]', '{}')), 10, 30);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'crm_leads', format('id = any(%L::uuid[])', translate((v_ids->'leads')::text, '[]', '{}')), 11, 31);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'crm_demo_leads', format('id = any(%L::uuid[])', translate((v_ids->'demos')::text, '[]', '{}')), 12, 32);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'warranty_registrations', format('id = any(%L::uuid[])', translate((v_ids->'warranties')::text, '[]', '{}')), 13, 33);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_notes', format('dealer_number = %L and cardinality(%L::uuid[]) > 0', v_identifier, translate((v_ids->'dealers')::text, '[]', '{}')), 14, 34);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_contracts', format('dealer_account_id = any(%L::uuid[])', translate((v_ids->'dealers')::text, '[]', '{}')), 15, 35);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_contacts', format('dealer_account_id = any(%L::uuid[])', translate((v_ids->'dealers')::text, '[]', '{}')), 16, 36);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_account_aliases', format('dealer_account_id = any(%L::uuid[])', translate((v_ids->'dealers')::text, '[]', '{}')), 17, 37);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'partner_account_relations', format('source_account_id = any(%1$L::uuid[]) or target_account_id = any(%1$L::uuid[])', translate((v_ids->'dealers')::text, '[]', '{}')), 18, 38);
  v_record_count := v_record_count + private_archive.archive_query_rows(v_deletion_id, 'dealer_accounts', format('id = any(%L::uuid[])', translate((v_ids->'dealers')::text, '[]', '{}')), 1, 40);

  if v_record_count = 0 then
    raise exception 'archive produced no records';
  end if;

  delete from public.configuration_items where configuration_id = any(translate((v_ids->'configurations')::text, '[]', '{}')::uuid[]);
  delete from public.crm_activities where configuration_id = any(translate((v_ids->'configurations')::text, '[]', '{}')::uuid[]) or quote_id = any(translate((v_ids->'configurations')::text, '[]', '{}')::uuid[]) or order_id = any(translate((v_ids->'configurations')::text, '[]', '{}')::uuid[]) or account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);
  delete from public.crm_calendar_activities where account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]) or (dealer_account_number = v_identifier and cardinality(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]) > 0);
  delete from public.crm_lead_shares where lead_id = any(translate((v_ids->'leads')::text, '[]', '{}')::uuid[]);
  delete from public.warranty_registration_history where registration_id = any(translate((v_ids->'warranties')::text, '[]', '{}')::uuid[]);
  delete from public.dealer_note_comments where note_id in (select id from public.dealer_notes where dealer_number = v_identifier) and cardinality(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]) > 0;
  delete from public.dealer_contract_upload_files where contract_id in (select id from public.dealer_contracts where dealer_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]));
  delete from public.dealer_contract_upload_versions where contract_id in (select id from public.dealer_contracts where dealer_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]));
  delete from public.configurations where id = any(translate((v_ids->'configurations')::text, '[]', '{}')::uuid[]);
  delete from public.crm_leads where id = any(translate((v_ids->'leads')::text, '[]', '{}')::uuid[]);
  delete from public.crm_demo_leads where id = any(translate((v_ids->'demos')::text, '[]', '{}')::uuid[]);
  delete from public.warranty_registrations where id = any(translate((v_ids->'warranties')::text, '[]', '{}')::uuid[]);
  delete from public.dealer_notes where dealer_number = v_identifier and cardinality(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]) > 0;
  delete from public.dealer_contracts where dealer_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);
  delete from public.dealer_contacts where dealer_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);
  delete from public.dealer_account_aliases where dealer_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);
  delete from public.partner_account_relations where source_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]) or target_account_id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);
  delete from public.dealer_accounts where id = any(translate((v_ids->'dealers')::text, '[]', '{}')::uuid[]);

  update private_archive.data_trace_deletions set record_count = v_record_count where id = v_deletion_id;
  insert into public.data_trace_delete_audit_log (
    deletion_number, deleted_by_user_id, deleted_by_email, root_lookup_type, root_identifier, reason, record_count, status
  )
  values (v_deletion_number, v_admin.user_id, v_admin.email, lower(trim(p_lookup_type)), v_identifier, v_reason, v_record_count, 'deleted');

  return jsonb_build_object(
    'deletionNumber', v_deletion_number,
    'recordCount', v_record_count,
    'message', 'Sletning gennemført'
  );
end;
$$;

create or replace function public.preview_data_trace_restore(p_deletion_number text)
returns jsonb
language plpgsql
security definer
set search_path = public, private_archive, pg_temp
as $$
declare
  v_admin record;
  v_deletion record;
  v_counts jsonb;
begin
  select * into v_admin from private_archive.data_trace_current_backend_user();
  if v_admin.user_id is null then raise exception 'not authorised'; end if;

  select * into v_deletion
    from private_archive.data_trace_deletions
   where deletion_number = upper(trim(p_deletion_number));
  if v_deletion.id is null then raise exception 'unknown deletion number'; end if;

  select jsonb_agg(jsonb_build_object('table', table_name, 'count', count))
    into v_counts
    from (
      select table_name, count(*)::int as count
        from private_archive.data_trace_archive_records
       where deletion_id = v_deletion.id
       group by table_name
       order by table_name
    ) x;

  return jsonb_build_object(
    'deletionNumber', v_deletion.deletion_number,
    'status', v_deletion.status,
    'deletedAt', v_deletion.deleted_at,
    'rootLookupType', v_deletion.root_lookup_type,
    'rootIdentifier', v_deletion.root_identifier,
    'recordCount', v_deletion.record_count,
    'tables', coalesce(v_counts, '[]'::jsonb),
    'confirmationText', 'GENDAN ' || v_deletion.deletion_number
  );
end;
$$;

create or replace function public.execute_data_trace_restore(
  p_deletion_number text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private_archive, pg_temp
as $$
declare
  v_admin record;
  v_deletion record;
  v_record record;
  v_exists boolean;
  v_row_data jsonb;
begin
  select * into v_admin from private_archive.data_trace_current_backend_user();
  if v_admin.user_id is null then raise exception 'not authorised'; end if;

  select * into v_deletion
    from private_archive.data_trace_deletions
   where deletion_number = upper(trim(p_deletion_number))
   for update;
  if v_deletion.id is null then raise exception 'unknown deletion number'; end if;
  if v_deletion.status = 'restored' then raise exception 'deletion already restored'; end if;
  if trim(coalesce(p_confirmation, '')) <> ('GENDAN ' || v_deletion.deletion_number) then
    raise exception 'confirmation mismatch';
  end if;

  for v_record in
    select *
      from private_archive.data_trace_archive_records
     where deletion_id = v_deletion.id
     order by restore_order asc, id asc
  loop
    execute format('select exists(select 1 from public.%I where id::text = $1)', v_record.table_name)
      into v_exists
      using v_record.primary_key->>'id';
    if v_exists then
      update private_archive.data_trace_deletions
         set status = 'restore_blocked',
             restore_status = 'blocked',
             restore_error = format('ID conflict in %.%', v_record.table_schema, v_record.table_name)
       where id = v_deletion.id;
      update public.data_trace_delete_audit_log
         set status = 'restore_blocked',
             restore_status = 'blocked'
       where deletion_number = v_deletion.deletion_number;
      return jsonb_build_object(
        'deletionNumber', v_deletion.deletion_number,
        'recordCount', v_deletion.record_count,
        'status', 'restore_blocked',
        'message', format('Gendannelse blokeret af ID-konflikt i %s', v_record.table_name)
      );
    end if;
  end loop;

  for v_record in
    select *
      from private_archive.data_trace_archive_records
     where deletion_id = v_deletion.id
     order by restore_order asc, id asc
  loop
    v_row_data := v_record.row_data;
    if v_record.table_name = 'configurations' then
      v_row_data := v_row_data || jsonb_build_object('source_quote_id', null, 'lead_id', null);
    elsif v_record.table_name = 'crm_leads' then
      v_row_data := v_row_data || jsonb_build_object('converted_demo_lead_id', null);
    elsif v_record.table_name = 'crm_demo_leads' then
      v_row_data := v_row_data || jsonb_build_object('source_lead_id', null);
    end if;

    execute format(
      'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
      v_record.table_name
    )
    using v_row_data;
  end loop;

  for v_record in
    select *
      from private_archive.data_trace_archive_records
     where deletion_id = v_deletion.id
       and table_name = 'configurations'
     order by id asc
  loop
    update public.configurations
       set source_quote_id = nullif(v_record.row_data->>'source_quote_id', '')::uuid,
           lead_id = nullif(v_record.row_data->>'lead_id', '')::uuid
     where id::text = v_record.primary_key->>'id';
  end loop;

  for v_record in
    select *
      from private_archive.data_trace_archive_records
     where deletion_id = v_deletion.id
       and table_name = 'crm_leads'
     order by id asc
  loop
    update public.crm_leads
       set converted_demo_lead_id = nullif(v_record.row_data->>'converted_demo_lead_id', '')::uuid
     where id::text = v_record.primary_key->>'id';
  end loop;

  for v_record in
    select *
      from private_archive.data_trace_archive_records
     where deletion_id = v_deletion.id
       and table_name = 'crm_demo_leads'
     order by id asc
  loop
    update public.crm_demo_leads
       set source_lead_id = nullif(v_record.row_data->>'source_lead_id', '')::uuid
     where id::text = v_record.primary_key->>'id';
  end loop;

  update private_archive.data_trace_deletions
     set status = 'restored',
         restored_at = now(),
         restored_by_user_id = v_admin.user_id,
         restored_by_email = v_admin.email,
         restore_status = 'success',
         restore_error = null
   where id = v_deletion.id;

  update public.data_trace_delete_audit_log
     set status = 'restored',
         restored_at = now(),
         restored_by_user_id = v_admin.user_id,
         restored_by_email = v_admin.email,
         restore_status = 'success'
   where deletion_number = v_deletion.deletion_number;

  return jsonb_build_object(
    'deletionNumber', v_deletion.deletion_number,
    'recordCount', v_deletion.record_count,
    'message', 'Gendannelse gennemført'
  );
end;
$$;

revoke all on function public.preview_data_trace_deletion(text, text) from public, anon;
revoke all on function public.execute_data_trace_deletion(text, text, text, text) from public, anon;
revoke all on function public.preview_data_trace_restore(text) from public, anon;
revoke all on function public.execute_data_trace_restore(text, text) from public, anon;

grant execute on function public.preview_data_trace_deletion(text, text) to authenticated;
grant execute on function public.execute_data_trace_deletion(text, text, text, text) to authenticated;
grant execute on function public.preview_data_trace_restore(text) to authenticated;
grant execute on function public.execute_data_trace_restore(text, text) to authenticated;
