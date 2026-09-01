-- Disambiguate contract access history writes now that partner agreement
-- history has both 10-argument and 11-argument overloads.

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

  select da.* into dealer
  from public.dealer_accounts da
  where da.account_number = trim(p_dealer_account_number)
  limit 1;

  if dealer.id is null then raise exception 'dealer account not found'; end if;
  if coalesce(dealer.is_deleted, false) or coalesce(dealer.is_blocked, false) then
    raise exception 'partner account is not active';
  end if;
  if not public.can_manage_dealer_contract_access(dealer.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select dc.* into linked_contract from public.dealer_contracts dc where dc.id = p_contract_id;
  if linked_contract.id is null
     or coalesce(linked_contract.dealer_account_id, dealer.id) is distinct from dealer.id
     or coalesce(linked_contract.dealer_account_number, dealer.account_number) is distinct from dealer.account_number then
    raise exception 'contract does not belong to dealer';
  end if;

  select au.* into target_user from public.app_users au where au.id = p_user_id;
  if target_user.id is null then raise exception 'portal user not found'; end if;
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
    dealer_account_id, dealer_account_number, contract_id, user_id, opens_at,
    closes_at, activated_at, expires_at, status, activated_by_user_id,
    created_by_user_id, activated_by_name, activated_by_email, note
  )
  values (
    dealer.id, dealer.account_number, linked_contract.id, target_user.id,
    p_opens_at, p_closes_at, p_opens_at, p_closes_at,
    case when p_opens_at > now() then 'planned' else 'open' end,
    auth.uid(), actor.id, actor.display_name, actor.email, p_note
  )
  returning * into result;

  perform public.append_partner_agreement_history(
    dealer.id,
    'contract_access_activated'::text,
    'Kontrakt åbnet for partner'::text,
    format('Adgang åbnet for %s fra %s til %s.', target_user.email, p_opens_at, p_closes_at)::text,
    linked_contract.id,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object('window_id', result.id, 'user_id', target_user.id, 'user_email', target_user.email, 'opens_at', p_opens_at, 'closes_at', p_closes_at),
    now()
  );

  return result;
end;
$$;

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
  if result.id is null then raise exception 'access window not found'; end if;
  if not public.can_manage_dealer_contract_access(result.dealer_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if result.revoked_at is not null then raise exception 'access window is closed'; end if;
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
    'contract_access_extended'::text,
    'Kontraktadgang forlænget'::text,
    format('Adgangen blev forlænget til %s.', p_closes_at)::text,
    result.contract_id,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object('window_id', result.id, 'closes_at', p_closes_at, 'user_id', result.user_id),
    now()
  );

  return result;
end;
$$;

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
  if result.id is null then raise exception 'access window not found'; end if;
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
    'contract_access_revoked'::text,
    'Kontraktadgang lukket manuelt'::text,
    'Adgangen blev lukket manuelt før udløb.'::text,
    result.contract_id,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    jsonb_build_object('window_id', result.id, 'user_id', result.user_id),
    now()
  );

  return result;
end;
$$;
