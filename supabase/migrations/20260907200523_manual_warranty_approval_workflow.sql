-- A manual SP is attached to the existing physical machine. The MO reference
-- remains historical machine-order data and is never used as a warranty ID.
create or replace function public.attach_manual_machine_warranty(
  p_registration_id uuid,
  p_sp_number text
) returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.warranty_registrations%rowtype;
  v_after public.warranty_registrations%rowtype;
  v_sp_number text := upper(btrim(coalesce(p_sp_number, '')));
  v_actor uuid := auth.uid();
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorised to attach warranty registrations' using errcode = '42501';
  end if;
  if v_sp_number !~ '^SP-[0-9]+$' then
    raise exception 'Warranty number must use the format SP-123' using errcode = '22023';
  end if;

  select * into v_before from public.warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'Machine registration not found' using errcode = 'P0002'; end if;
  if v_before.source <> 'legacy_machine_import' then
    raise exception 'A machine already has a warranty registration' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.warranty_registrations wr
    where wr.id <> p_registration_id and wr.is_active_in_source
      and upper(coalesce(wr.certificate_number, '')) = v_sp_number
  ) then
    raise exception 'SP number % is already used by another machine', v_sp_number using errcode = '23505';
  end if;
  if exists (
    select 1 from public.warranty_registrations wr
    where wr.id <> p_registration_id and wr.is_active_in_source and wr.source <> 'legacy_machine_import'
      and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = upper(regexp_replace(v_before.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
  ) then
    raise exception 'Serial already has a canonical SP registration' using errcode = '23505';
  end if;

  update public.warranty_registrations
     set source = 'portal_manual', certificate_number = v_sp_number,
         registration_date = coalesce(registration_date, now()), updated_at = now()
   where id = p_registration_id
   returning * into v_after;

  insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
  values (
    p_registration_id, 'portal_manual_approval',
    to_jsonb(v_before) || jsonb_build_object('_actor', v_actor),
    jsonb_build_object(
      'event', 'Garantiregistrering tilføjet: ' || v_sp_number,
      'machine_order_reference', v_before.legacy_warranty_reference,
      'source', jsonb_build_object('old', v_before.source, 'new', 'portal_manual'),
      'certificate_number', jsonb_build_object('old', v_before.certificate_number, 'new', v_sp_number),
      '_actor', v_actor
    )
  );
  return v_after;
end;
$$;

revoke all on function public.attach_manual_machine_warranty(uuid, text) from public;
grant execute on function public.attach_manual_machine_warranty(uuid, text) to authenticated;

-- An internal user may only attach a machine to an active canonical dealer.
create or replace function public.assign_machine_active_dealer(
  p_registration_id uuid,
  p_dealer_account_id uuid
) returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.warranty_registrations%rowtype;
  v_after public.warranty_registrations%rowtype;
  v_dealer public.dealer_accounts%rowtype;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorised to assign machine dealers' using errcode = '42501';
  end if;
  select * into v_before from public.warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'Machine registration not found' using errcode = 'P0002'; end if;
  select * into v_dealer from public.dealer_accounts
  where id = p_dealer_account_id and coalesce(is_active, true)
    and not coalesce(is_deleted, false) and not coalesce(is_blocked, false);
  if not found then raise exception 'Dealer must be an active canonical dealer' using errcode = '22023'; end if;
  update public.warranty_registrations
  set dealer_account_id = v_dealer.id, dealer_account_number = v_dealer.account_number,
      dealer_match_status = 'matched', updated_at = now()
  where id = p_registration_id returning * into v_after;
  insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
  values (p_registration_id, 'portal_machine_dealer_assignment', to_jsonb(v_before),
    jsonb_build_object('event', 'Aktiv forhandler tilknyttet',
      'dealer_account_id', jsonb_build_object('old', v_before.dealer_account_id, 'new', v_dealer.id),
      'dealer_account_number', jsonb_build_object('old', v_before.dealer_account_number, 'new', v_dealer.account_number),
      'machine_order_reference', v_before.legacy_warranty_reference, '_actor', auth.uid()));
  return v_after;
end;
$$;

revoke all on function public.assign_machine_active_dealer(uuid, uuid) from public;
grant execute on function public.assign_machine_active_dealer(uuid, uuid) to authenticated;

-- Whitelisted master-data editing for internal machine administration. Serial
-- numbers and SP references intentionally require their dedicated workflows.
create or replace function public.update_machine_master_data(
  p_registration_id uuid,
  p_machine_model text default null,
  p_delivery_date date default null,
  p_machine_order_reference text default null,
  p_customer_name text default null
) returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.warranty_registrations%rowtype;
  v_after public.warranty_registrations%rowtype;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorised to edit machine master data' using errcode = '42501';
  end if;
  select * into v_before from public.warranty_registrations where id = p_registration_id for update;
  if not found then raise exception 'Machine registration not found' using errcode = 'P0002'; end if;
  update public.warranty_registrations
  set machine_model = nullif(btrim(p_machine_model), ''),
      delivery_date = p_delivery_date,
      legacy_warranty_reference = nullif(upper(btrim(p_machine_order_reference)), ''),
      customer_name = nullif(btrim(p_customer_name), ''), updated_at = now()
  where id = p_registration_id returning * into v_after;
  insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
  values (p_registration_id, 'portal_machine_master_edit', to_jsonb(v_before),
    jsonb_build_object('event', 'Maskindata redigeret',
      'machine_model', jsonb_build_object('old', v_before.machine_model, 'new', v_after.machine_model),
      'delivery_date', jsonb_build_object('old', v_before.delivery_date, 'new', v_after.delivery_date),
      'machine_order_reference', jsonb_build_object('old', v_before.legacy_warranty_reference, 'new', v_after.legacy_warranty_reference),
      'customer_name', jsonb_build_object('old', v_before.customer_name, 'new', v_after.customer_name),
      '_actor', auth.uid()));
  return v_after;
end;
$$;

revoke all on function public.update_machine_master_data(uuid, text, date, text, text) from public;
grant execute on function public.update_machine_master_data(uuid, text, date, text, text) to authenticated;
