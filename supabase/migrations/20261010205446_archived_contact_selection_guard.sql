-- Existing historical references remain valid; only new selections are checked.
create function public.loan_active_contact_selection_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare removal_time timestamptz;
begin
  if TG_OP='INSERT' or NEW.dealer_contact_id is distinct from OLD.dealer_contact_id then
    -- Serialize a new selection with concurrent contact archival.
    select c.removed_at into removal_time from public.dealer_contacts c
      where c.id=NEW.dealer_contact_id for share;
    if found and removal_time is not null then
      raise exception 'Removed partner contact cannot be selected for a new loan' using errcode='23514';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.loan_active_contact_selection_guard() from public,anon,authenticated;
create trigger loan_active_contact_selection_guard before insert or update of dealer_contact_id on public.loan_cases
  for each row execute function public.loan_active_contact_selection_guard();

-- Preserve the canonical save operation and all its existing scope/idempotency checks.
-- An unchanged replay must not return an archived contact through SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.upsert_partnerdata_contact(p_dealer_account_id uuid, p_contact_area text, p_contact_id uuid DEFAULT NULL::uuid, p_role_title text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_is_primary boolean DEFAULT false, p_effective_user_id uuid DEFAULT NULL::uuid, p_create_id uuid DEFAULT NULL::uuid)
 RETURNS dealer_contacts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_effective_actor_id uuid;
  v_existing public.dealer_contacts%rowtype;
begin
  if p_contact_area not in ('director', 'sales', 'workshop', 'parts', 'marketing', 'finance') then
    raise exception 'Invalid Partnerdata contact area' using errcode = '23514';
  end if;

  if p_contact_id is not null and p_create_id is not null then
    raise exception 'Partner contact save must use either contact id or create id'
      using errcode = '22023';
  end if;

  v_effective_actor_id := public.partnerdata_effective_actor_id(p_effective_user_id);
  if not public.can_edit_partnerdata_account_as(p_dealer_account_id, v_effective_actor_id) then
    raise exception 'Partner account is outside the effective user scope'
      using errcode = '42501';
  end if;

  if p_contact_id is null and p_create_id is not null then
    insert into public.dealer_contacts (
      id, dealer_account_id, contact_area, role_title, name, email, phone, is_primary
    ) values (
      p_create_id, p_dealer_account_id, p_contact_area, p_role_title, p_name, p_email, p_phone,
      coalesce(p_is_primary, false)
    )
    on conflict (id) do nothing
    returning * into v_existing;

    if not found then
      select * into v_existing
      from public.dealer_contacts
      where id = p_create_id
      for update;

      if not found or v_existing.dealer_account_id <> p_dealer_account_id then
        raise exception 'Partner contact create id is outside its canonical account'
          using errcode = '42501';
      end if;
    end if;
  elsif p_contact_id is null then
    -- Backwards compatibility for older deployed clients. Current clients
    -- always provide p_create_id for a new contact.
    insert into public.dealer_contacts (
      dealer_account_id, contact_area, role_title, name, email, phone, is_primary
    ) values (
      p_dealer_account_id, p_contact_area, p_role_title, p_name, p_email, p_phone,
      coalesce(p_is_primary, false)
    )
    returning * into v_existing;
  else
    select * into v_existing
    from public.dealer_contacts
    where id = p_contact_id
    for update;

    if not found then
      raise exception 'Partner contact not found' using errcode = 'P0002';
    end if;
    if v_existing.dealer_account_id <> p_dealer_account_id then
      raise exception 'Partner contact cannot move outside its canonical account'
        using errcode = '42501';
    end if;
  end if;

  if v_existing.removed_at is not null then
    raise exception 'Removed contact history is read-only' using errcode='42501';
  end if;

  if v_existing.contact_area is distinct from p_contact_area
    or v_existing.role_title is distinct from p_role_title
    or v_existing.name is distinct from p_name
    or v_existing.email is distinct from p_email
    or v_existing.phone is distinct from p_phone
    or v_existing.is_primary is distinct from coalesce(p_is_primary, false)
  then
    update public.dealer_contacts
    set
      contact_area = p_contact_area,
      role_title = p_role_title,
      name = p_name,
      email = p_email,
      phone = p_phone,
      is_primary = coalesce(p_is_primary, false)
    where id = v_existing.id
    returning * into v_existing;
  end if;

  return v_existing;
end;
$function$
