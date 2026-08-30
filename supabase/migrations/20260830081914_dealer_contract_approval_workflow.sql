-- Dealer contract approval workflow.
-- Extends the existing dealer_contracts draft/persistence table with a
-- locked snapshot, physical-signature upload versions, Timan approval and
-- private Storage access. This intentionally reuses dealer_contracts and
-- audit_log instead of creating a parallel contract system.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dealer-contracts',
  'dealer-contracts',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.dealer_contracts
  add column if not exists contract_number text,
  add column if not exists contract_status text not null default 'draft',
  add column if not exists dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  add column if not exists guided_review_completed_at timestamptz,
  add column if not exists guided_review_completed_by_user_id uuid,
  add column if not exists guided_review_completed_by_name text,
  add column if not exists guided_review_completed_by_email text,
  add column if not exists expected_signed_pages integer,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_upload_version_id uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_by_name text,
  add column if not exists approved_by_email text,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dealer_contract_status_check'
      and conrelid = 'public.dealer_contracts'::regclass
  ) then
    alter table public.dealer_contracts
      add constraint dealer_contract_status_check
      check (contract_status in (
        'draft',
        'guided_review',
        'ready_for_signature',
        'awaiting_signed_upload',
        'submitted_for_approval',
        'changes_requested',
        'approved',
        'archived'
      ));
  end if;
end $$;

update public.dealer_contracts dc
set dealer_account_id = da.id
from public.dealer_accounts da
where dc.dealer_account_id is null
  and dc.dealer_account_number is not null
  and da.account_number = dc.dealer_account_number;

update public.dealer_contracts
set contract_status = case status
  when 'In review' then 'guided_review'
  when 'Ready for signature' then 'ready_for_signature'
  when 'Signed' then 'approved'
  when 'Archived' then 'archived'
  else 'draft'
end
where contract_status = 'draft'
  and status is distinct from 'Draft';

create sequence if not exists public.dealer_contract_number_seq start with 1000;

create or replace function public.assign_dealer_contract_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.contract_number is null or btrim(new.contract_number) = '' then
    new.contract_number := 'DC-' || to_char(now(), 'YYYY') || '-' || nextval('public.dealer_contract_number_seq')::text;
  end if;

  if new.dealer_account_id is null and new.dealer_account_number is not null then
    select da.id into new.dealer_account_id
    from public.dealer_accounts da
    where da.account_number = new.dealer_account_number
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists assign_dealer_contract_number_before_insert on public.dealer_contracts;
create trigger assign_dealer_contract_number_before_insert
before insert on public.dealer_contracts
for each row execute function public.assign_dealer_contract_number();

create unique index if not exists dealer_contracts_contract_number_key
  on public.dealer_contracts(contract_number)
  where contract_number is not null;

create table if not exists public.dealer_contract_upload_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.dealer_contracts(id) on delete cascade,
  version_no integer not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'superseded')),
  review_comment text,
  submitted_at timestamptz,
  submitted_by_user_id uuid default auth.uid(),
  submitted_by_name text,
  submitted_by_email text,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid,
  reviewed_by_name text,
  reviewed_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, version_no)
);

create table if not exists public.dealer_contract_upload_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.dealer_contracts(id) on delete cascade,
  upload_version_id uuid not null references public.dealer_contract_upload_versions(id) on delete cascade,
  storage_bucket text not null default 'dealer-contracts',
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size integer not null default 0,
  page_number integer,
  sort_order integer not null default 0,
  created_by_user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists dealer_contract_upload_versions_contract_idx
  on public.dealer_contract_upload_versions(contract_id, version_no desc);

create index if not exists dealer_contract_upload_files_version_idx
  on public.dealer_contract_upload_files(upload_version_id, sort_order);

alter table public.dealer_contract_upload_versions enable row level security;
alter table public.dealer_contract_upload_files enable row level security;

