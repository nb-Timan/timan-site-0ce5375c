-- Partner onboarding / guided contract access control.
-- Adds time-limited guided-contract windows and an append-only agreement history
-- for Partnerdata without changing the existing contract snapshot/PDF/upload flow.

create table if not exists public.dealer_contract_access_windows (
  id uuid primary key default gen_random_uuid(),
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  dealer_account_number text not null,
  contract_id uuid references public.dealer_contracts(id) on delete set null,
  activated_by_user_id uuid default auth.uid(),
  activated_by_name text,
  activated_by_email text,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint dealer_contract_access_windows_valid_time
    check (expires_at > activated_at and expires_at <= activated_at + interval '8 hours')
);

create index if not exists dealer_contract_access_windows_dealer_active_idx
  on public.dealer_contract_access_windows (dealer_account_id, expires_at desc)
  where revoked_at is null;

create index if not exists dealer_contract_access_windows_contract_idx
  on public.dealer_contract_access_windows (contract_id)
  where contract_id is not null;

create table if not exists public.partner_agreement_history (
  id uuid primary key default gen_random_uuid(),
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  dealer_account_number text not null,
  event_type text not null,
  event_title text not null,
  event_description text,
  contract_id uuid references public.dealer_contracts(id) on delete set null,
  upload_version_id uuid references public.dealer_contract_upload_versions(id) on delete set null,
  partner_relation_id uuid references public.partner_account_relations(id) on delete set null,
  document_bucket text,
  document_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid default auth.uid(),
  created_by_name text,
  created_by_email text,
  created_at timestamptz not null default now(),
  constraint partner_agreement_history_event_type_check check (
    event_type in (
      'partner_info_received',
      'partner_approved',
      'contract_access_activated',
      'contract_access_revoked',
      'contract_review_completed',
      'contract_received',
      'contract_approved',
      'new_agreement',
      'partner_relation_changed',
      'cooperation_ended'
    )
  )
);

create index if not exists partner_agreement_history_dealer_idx
  on public.partner_agreement_history (dealer_account_id, created_at desc);

create index if not exists partner_agreement_history_contract_idx
  on public.partner_agreement_history (contract_id)
  where contract_id is not null;

alter table public.dealer_contract_access_windows enable row level security;
alter table public.partner_agreement_history enable row level security;

revoke all on public.dealer_contract_access_windows from anon, public;
revoke all on public.partner_agreement_history from anon, public;
grant select on public.dealer_contract_access_windows to authenticated;
grant select on public.partner_agreement_history to authenticated;
grant all on public.dealer_contract_access_windows to service_role;
grant all on public.partner_agreement_history to service_role;

