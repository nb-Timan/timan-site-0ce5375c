-- Contract access windows: make guided partner access user-specific,
-- schedulable and contract-specific while reusing dealer_contract_access_windows.

alter table public.dealer_contract_access_windows
  add column if not exists user_id uuid references public.app_users(id) on delete cascade,
  add column if not exists opens_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists status text not null default 'open',
  add column if not exists created_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists revoked_by_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists revoked_by_name text,
  add column if not exists revoked_by_email text,
  add column if not exists updated_at timestamptz not null default now();

update public.dealer_contract_access_windows
set opens_at = coalesce(opens_at, activated_at),
    closes_at = coalesce(closes_at, expires_at),
    status = case
      when revoked_at is not null then 'revoked'
      when coalesce(opens_at, activated_at) > now() then 'planned'
      else 'open'
    end
where opens_at is null
   or closes_at is null;

alter table public.dealer_contract_access_windows
  alter column opens_at set not null,
  alter column closes_at set not null;

alter table public.dealer_contract_access_windows
  drop constraint if exists dealer_contract_access_windows_valid_time,
  drop constraint if exists dealer_contract_access_windows_status_check;

alter table public.dealer_contract_access_windows
  add constraint dealer_contract_access_windows_valid_time
    check (closes_at > opens_at and closes_at <= opens_at + interval '24 hours'),
  add constraint dealer_contract_access_windows_status_check
    check (status in ('planned', 'open', 'revoked'));

create index if not exists dealer_contract_access_windows_user_contract_idx
  on public.dealer_contract_access_windows (user_id, contract_id, closes_at desc)
  where revoked_at is null;

create index if not exists dealer_contract_access_windows_contract_closes_idx
  on public.dealer_contract_access_windows (contract_id, closes_at desc)
  where contract_id is not null;

alter table public.partner_agreement_history
  drop constraint if exists partner_agreement_history_event_type_check;

alter table public.partner_agreement_history
  add constraint partner_agreement_history_event_type_check check (
    event_type in (
      'partner_info_received',
      'partner_approved',
      'contract_access_activated',
      'contract_access_extended',
      'contract_access_revoked',
      'contract_review_completed',
      'contract_received',
      'contract_approved',
      'new_agreement',
      'collaboration_partner_added',
      'partner_relation_changed',
      'service_partner_added',
      'dealer_customer_added',
      'cooperation_ended'
    )
  );

create or replace function public.is_external_contract_user_role(p_role text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_role, '') in (
    'timan_dealer',
    'dealer_user',
    'timan_importer',
    'timan_service_partner',
    'dealer_customer'
  );
$$;

