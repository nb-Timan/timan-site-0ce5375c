-- Step 10 may create review drafts from the current editable contract state.
-- This is intentionally narrower than final generation: only the assigned
-- internal contract actor may generate or replace a draft before review lock.

create or replace function public.can_prepare_dealer_contract_draft(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contracts dc
    left join public.dealer_accounts da
      on da.id = dc.dealer_account_id
      or da.account_number = dc.dealer_account_number
    where dc.id = p_contract_id
      and dc.contract_status in ('draft', 'guided_review', 'ready_for_signature')
      and public.can_manage_dealer_contract_access(coalesce(dc.dealer_account_id, da.id))
  );
$$;

revoke all on function public.can_prepare_dealer_contract_draft(uuid) from public, anon;
grant execute on function public.can_prepare_dealer_contract_draft(uuid) to authenticated, service_role;

create or replace function public.can_access_dealer_contract_storage(object_name text, write_mode boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    when (storage.foldername(object_name))[1] <> 'contracts' then false
    when (storage.foldername(object_name))[3] = 'generated' then
      exists (
        select 1
        from public.dealer_contract_document_versions dv
        where dv.id = public.dealer_contract_generated_document_id_at(object_name)
          and dv.contract_id = public.dealer_contract_storage_uuid_at(object_name, 2)
          and dv.storage_path = object_name
          and (
            (not write_mode and dv.status in ('draft', 'final', 'superseded'))
            or (
              write_mode
              and dv.status = 'generating'
              and (
                public.can_generate_dealer_contract_document(dv.contract_id)
                or (dv.document_kind = 'draft' and public.can_prepare_dealer_contract_draft(dv.contract_id))
              )
            )
          )
      )
    when write_mode then public.can_write_dealer_contract_upload(public.dealer_contract_storage_uuid_at(object_name, 2))
      and exists (
        select 1
        from public.dealer_contract_upload_versions uv
        where uv.id = public.dealer_contract_storage_uuid_at(object_name, 4)
          and uv.contract_id = public.dealer_contract_storage_uuid_at(object_name, 2)
          and uv.status = 'draft'
      )
    else public.can_read_dealer_contract(public.dealer_contract_storage_uuid_at(object_name, 2))
  end;
$$;

create or replace function public.prepare_dealer_contract_document(
  p_contract_id uuid,
  p_document_kind text,
  p_template_version text,
  p_language text,
  p_snapshot jsonb,
  p_file_name text
)
returns public.dealer_contract_document_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.dealer_contract_document_versions;
  next_version integer;
  locked_snapshot jsonb;
  previous_draft_id uuid;
begin
  if p_document_kind not in ('draft', 'final') then
    raise exception 'invalid document kind' using errcode = '22023';
  end if;
  if p_language not in ('da', 'en', 'de') then
    raise exception 'unsupported contract language' using errcode = '22023';
  end if;
  if p_document_kind = 'draft' then
    if not public.can_prepare_dealer_contract_draft(p_contract_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif not public.can_generate_dealer_contract_document(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text, 0));

  select final_snapshot into locked_snapshot from public.dealer_contracts where id = p_contract_id;
  if p_document_kind = 'final' then
    if locked_snapshot is null then raise exception 'final contract snapshot missing' using errcode = '22023'; end if;
    if coalesce(locked_snapshot ->> 'contractLanguage', 'da') <> p_language then
      raise exception 'final document language must match locked snapshot' using errcode = '22023'; end if;
    if p_language <> 'da' then raise exception 'legal translation not production ready' using errcode = '22023'; end if;
  else
    select id into previous_draft_id
    from public.dealer_contract_document_versions
    where contract_id = p_contract_id
      and document_kind = 'draft'
      and status = 'draft'
    order by document_version desc
    limit 1;
  end if;

  select coalesce(max(document_version), 0) + 1 into next_version
  from public.dealer_contract_document_versions
  where contract_id = p_contract_id;

  insert into public.dealer_contract_document_versions (
    contract_id, document_version, template_version, language, document_kind,
    snapshot, storage_path, file_name, supersedes_document_id
  ) values (
    p_contract_id, next_version, p_template_version, p_language, p_document_kind,
    case when p_document_kind = 'final' then locked_snapshot else p_snapshot end,
    '', p_file_name, previous_draft_id
  ) returning * into result;

  update public.dealer_contract_document_versions
  set storage_path = format('contracts/%s/generated/%s/contract.pdf', p_contract_id, result.id)
  where id = result.id
  returning * into result;

  if previous_draft_id is not null then
    update public.dealer_contract_document_versions
    set status = 'superseded'
    where id = previous_draft_id;
  end if;

  perform public.audit_dealer_contract_event(p_contract_id, 'contract_pdf_prepared', jsonb_build_object(
    'document_id', result.id, 'document_version', result.document_version,
    'document_kind', p_document_kind, 'template_version', p_template_version, 'language', p_language
  ));
  return result;
end;
$$;

create or replace function public.finalize_dealer_contract_document(
  p_document_id uuid,
  p_sha256 text,
  p_file_size integer,
  p_page_count integer
)
returns public.dealer_contract_document_versions
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  result public.dealer_contract_document_versions;
begin
  select * into result from public.dealer_contract_document_versions where id = p_document_id for update;
  if result.id is null then raise exception 'document not found' using errcode = 'P0002'; end if;
  if result.status <> 'generating' then raise exception 'document is not awaiting finalization' using errcode = '22023'; end if;
  if result.document_kind = 'draft' then
    if not public.can_prepare_dealer_contract_draft(result.contract_id) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  elsif not public.can_generate_dealer_contract_document(result.contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid sha256' using errcode = '22023'; end if;
  if p_file_size is null or p_file_size < 1 or p_page_count is null or p_page_count < 1 then
    raise exception 'file metadata missing' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = result.storage_bucket and o.name = result.storage_path
  ) then raise exception 'stored PDF missing' using errcode = 'P0002'; end if;

  update public.dealer_contract_document_versions
  set status = case when result.document_kind = 'final' then 'final' else 'draft' end,
      sha256 = p_sha256,
      file_size = p_file_size,
      page_count = p_page_count,
      finalized_at = now()
  where id = p_document_id
  returning * into result;

  perform public.audit_dealer_contract_event(result.contract_id, 'contract_pdf_generated', jsonb_build_object(
    'document_id', result.id, 'document_version', result.document_version,
    'sha256', result.sha256, 'page_count', result.page_count, 'document_kind', result.document_kind
  ));
  return result;
end;
$$;

revoke all on function public.prepare_dealer_contract_document(uuid, text, text, text, jsonb, text) from public;
revoke all on function public.finalize_dealer_contract_document(uuid, text, integer, integer) from public;
grant execute on function public.prepare_dealer_contract_document(uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function public.finalize_dealer_contract_document(uuid, text, integer, integer) to authenticated;;