create or replace function public.current_timan_app_user()
returns table (
  id uuid,
  auth_user_id uuid,
  email text,
  display_name text,
  portal_role text,
  dealer_number text,
  initials text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    au.id,
    au.auth_user_id,
    au.email,
    coalesce(au.display_name, au.full_name, au.email) as display_name,
    coalesce(au.portal_role::text, au.role::text) as portal_role,
    au.dealer_number,
    au.initials
  from public.app_users au
  where (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    and coalesce(au.is_active, true) = true
    and coalesce(au.approved, true) = true
  limit 1;
$$;

revoke all on function public.current_timan_app_user() from public, anon;
grant execute on function public.current_timan_app_user() to authenticated, service_role;

create or replace function public.can_manage_dealer_contract_access(p_dealer_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() au
    where da.id = p_dealer_account_id
      and (
        au.portal_role in ('timan_backend', 'timan_service')
        or (
          au.portal_role = 'timan_seller'
          and (
            da.assigned_seller_id = au.id
            or lower(coalesce(da.assigned_seller_email, '')) = lower(coalesce(au.email, ''))
            or upper(coalesce(da.assigned_seller_initials, '')) = upper(coalesce(au.initials, ''))
          )
        )
      )
  );
$$;

revoke all on function public.can_manage_dealer_contract_access(uuid) from public, anon;
grant execute on function public.can_manage_dealer_contract_access(uuid) to authenticated, service_role;

create or replace function public.is_internal_contract_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_timan_app_user() au
    where au.portal_role in ('timan_backend', 'timan_service', 'timan_seller')
  );
$$;

revoke all on function public.is_internal_contract_actor() from public, anon;
grant execute on function public.is_internal_contract_actor() to authenticated, service_role;

create or replace function public.has_active_dealer_contract_window(
  p_dealer_account_id uuid,
  p_contract_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_contract_access_windows w
    where w.dealer_account_id = p_dealer_account_id
      and w.revoked_at is null
      and now() >= w.activated_at
      and now() < w.expires_at
      and (p_contract_id is null or w.contract_id is null or w.contract_id = p_contract_id)
  );
$$;

revoke all on function public.has_active_dealer_contract_window(uuid, uuid) from public, anon;
grant execute on function public.has_active_dealer_contract_window(uuid, uuid) to authenticated, service_role;

create or replace function public.can_read_partner_agreement_history(p_dealer_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() au
    where da.id = p_dealer_account_id
      and (
        public.can_manage_dealer_contract_access(da.id)
        or da.account_number = au.dealer_number
      )
  );
$$;

revoke all on function public.can_read_partner_agreement_history(uuid) from public, anon;
grant execute on function public.can_read_partner_agreement_history(uuid) to authenticated, service_role;

create or replace function public.append_partner_agreement_history(
  p_dealer_account_id uuid,
  p_event_type text,
  p_event_title text,
  p_event_description text default null,
  p_contract_id uuid default null,
  p_upload_version_id uuid default null,
  p_partner_relation_id uuid default null,
  p_document_bucket text default null,
  p_document_path text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.partner_agreement_history
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  dealer public.dealer_accounts;
  result public.partner_agreement_history;
begin
  select * into actor from public.current_timan_app_user();
  select * into dealer from public.dealer_accounts where id = p_dealer_account_id;
  if dealer.id is null and p_contract_id is not null then
    select da.* into dealer
    from public.dealer_contracts dc
    join public.dealer_accounts da
      on da.id = dc.dealer_account_id
      or da.account_number = dc.dealer_account_number
    where dc.id = p_contract_id
    limit 1;
  end if;
  if dealer.id is null then
    raise exception 'dealer account not found';
  end if;

  insert into public.partner_agreement_history (
    dealer_account_id,
    dealer_account_number,
    event_type,
    event_title,
    event_description,
    contract_id,
    upload_version_id,
    partner_relation_id,
    document_bucket,
    document_path,
    metadata,
    created_by_user_id,
    created_by_name,
    created_by_email
  )
  values (
    dealer.id,
    dealer.account_number,
    p_event_type,
    p_event_title,
    p_event_description,
    p_contract_id,
    p_upload_version_id,
    p_partner_relation_id,
    p_document_bucket,
    p_document_path,
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid(),
    actor.display_name,
    actor.email
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.append_partner_agreement_history(uuid, text, text, text, uuid, uuid, uuid, text, text, jsonb) to authenticated, service_role;

create or replace function public.activate_dealer_contract_access_window(
  p_dealer_account_number text,
  p_contract_id uuid default null,
  p_duration_minutes integer default 60,
  p_note text default null
)
returns public.dealer_contract_access_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  dealer public.dealer_accounts;
  linked_contract public.dealer_contracts;
  result public.dealer_contract_access_windows;
begin
  select * into actor from public.current_timan_app_user();
  select * into dealer
  from public.dealer_accounts
  where account_number = trim(p_dealer_account_number)
  limit 1;

  if dealer.id is null then
    raise exception 'dealer account not found';
  end if;

  if not public.can_manage_dealer_contract_access(dealer.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_duration_minutes not in (60, 120) then
    raise exception 'duration must be 60 or 120 minutes';
  end if;

  if p_contract_id is not null then
    select * into linked_contract from public.dealer_contracts where id = p_contract_id;
    if linked_contract.id is null or linked_contract.dealer_account_id is distinct from dealer.id then
      raise exception 'contract does not belong to dealer';
    end if;
  end if;

  update public.dealer_contract_access_windows
  set revoked_at = now()
  where dealer_account_id = dealer.id
    and revoked_at is null
    and expires_at > now()
    and (contract_id is not distinct from p_contract_id or contract_id is null or p_contract_id is null);

  insert into public.dealer_contract_access_windows (
    dealer_account_id,
    dealer_account_number,
    contract_id,
    activated_by_user_id,
    activated_by_name,
    activated_by_email,
    expires_at,
    note
  )
  values (
    dealer.id,
    dealer.account_number,
    p_contract_id,
    auth.uid(),
    actor.display_name,
    actor.email,
    now() + make_interval(mins => p_duration_minutes),
    p_note
  )
  returning * into result;

  perform public.append_partner_agreement_history(
    dealer.id,
    'contract_access_activated',
    'Guidet kontraktadgang aktiveret',
    format('Adgang åbnet i %s minutter.', p_duration_minutes),
    p_contract_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('duration_minutes', p_duration_minutes, 'window_id', result.id)
  );

  return result;
end;
$$;

revoke all on function public.activate_dealer_contract_access_window(text, uuid, integer, text) from public, anon;
grant execute on function public.activate_dealer_contract_access_window(text, uuid, integer, text) to authenticated, service_role;

create or replace function public.revoke_dealer_contract_access_window(p_window_id uuid)
returns public.dealer_contract_access_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.dealer_contract_access_windows;
begin
  select * into result from public.dealer_contract_access_windows where id = p_window_id;
  if result.id is null then
    raise exception 'access window not found';
  end if;

  if not public.can_manage_dealer_contract_access(result.dealer_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contract_access_windows
  set revoked_at = now()
  where id = p_window_id
  returning * into result;

  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_access_revoked',
    'Guidet kontraktadgang lukket',
    'Adgangen blev lukket manuelt før udløb.',
    result.contract_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('window_id', result.id)
  );

  return result;
end;
$$;

revoke all on function public.revoke_dealer_contract_access_window(uuid) from public, anon;
grant execute on function public.revoke_dealer_contract_access_window(uuid) to authenticated, service_role;

drop policy if exists dealer_contract_access_windows_select on public.dealer_contract_access_windows;
create policy dealer_contract_access_windows_select
on public.dealer_contract_access_windows
for select to authenticated
using (
  public.can_manage_dealer_contract_access(dealer_account_id)
  or dealer_account_number = public.current_user_dealer_number()
);

drop policy if exists partner_agreement_history_select on public.partner_agreement_history;
create policy partner_agreement_history_select
on public.partner_agreement_history
for select to authenticated
using (public.can_read_partner_agreement_history(dealer_account_id));

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
    left join public.dealer_accounts da
      on da.id = dc.dealer_account_id
      or da.account_number = dc.dealer_account_number
    left join public.current_timan_app_user() au on true
    where dc.id = p_contract_id
      and (
        public.is_internal_contract_actor()
        or
        public.can_manage_dealer_contract_access(coalesce(dc.dealer_account_id, da.id))
        or (
          coalesce(dc.dealer_account_number, da.account_number) = au.dealer_number
          and (
            dc.contract_status in ('awaiting_signed_upload', 'submitted_for_approval', 'changes_requested', 'approved', 'archived')
            or public.has_active_dealer_contract_window(coalesce(dc.dealer_account_id, da.id), dc.id)
          )
        )
      )
  );
$$;

revoke all on function public.can_read_dealer_contract(uuid) from public, anon;
grant execute on function public.can_read_dealer_contract(uuid) to authenticated, service_role;

drop policy if exists dealer_contracts_select_owner_or_backend on public.dealer_contracts;
drop policy if exists dealer_contracts_insert_owner_or_backend on public.dealer_contracts;
drop policy if exists dealer_contracts_update_owner_or_backend on public.dealer_contracts;

create policy dealer_contracts_select_controlled
on public.dealer_contracts
for select to authenticated
using (public.can_read_dealer_contract(id));

create policy dealer_contracts_insert_controlled
on public.dealer_contracts
for insert to authenticated
with check (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or (
    dealer_account_number = public.current_user_dealer_number()
    and public.has_active_dealer_contract_window(dealer_account_id, null)
  )
);

create policy dealer_contracts_update_controlled
on public.dealer_contracts
for update to authenticated
using (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or (
    dealer_account_number = public.current_user_dealer_number()
    and contract_status in ('draft', 'guided_review', 'ready_for_signature')
    and public.has_active_dealer_contract_window(dealer_account_id, id)
  )
)
with check (
  public.is_internal_contract_actor()
  or public.can_manage_dealer_contract_access(dealer_account_id)
  or (
    dealer_account_number = public.current_user_dealer_number()
    and contract_status in ('draft', 'guided_review', 'ready_for_signature')
    and public.has_active_dealer_contract_window(dealer_account_id, id)
  )
);

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
  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_review_completed',
    'Kontraktgennemgang afsluttet',
    'Den guidede kontrakt blev låst og gjort klar til underskrift.',
    result.id,
    null,
    null,
    null,
    null,
    jsonb_build_object('contract_status', result.contract_status, 'expected_signed_pages', result.expected_signed_pages)
  );
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
  linked_contract public.dealer_contracts;
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
      submitted_at = now(),
      status = 'Signed',
      updated_at = now()
  where id = uv.contract_id
  returning * into linked_contract;

  perform public.audit_dealer_contract_event(uv.contract_id, 'signed_upload_submitted', jsonb_build_object('upload_version_id', uv.id, 'file_count', file_count));
  perform public.append_partner_agreement_history(
    linked_contract.dealer_account_id,
    'contract_received',
    'Underskrevet kontrakt modtaget',
    'Partneren har uploadet den underskrevne kontrakt til Timan-godkendelse.',
    linked_contract.id,
    result.id,
    null,
    null,
    null,
    jsonb_build_object('file_count', file_count)
  );
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
  returning * into result;

  perform public.audit_dealer_contract_event(result.id, 'signed_upload_approved', jsonb_build_object('upload_version_id', uv.id));
  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_approved',
    'Kontrakt godkendt',
    'Timan har godkendt den underskrevne kontrakt.',
    result.id,
    uv.id,
    null,
    null,
    null,
    jsonb_build_object('contract_status', result.contract_status)
  );
  return result;
end;
$$;
