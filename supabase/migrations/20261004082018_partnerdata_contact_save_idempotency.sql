-- A browser-generated UUID identifies one logical contact-create operation.
-- Retrying that operation reuses the same canonical dealer_contacts row.
-- Existing contacts continue to update strictly by their canonical primary key.

drop function if exists public.upsert_partnerdata_contact(
  uuid, text, uuid, text, text, text, text, boolean, uuid
);

create function public.upsert_partnerdata_contact(
  p_dealer_account_id uuid,
  p_contact_area text,
  p_contact_id uuid default null,
  p_role_title text default null,
  p_name text default null,
  p_email text default null,
  p_phone text default null,
  p_is_primary boolean default false,
  p_effective_user_id uuid default null,
  p_create_id uuid default null
)
returns public.dealer_contacts
language plpgsql
security definer
set search_path = public
as $$
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
$$;

comment on function public.upsert_partnerdata_contact(
  uuid, text, uuid, text, text, text, text, boolean, uuid, uuid
) is
  'Creates or updates one scoped Partnerdata contact. p_create_id makes retries of one logical create operation idempotent.';

revoke all on function public.upsert_partnerdata_contact(
  uuid, text, uuid, text, text, text, text, boolean, uuid, uuid
) from public, anon;

grant execute on function public.upsert_partnerdata_contact(
  uuid, text, uuid, text, text, text, text, boolean, uuid, uuid
) to authenticated, service_role;