revoke all on function public.is_external_contract_user_role(text) from public, anon;
grant execute on function public.is_external_contract_user_role(text) to authenticated, service_role;

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
    join public.app_users raw_au on raw_au.id = au.id
    where da.id = p_dealer_account_id
      and coalesce(da.is_deleted, false) = false
      and coalesce(da.is_blocked, false) = false
      and (
        au.portal_role = 'timan_backend'
        or (
          au.portal_role = 'timan_seller'
          and (
            'contracts' = any(coalesce(raw_au.allowed_modules, '{}'::text[]))
            or coalesce((raw_au.permissions ->> 'can_manage_contract_access')::boolean, false) = true
          )
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

create or replace function public.has_active_dealer_contract_window(
  p_dealer_account_id uuid,
  p_contract_id uuid default null,
  p_user_id uuid default null
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
      and (p_user_id is null or w.user_id = p_user_id)
      and w.contract_id = p_contract_id
      and w.revoked_at is null
      and now() >= w.opens_at
      and now() < w.closes_at
  );
$$;

revoke all on function public.has_active_dealer_contract_window(uuid, uuid) from public, anon;
revoke all on function public.has_active_dealer_contract_window(uuid, uuid, uuid) from public, anon;
grant execute on function public.has_active_dealer_contract_window(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_active_dealer_contract_window(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.activate_dealer_contract_access_window(
  p_dealer_account_number text,
  p_contract_id uuid,
  p_user_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
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
  target_user public.app_users;
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
  if coalesce(dealer.is_deleted, false) or coalesce(dealer.is_blocked, false) then
    raise exception 'partner account is not active';
  end if;
  if not public.can_manage_dealer_contract_access(dealer.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into linked_contract from public.dealer_contracts where id = p_contract_id;
  if linked_contract.id is null
     or coalesce(linked_contract.dealer_account_id, dealer.id) is distinct from dealer.id
     or coalesce(linked_contract.dealer_account_number, dealer.account_number) is distinct from dealer.account_number then
    raise exception 'contract does not belong to dealer';
  end if;

  select * into target_user from public.app_users where id = p_user_id;
  if target_user.id is null then
    raise exception 'portal user not found';
  end if;
  if coalesce(target_user.is_active, false) = false or coalesce(target_user.approved, false) = false then
    raise exception 'portal user is not active and approved';
  end if;
  if not public.is_external_contract_user_role(coalesce(target_user.portal_role::text, target_user.role::text)) then
    raise exception 'portal user must be external';
  end if;
  if trim(coalesce(target_user.dealer_number, '')) <> dealer.account_number then
    raise exception 'portal user does not belong to dealer';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at or p_closes_at > p_opens_at + interval '24 hours' then
    raise exception 'invalid access window';
  end if;

  insert into public.dealer_contract_access_windows (
    dealer_account_id,
    dealer_account_number,
    contract_id,
    user_id,
    opens_at,
    closes_at,
    activated_at,
    expires_at,
    status,
    activated_by_user_id,
    created_by_user_id,
    activated_by_name,
    activated_by_email,
    note
  )
  values (
    dealer.id,
    dealer.account_number,
    linked_contract.id,
    target_user.id,
    p_opens_at,
    p_closes_at,
    p_opens_at,
    p_closes_at,
    case when p_opens_at > now() then 'planned' else 'open' end,
    auth.uid(),
    actor.id,
    actor.display_name,
    actor.email,
    p_note
  )
  returning * into result;

  perform public.append_partner_agreement_history(
    dealer.id,
    'contract_access_activated',
    'Kontrakt åbnet for partner',
    format('Adgang åbnet for %s fra %s til %s.', target_user.email, p_opens_at, p_closes_at),
    linked_contract.id,
    null,
    null,
    null,
    null,
    jsonb_build_object(
      'window_id', result.id,
      'user_id', target_user.id,
      'user_email', target_user.email,
      'opens_at', p_opens_at,
      'closes_at', p_closes_at
    )
  );

  return result;
end;
$$;

revoke all on function public.activate_dealer_contract_access_window(text, uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.activate_dealer_contract_access_window(text, uuid, uuid, timestamptz, timestamptz, text) to authenticated, service_role;

create or replace function public.extend_dealer_contract_access_window(
  p_window_id uuid,
  p_closes_at timestamptz
)
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
  if result.revoked_at is not null then
    raise exception 'access window is closed';
  end if;
  if p_closes_at <= result.opens_at or p_closes_at > result.opens_at + interval '24 hours' then
    raise exception 'invalid access window';
  end if;

  update public.dealer_contract_access_windows
  set closes_at = p_closes_at,
      expires_at = p_closes_at,
      status = case when opens_at > now() then 'planned' else 'open' end,
      updated_at = now()
  where id = p_window_id
  returning * into result;

  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_access_extended',
    'Kontraktadgang forlænget',
    format('Adgangen blev forlænget til %s.', p_closes_at),
    result.contract_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('window_id', result.id, 'closes_at', p_closes_at, 'user_id', result.user_id)
  );

  return result;
end;
$$;

revoke all on function public.extend_dealer_contract_access_window(uuid, timestamptz) from public, anon;
grant execute on function public.extend_dealer_contract_access_window(uuid, timestamptz) to authenticated, service_role;

create or replace function public.revoke_dealer_contract_access_window(p_window_id uuid)
returns public.dealer_contract_access_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  actor record;
  result public.dealer_contract_access_windows;
begin
  select * into actor from public.current_timan_app_user();
  select * into result from public.dealer_contract_access_windows where id = p_window_id;
  if result.id is null then
    raise exception 'access window not found';
  end if;
  if not public.can_manage_dealer_contract_access(result.dealer_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.dealer_contract_access_windows
  set revoked_at = now(),
      status = 'revoked',
      revoked_by_user_id = actor.id,
      revoked_by_name = actor.display_name,
      revoked_by_email = actor.email,
      updated_at = now()
  where id = p_window_id
  returning * into result;

  perform public.append_partner_agreement_history(
    result.dealer_account_id,
    'contract_access_revoked',
    'Kontraktadgang lukket manuelt',
    'Adgangen blev lukket manuelt før udløb.',
    result.contract_id,
    null,
    null,
    null,
    null,
    jsonb_build_object('window_id', result.id, 'user_id', result.user_id)
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
  or exists (
    select 1
    from public.current_timan_app_user() au
    where au.id = dealer_contract_access_windows.user_id
      and au.dealer_number = dealer_contract_access_windows.dealer_account_number
  )
);

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
        or public.can_manage_dealer_contract_access(coalesce(dc.dealer_account_id, da.id))
        or (
          coalesce(dc.dealer_account_number, da.account_number) = au.dealer_number
          and (
            dc.contract_status in ('awaiting_signed_upload', 'submitted_for_approval', 'changes_requested', 'approved', 'archived')
            or public.has_active_dealer_contract_window(coalesce(dc.dealer_account_id, da.id), dc.id, au.id)
          )
        )
      )
  );
$$;

revoke all on function public.can_read_dealer_contract(uuid) from public, anon;
grant execute on function public.can_read_dealer_contract(uuid) to authenticated, service_role;
