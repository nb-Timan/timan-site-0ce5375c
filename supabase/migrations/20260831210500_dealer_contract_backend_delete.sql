-- Backend-only contract deletion for the internal contract overview.
--
-- The existing contract model uses hard deletes for cleanup flows. This helper
-- keeps deletion consistent by removing private Storage objects before deleting
-- the contract row; upload metadata cascades from dealer_contracts, while
-- agreement history and access windows keep their audit trail with contract_id
-- set to null through their existing foreign keys.

create or replace function public.delete_dealer_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  target public.dealer_contracts;
  upload_file_count integer := 0;
  upload_version_count integer := 0;
begin
  if not public.is_timan_backend() then
    raise exception 'Kun Timan Backend kan slette kontrakter.' using errcode = '42501';
  end if;

  select * into target
  from public.dealer_contracts
  where id = p_contract_id;

  if target.id is null then
    raise exception 'Kontrakten findes ikke.' using errcode = 'P0002';
  end if;

  select count(*) into upload_file_count
  from public.dealer_contract_upload_files
  where contract_id = p_contract_id;

  select count(*) into upload_version_count
  from public.dealer_contract_upload_versions
  where contract_id = p_contract_id;

  delete from storage.objects
  where bucket_id = 'dealer-contracts'
    and name in (
      select storage_path
      from public.dealer_contract_upload_files
      where contract_id = p_contract_id
    );

  delete from public.dealer_contracts
  where id = p_contract_id;

  select * into actor from public.audit_current_actor();

  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_name,
    actor_role,
    action,
    module,
    record_type,
    record_id,
    record_label,
    old_value,
    new_value,
    changed_fields,
    status
  )
  values (
    actor.actor_user_id,
    coalesce(actor.actor_email, (select auth.email())),
    actor.actor_name,
    actor.actor_role,
    'delete',
    'contracts',
    'dealer_contracts',
    target.id::text,
    coalesce(target.form_data ->> 'dealerName', target.dealer_account_number, target.owner_email),
    jsonb_build_object(
      'contract_number', target.contract_number,
      'contract_status', target.contract_status,
      'dealer_account_id', target.dealer_account_id,
      'dealer_account_number', target.dealer_account_number,
      'owner_email', target.owner_email,
      'upload_versions', upload_version_count,
      'upload_files', upload_file_count
    ),
    null,
    array['deleted']::text[],
    'success'
  );
end;
$$;

revoke all on function public.delete_dealer_contract(uuid) from public, anon;
grant execute on function public.delete_dealer_contract(uuid) to authenticated, service_role;