create or replace function public.current_app_user_json()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_build_object(
    'id', au.id,
    'auth_user_id', au.auth_user_id,
    'email', au.email,
    'display_name', coalesce(au.display_name, au.full_name, au.email),
    'portal_role', coalesce(au.portal_role::text, au.role::text),
    'dealer_number', au.dealer_number,
    'permissions', coalesce(au.permissions, '{}'::jsonb)
  ), '{}'::jsonb)
  from public.app_users au
  where (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    and coalesce(au.is_active, true) = true
    and coalesce(au.approved, true) = true
  limit 1;
$$;

revoke all on function public.current_app_user_json() from public;
grant execute on function public.current_app_user_json() to authenticated;

create or replace function public.can_read_dealer_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contracts dc
    left join public.dealer_accounts da on da.id = dc.dealer_account_id
    left join public.app_users au on (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    where dc.id = p_contract_id
      and (
        public.is_timan_backend()
        or dc.owner_auth_user_id = auth.uid()
        or lower(dc.owner_email) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        or dc.dealer_account_number = public.current_user_dealer_number()
        or da.account_number = public.current_user_dealer_number()
        or (
          coalesce(au.portal_role::text, au.role::text) in ('timan_seller', 'timan_service')
          and (
            lower(coalesce(dc.guided_review_completed_by_email, dc.owner_email, '')) = lower(coalesce(au.email, ''))
            or lower(coalesce(da.assigned_seller_email, '')) = lower(coalesce(au.email, ''))
          )
        )
      )
  );
$$;

create or replace function public.can_write_dealer_contract_upload(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contracts dc
    left join public.dealer_accounts da on da.id = dc.dealer_account_id
    where dc.id = p_contract_id
      and dc.contract_status in ('awaiting_signed_upload', 'changes_requested')
      and (
        public.is_timan_backend()
        or dc.owner_auth_user_id = auth.uid()
        or lower(dc.owner_email) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        or dc.dealer_account_number = public.current_user_dealer_number()
        or da.account_number = public.current_user_dealer_number()
      )
  );
$$;

create or replace function public.can_approve_dealer_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contracts dc
    left join public.dealer_accounts da on da.id = dc.dealer_account_id
    left join public.app_users au on (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    where dc.id = p_contract_id
      and (
        public.is_timan_backend()
        or (
          coalesce(au.portal_role::text, au.role::text) in ('timan_seller', 'timan_service')
          and (
            lower(coalesce(dc.guided_review_completed_by_email, dc.owner_email, '')) = lower(coalesce(au.email, ''))
            or lower(coalesce(da.assigned_seller_email, '')) = lower(coalesce(au.email, ''))
          )
        )
      )
  );
$$;

revoke all on function public.can_read_dealer_contract(uuid) from public;
revoke all on function public.can_write_dealer_contract_upload(uuid) from public;
revoke all on function public.can_approve_dealer_contract(uuid) from public;
grant execute on function public.can_read_dealer_contract(uuid) to authenticated;
grant execute on function public.can_write_dealer_contract_upload(uuid) to authenticated;
grant execute on function public.can_approve_dealer_contract(uuid) to authenticated;

drop policy if exists dealer_contract_upload_versions_select on public.dealer_contract_upload_versions;
create policy dealer_contract_upload_versions_select
on public.dealer_contract_upload_versions
for select to authenticated
using (public.can_read_dealer_contract(contract_id));

drop policy if exists dealer_contract_upload_versions_insert on public.dealer_contract_upload_versions;
create policy dealer_contract_upload_versions_insert
on public.dealer_contract_upload_versions
for insert to authenticated
with check (public.can_write_dealer_contract_upload(contract_id));

drop policy if exists dealer_contract_upload_versions_update_upload_owner on public.dealer_contract_upload_versions;
create policy dealer_contract_upload_versions_update_upload_owner
on public.dealer_contract_upload_versions
for update to authenticated
using (
  status = 'draft'
  and public.can_write_dealer_contract_upload(contract_id)
)
with check (
  status = 'draft'
  and public.can_write_dealer_contract_upload(contract_id)
);

drop policy if exists dealer_contract_upload_files_select on public.dealer_contract_upload_files;
create policy dealer_contract_upload_files_select
on public.dealer_contract_upload_files
for select to authenticated
using (public.can_read_dealer_contract(contract_id));

drop policy if exists dealer_contract_upload_files_insert on public.dealer_contract_upload_files;
create policy dealer_contract_upload_files_insert
on public.dealer_contract_upload_files
for insert to authenticated
with check (
  public.can_write_dealer_contract_upload(contract_id)
  and exists (
    select 1
    from public.dealer_contract_upload_versions uv
    where uv.id = upload_version_id
      and uv.contract_id = dealer_contract_upload_files.contract_id
      and uv.status = 'draft'
  )
);

drop policy if exists dealer_contract_upload_files_update_upload_owner on public.dealer_contract_upload_files;
create policy dealer_contract_upload_files_update_upload_owner
on public.dealer_contract_upload_files
for update to authenticated
using (
  public.can_write_dealer_contract_upload(contract_id)
  and exists (
    select 1
    from public.dealer_contract_upload_versions uv
    where uv.id = upload_version_id
      and uv.status = 'draft'
  )
)
with check (
  public.can_write_dealer_contract_upload(contract_id)
  and exists (
    select 1
    from public.dealer_contract_upload_versions uv
    where uv.id = upload_version_id
      and uv.status = 'draft'
  )
);

drop policy if exists dealer_contract_upload_files_delete_upload_owner on public.dealer_contract_upload_files;
create policy dealer_contract_upload_files_delete_upload_owner
on public.dealer_contract_upload_files
for delete to authenticated
using (
  public.can_write_dealer_contract_upload(contract_id)
  and exists (
    select 1
    from public.dealer_contract_upload_versions uv
    where uv.id = upload_version_id
      and uv.status = 'draft'
  )
);

create or replace function public.dealer_contract_storage_uuid_at(object_name text, index_1_based integer)
returns uuid
language plpgsql
immutable
as $$
declare
  value text;
begin
  value := (storage.foldername(object_name))[index_1_based];
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

revoke all on function public.can_access_dealer_contract_storage(text, boolean) from public;
grant execute on function public.can_access_dealer_contract_storage(text, boolean) to authenticated;

drop policy if exists "dealer_contracts_select_authenticated" on storage.objects;
drop policy if exists "dealer_contracts_insert_authenticated" on storage.objects;
drop policy if exists "dealer_contracts_update_authenticated" on storage.objects;
drop policy if exists "dealer_contracts_delete_authenticated" on storage.objects;

create policy "dealer_contracts_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'dealer-contracts' and public.can_access_dealer_contract_storage(name, false));

create policy "dealer_contracts_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'dealer-contracts' and public.can_access_dealer_contract_storage(name, true));

create policy "dealer_contracts_update_authenticated"
on storage.objects for update to authenticated
using (bucket_id = 'dealer-contracts' and public.can_access_dealer_contract_storage(name, true))
with check (bucket_id = 'dealer-contracts' and public.can_access_dealer_contract_storage(name, true));

create policy "dealer_contracts_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'dealer-contracts' and public.can_access_dealer_contract_storage(name, true));

create or replace function public.audit_dealer_contract_event(
  p_contract_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
begin
  insert into public.audit_log (
    actor_user_id,
    actor_email,
    actor_name,
    module,
    action,
    record_type,
    record_id,
    new_values
  )
  values (
    auth.uid(),
    actor ->> 'email',
    actor ->> 'display_name',
    'contracts',
    p_action,
    'dealer_contracts',
    p_contract_id::text,
    p_payload
  );
exception when undefined_table or undefined_column then
  null;
end;
$$;

revoke all on function public.audit_dealer_contract_event(uuid, text, jsonb) from public;
grant execute on function public.audit_dealer_contract_event(uuid, text, jsonb) to authenticated;

create or replace function public.complete_dealer_contract_guided_review(
  p_contract_id uuid,
  p_snapshot jsonb,
  p_expected_signed_pages integer default null
)
returns public.dealer_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  result public.dealer_contracts;
begin
  if not public.can_read_dealer_contract(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contracts
  set contract_status = 'ready_for_signature',
      status = 'Ready for signature',
      final_snapshot = p_snapshot || jsonb_build_object('lockedAt', now(), 'contractId', p_contract_id),
      expected_signed_pages = greatest(coalesce(p_expected_signed_pages, expected_signed_pages, 1), 1),
      guided_review_completed_at = now(),
      guided_review_completed_by_user_id = auth.uid(),
      guided_review_completed_by_name = actor ->> 'display_name',
      guided_review_completed_by_email = actor ->> 'email',
      updated_at = now()
  where id = p_contract_id
    and contract_status in ('draft', 'guided_review', 'ready_for_signature')
  returning * into result;

  if result.id is null then
    raise exception 'contract cannot be completed from current status';
  end if;

  perform public.audit_dealer_contract_event(p_contract_id, 'guided_review_completed', jsonb_build_object('expected_signed_pages', result.expected_signed_pages));
  perform public.audit_dealer_contract_event(p_contract_id, 'snapshot_created', jsonb_build_object('contract_version', result.contract_version));
  return result;
end;
$$;

create or replace function public.mark_dealer_contract_pdf_generated(
  p_contract_id uuid,
  p_expected_signed_pages integer default null
)
returns public.dealer_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.dealer_contracts;
begin
  if not public.can_read_dealer_contract(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contracts
  set contract_status = 'awaiting_signed_upload',
      status = 'Ready for signature',
      expected_signed_pages = greatest(coalesce(p_expected_signed_pages, expected_signed_pages, 1), 1),
      pdf_generated_at = now(),
      updated_at = now()
  where id = p_contract_id
    and contract_status in ('ready_for_signature', 'awaiting_signed_upload', 'changes_requested')
  returning * into result;

  if result.id is null then
    raise exception 'pdf cannot be generated from current status';
  end if;

  perform public.audit_dealer_contract_event(p_contract_id, 'pdf_generated', jsonb_build_object('pdf_generated_at', result.pdf_generated_at));
  return result;
end;
$$;

create or replace function public.create_dealer_contract_upload_version(p_contract_id uuid)
returns public.dealer_contract_upload_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  next_no integer;
  result public.dealer_contract_upload_versions;
begin
  if not public.can_write_dealer_contract_upload(p_contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contract_upload_versions
  set status = 'superseded', updated_at = now()
  where contract_id = p_contract_id
    and status in ('draft', 'changes_requested');

  select coalesce(max(version_no), 0) + 1 into next_no
  from public.dealer_contract_upload_versions
  where contract_id = p_contract_id;

  insert into public.dealer_contract_upload_versions (
    contract_id,
    version_no,
    submitted_by_user_id,
    submitted_by_name,
    submitted_by_email
  )
  values (
    p_contract_id,
    next_no,
    auth.uid(),
    actor ->> 'display_name',
    actor ->> 'email'
  )
  returning * into result;

  perform public.audit_dealer_contract_event(p_contract_id, 'upload_version_created', jsonb_build_object('upload_version_id', result.id, 'version_no', result.version_no));
  return result;
end;
$$;

create or replace function public.submit_dealer_contract_upload(p_upload_version_id uuid)
returns public.dealer_contract_upload_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  uv public.dealer_contract_upload_versions;
  file_count integer;
  known_pages integer;
  result public.dealer_contract_upload_versions;
begin
  select * into uv from public.dealer_contract_upload_versions where id = p_upload_version_id;
  if uv.id is null then raise exception 'upload version not found'; end if;
  if not public.can_write_dealer_contract_upload(uv.contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if uv.status <> 'draft' then raise exception 'upload version is locked'; end if;

  select count(*), max(page_number) into file_count, known_pages
  from public.dealer_contract_upload_files
  where upload_version_id = uv.id;

  if file_count = 0 then raise exception 'at least one signed file is required'; end if;
  if exists (
    select 1
    from public.dealer_contracts dc
    where dc.id = uv.contract_id
      and coalesce(dc.expected_signed_pages, 0) > 1
      and file_count < dc.expected_signed_pages
      and not exists (
        select 1 from public.dealer_contract_upload_files f
        where f.upload_version_id = uv.id and f.mime_type = 'application/pdf'
      )
  ) then
    raise exception 'known pages are missing';
  end if;

  update public.dealer_contract_upload_versions
  set status = 'submitted',
      submitted_at = now(),
      submitted_by_user_id = auth.uid(),
      submitted_by_name = actor ->> 'display_name',
      submitted_by_email = actor ->> 'email',
      updated_at = now()
  where id = uv.id
  returning * into result;

  update public.dealer_contracts
  set contract_status = 'submitted_for_approval',
      status = 'In review',
      submitted_at = now(),
      updated_at = now()
  where id = uv.contract_id;

  perform public.audit_dealer_contract_event(uv.contract_id, 'submitted_for_approval', jsonb_build_object('upload_version_id', uv.id, 'file_count', file_count, 'known_pages', known_pages));
  return result;
end;
$$;

create or replace function public.request_dealer_contract_new_upload(
  p_upload_version_id uuid,
  p_comment text
)
returns public.dealer_contract_upload_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  uv public.dealer_contract_upload_versions;
  result public.dealer_contract_upload_versions;
begin
  select * into uv from public.dealer_contract_upload_versions where id = p_upload_version_id;
  if uv.id is null then raise exception 'upload version not found'; end if;
  if not public.can_approve_dealer_contract(uv.contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(p_comment), '') is null then
    raise exception 'comment is required';
  end if;

  update public.dealer_contract_upload_versions
  set status = 'changes_requested',
      review_comment = p_comment,
      reviewed_at = now(),
      reviewed_by_user_id = auth.uid(),
      reviewed_by_name = actor ->> 'display_name',
      reviewed_by_email = actor ->> 'email',
      updated_at = now()
  where id = uv.id and status = 'submitted'
  returning * into result;

  if result.id is null then raise exception 'only submitted uploads can request changes'; end if;

  update public.dealer_contracts
  set contract_status = 'changes_requested',
      status = 'In review',
      updated_at = now()
  where id = uv.contract_id;

  perform public.audit_dealer_contract_event(uv.contract_id, 'changes_requested', jsonb_build_object('upload_version_id', uv.id, 'comment', p_comment));
  return result;
end;
$$;

create or replace function public.approve_dealer_contract_upload(p_upload_version_id uuid)
returns public.dealer_contracts
language plpgsql
security definer
set search_path = public
as $$
declare
  actor jsonb := public.current_app_user_json();
  uv public.dealer_contract_upload_versions;
  result public.dealer_contracts;
begin
  select * into uv from public.dealer_contract_upload_versions where id = p_upload_version_id;
  if uv.id is null then raise exception 'upload version not found'; end if;
  if not public.can_approve_dealer_contract(uv.contract_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contract_upload_versions
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by_user_id = auth.uid(),
      reviewed_by_name = actor ->> 'display_name',
      reviewed_by_email = actor ->> 'email',
      updated_at = now()
  where id = uv.id and status = 'submitted';

  if not found then raise exception 'only submitted uploads can be approved'; end if;

  update public.dealer_contract_upload_versions
  set status = 'superseded', updated_at = now()
  where contract_id = uv.contract_id
    and id <> uv.id
    and status in ('draft', 'changes_requested', 'submitted');

  update public.dealer_contracts
  set contract_status = 'approved',
      status = 'Signed',
      approved_upload_version_id = uv.id,
      approved_at = now(),
      approved_by_user_id = auth.uid(),
      approved_by_name = actor ->> 'display_name',
      approved_by_email = actor ->> 'email',
      signed_at = now(),
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where id = uv.contract_id
    and contract_status = 'submitted_for_approval'
  returning * into result;

  if result.id is null then raise exception 'contract cannot be approved from current status'; end if;

  perform public.audit_dealer_contract_event(uv.contract_id, 'approved', jsonb_build_object('upload_version_id', uv.id, 'contract_version', result.contract_version));
  perform public.audit_dealer_contract_event(uv.contract_id, 'archived', jsonb_build_object('dealer_account_number', result.dealer_account_number));
  return result;
end;
$$;

revoke all on function public.complete_dealer_contract_guided_review(uuid, jsonb, integer) from public;
revoke all on function public.mark_dealer_contract_pdf_generated(uuid, integer) from public;
revoke all on function public.create_dealer_contract_upload_version(uuid) from public;
revoke all on function public.submit_dealer_contract_upload(uuid) from public;
revoke all on function public.request_dealer_contract_new_upload(uuid, text) from public;
revoke all on function public.approve_dealer_contract_upload(uuid) from public;
grant execute on function public.complete_dealer_contract_guided_review(uuid, jsonb, integer) to authenticated;
grant execute on function public.mark_dealer_contract_pdf_generated(uuid, integer) to authenticated;
grant execute on function public.create_dealer_contract_upload_version(uuid) to authenticated;
grant execute on function public.submit_dealer_contract_upload(uuid) to authenticated;
grant execute on function public.request_dealer_contract_new_upload(uuid, text) to authenticated;
grant execute on function public.approve_dealer_contract_upload(uuid) to authenticated;

grant select, insert, update, delete on public.dealer_contract_upload_versions to authenticated;
grant select, insert, update, delete on public.dealer_contract_upload_files to authenticated;
