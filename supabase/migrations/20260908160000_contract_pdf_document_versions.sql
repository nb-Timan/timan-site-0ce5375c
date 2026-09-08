-- Immutable metadata for generated contract PDFs. The existing upload tables
-- remain dedicated to later scanned/physically signed contract files.

create table if not exists public.dealer_contract_document_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.dealer_contracts(id) on delete restrict,
  document_version integer not null,
  template_version text not null,
  language text not null check (language in ('da', 'en', 'de')),
  document_kind text not null check (document_kind in ('draft', 'final')),
  status text not null default 'generating' check (status in ('generating', 'draft', 'final', 'failed', 'superseded')),
  snapshot jsonb not null,
  storage_bucket text not null default 'dealer-contracts',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size integer,
  sha256 text,
  page_count integer,
  generated_at timestamptz not null default now(),
  generated_by_user_id uuid default auth.uid(),
  finalized_at timestamptz,
  supersedes_document_id uuid references public.dealer_contract_document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (contract_id, document_version),
  check ((status = 'generating' and sha256 is null and page_count is null) or status <> 'generating')
);

create index if not exists dealer_contract_document_versions_contract_idx
  on public.dealer_contract_document_versions(contract_id, document_version desc);

alter table public.dealer_contract_document_versions enable row level security;

create or replace function public.can_generate_dealer_contract_document(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_dealer_contract(p_contract_id)
    and exists (
      select 1 from public.dealer_contracts dc
      where dc.id = p_contract_id
        and dc.contract_status in ('ready_for_signature', 'awaiting_signed_upload', 'changes_requested')
    );
$$;

revoke all on function public.can_generate_dealer_contract_document(uuid) from public;
grant execute on function public.can_generate_dealer_contract_document(uuid) to authenticated;

drop policy if exists dealer_contract_document_versions_select on public.dealer_contract_document_versions;
create policy dealer_contract_document_versions_select
on public.dealer_contract_document_versions
for select to authenticated
using (public.can_read_dealer_contract(contract_id));

-- Document records are only written by the controlled RPCs below.

create or replace function public.dealer_contract_generated_document_id_at(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  value text;
begin
  value := (storage.foldername(object_name))[4];
  return value::uuid;
exception when others then
  return null;
end;
$$;

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
            or (write_mode and dv.status = 'generating' and public.can_generate_dealer_contract_document(dv.contract_id))
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
begin
  if p_document_kind not in ('draft', 'final') then
    raise exception 'invalid document kind' using errcode = '22023';
  end if;
  if p_language not in ('da', 'en', 'de') then
    raise exception 'unsupported contract language' using errcode = '22023';
  end if;
  if not public.can_generate_dealer_contract_document(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_contract_id::text, 0));

  select final_snapshot into locked_snapshot from public.dealer_contracts where id = p_contract_id;
  if p_document_kind = 'final' then
    if locked_snapshot is null then raise exception 'final contract snapshot missing' using errcode = '22023'; end if;
    if coalesce(locked_snapshot ->> 'contractLanguage', 'da') <> p_language then
      raise exception 'final document language must match locked snapshot' using errcode = '22023';
    end if;
    -- Only approved Danish legal content exists at this point. Other languages
    -- remain deliberately blocked until their reviewed legal templates exist.
    if p_language <> 'da' then raise exception 'legal translation not production ready' using errcode = '22023'; end if;
  end if;

  select coalesce(max(document_version), 0) + 1 into next_version
  from public.dealer_contract_document_versions
  where contract_id = p_contract_id;

  insert into public.dealer_contract_document_versions (
    contract_id, document_version, template_version, language, document_kind,
    snapshot, storage_path, file_name
  ) values (
    p_contract_id, next_version, p_template_version, p_language, p_document_kind,
    case when p_document_kind = 'final' then locked_snapshot else p_snapshot end,
    '', p_file_name
  ) returning * into result;

  update public.dealer_contract_document_versions
  set storage_path = format('contracts/%s/generated/%s/contract.pdf', p_contract_id, result.id)
  where id = result.id
  returning * into result;

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
  if not public.can_generate_dealer_contract_document(result.contract_id) then raise exception 'forbidden' using errcode = '42501'; end if;
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
grant execute on function public.finalize_dealer_contract_document(uuid, text, integer, integer) to authenticated;
