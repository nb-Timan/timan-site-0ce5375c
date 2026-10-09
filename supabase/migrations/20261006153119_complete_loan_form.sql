-- Complete the Loans preparation form without enabling any inventory units.
alter table public.loan_cases
  add column if not exists loan_date date,
  add column if not exists serial_numbers_confirmed_by uuid references public.app_users(id),
  add column if not exists serial_numbers_confirmed_at timestamptz;

alter table public.loan_cases
  drop constraint if exists loan_cases_return_after_loan_date;
alter table public.loan_cases
  add constraint loan_cases_return_after_loan_date
  check (loan_date is null or expected_return_date is null or expected_return_date >= loan_date);

alter table public.loan_case_items
  add column if not exists warehouse_snapshot text;

alter table public.loan_case_versions
  add column if not exists loan_date date,
  add column if not exists serial_numbers_confirmed_by uuid,
  add column if not exists serial_numbers_confirmed_at timestamptz;

alter table public.loan_case_version_items
  add column if not exists warehouse_snapshot text;

alter table public.loan_case_item_photos
  drop constraint if exists loan_case_item_photos_photo_kind_check;
alter table public.loan_case_item_photos
  add constraint loan_case_item_photos_photo_kind_check
  check (photo_kind in ('serial_plate','hour_meter','overview'));

create or replace function public.loan_list_eligible_assets(p_warehouse_location text default null)
returns table (
  id uuid,
  sku text,
  product_name text,
  serial_number text,
  machine_ident_number text,
  warehouse_location text,
  supply_status text,
  item_type text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select lower(coalesce(a.preferred_language, 'da')) as language_code
    from public.app_users a
    where a.auth_user_id = auth.uid()
      and a.approved is true
      and a.is_active is true
      and a.portal_role::text in ('timan_backend','timan_seller','timan_service')
    limit 1
  ), products as (
    select * from public.list_published_product_master()
  )
  select
    u.id,
    u.item_number,
    coalesce(
      case (select language_code from actor)
        when 'en' then p.item_text_en
        when 'de' then p.item_text_de
        when 'it' then p.item_text_it
        when 'hu' then p.item_text_hu
        when 'sv' then p.item_text_sv
        when 'fr' then p.item_text_fr
        when 'pl' then p.item_text_pl
        when 'cs' then p.item_text_cs
        else p.item_text_da
      end,
      p.item_text_da,
      u.item_number
    ),
    u.serial_number,
    u.machine_ident_number,
    u.warehouse_location,
    u.supply_status,
    case
      when exists (select 1 from public.planning_machine_products m where m.item_number = u.item_number) then 'machine'
      when exists (select 1 from public.planning_accessory_products a where a.item_number = u.item_number) then 'equipment'
    end
  from public.planning_supply_units u
  cross join actor
  left join products p on p.item_number = u.item_number and p.is_active is true
  where public.can_access_loans()
    and u.timan_owned is true
    and u.loan_eligible is true
    and nullif(btrim(u.serial_number), '') is not null
    and u.supply_status not in ('blocked','unavailable','sold','completed')
    and (
      exists (select 1 from public.planning_machine_products m where m.item_number = u.item_number)
      or exists (select 1 from public.planning_accessory_products a where a.item_number = u.item_number)
    )
    and (p_warehouse_location is null or u.warehouse_location = p_warehouse_location)
    and not exists (
      select 1 from public.planning_reservations r
      where r.supply_unit_id = u.id and r.status = 'active'
    )
    and not exists (
      select 1 from public.loan_asset_allocations a
      where a.supply_unit_id = u.id and a.allocation_status = 'active'
    )
  order by coalesce(u.warehouse_location, ''), u.item_number, u.serial_number;
$$;
revoke all on function public.loan_list_eligible_assets(text) from public, anon;
grant execute on function public.loan_list_eligible_assets(text) to authenticated;

drop function if exists public.loan_create_case(uuid,uuid,uuid,date,text,boolean,text,text,text,text,text,text);
create function public.loan_create_case(
  p_responsible_user_id uuid,
  p_dealer_account_id uuid,
  p_dealer_contact_id uuid,
  p_expected_return_date date default null,
  p_notes text default null,
  p_alternative_delivery_address boolean default false,
  p_delivery_address text default null,
  p_delivery_postal_code text default null,
  p_delivery_city text default null,
  p_delivery_country text default null,
  p_delivery_contact text default null,
  p_delivery_note text default null,
  p_loan_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_case uuid;
  v_language text;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.can_access_loans() then raise exception 'Loan access denied'; end if;
  if not exists (
    select 1 from public.app_users a
    where a.id = v_actor and a.portal_role::text in ('timan_backend','timan_seller','timan_service')
  ) then raise exception 'Loan case creation denied'; end if;
  if not exists (
    select 1 from public.app_users u
    where u.id = p_responsible_user_id and u.approved is true and u.is_active is true
      and u.portal_role::text in ('timan_backend','timan_seller')
  ) then raise exception 'Invalid responsible seller'; end if;
  if not exists (
    select 1 from public.dealer_accounts d
    where d.id = p_dealer_account_id and d.assigned_seller_id = p_responsible_user_id
      and coalesce(d.is_active,true) is true and coalesce(d.is_deleted,false) is false
  ) then raise exception 'Partner does not belong to seller'; end if;
  if not exists (
    select 1 from public.dealer_contacts c
    where c.id = p_dealer_contact_id and c.dealer_account_id = p_dealer_account_id
      and nullif(btrim(c.name),'') is not null
  ) then raise exception 'Invalid canonical partner contact'; end if;
  if p_loan_date is not null and p_expected_return_date is not null and p_expected_return_date < p_loan_date then
    raise exception 'Expected return must be on or after loan date';
  end if;
  select case
    when lower(coalesce(u.preferred_language, 'da')) in ('da','en','de','it','hu','sv','fr','pl','cs')
      then lower(u.preferred_language)
    else 'da'
  end into v_language from public.app_users u where u.id = v_actor;
  insert into public.loan_cases (
    case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by,language_code,
    loan_date,expected_return_date,notes,alternative_delivery_address,delivery_address,
    delivery_postal_code,delivery_city,delivery_country,delivery_contact,delivery_note
  ) values (
    'LN-' || lpad(nextval('public.loan_case_number_seq')::text, 6, '0'),
    p_responsible_user_id,p_dealer_account_id,p_dealer_contact_id,v_actor,v_language,
    p_loan_date,p_expected_return_date,nullif(btrim(p_notes),''),p_alternative_delivery_address,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_address),'') end,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_postal_code),'') end,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_city),'') end,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_country),'') end,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_contact),'') end,
    case when p_alternative_delivery_address then nullif(btrim(p_delivery_note),'') end
  ) returning id into v_case;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,to_status)
  values(v_case,'CASE_CREATED',v_actor,'DRAFT');
  return v_case;
end;
$$;
revoke all on function public.loan_create_case(uuid,uuid,uuid,date,text,boolean,text,text,text,text,text,text,date) from public, anon;
grant execute on function public.loan_create_case(uuid,uuid,uuid,date,text,boolean,text,text,text,text,text,text,date) to authenticated;

create or replace function public.loan_update_draft_case(
  p_case_id uuid,
  p_loan_date date default null,
  p_expected_return_date date default null,
  p_notes text default null,
  p_alternative_delivery_address boolean default false,
  p_delivery_address text default null,
  p_delivery_postal_code text default null,
  p_delivery_city text default null,
  p_delivery_country text default null,
  p_delivery_contact text default null,
  p_delivery_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  if not exists (select 1 from public.loan_cases c where c.id = p_case_id and c.status = 'DRAFT') then
    raise exception 'Only draft cases can be edited';
  end if;
  if p_loan_date is not null and p_expected_return_date is not null and p_expected_return_date < p_loan_date then
    raise exception 'Expected return must be on or after loan date';
  end if;
  update public.loan_cases set
    loan_date = p_loan_date,
    expected_return_date = p_expected_return_date,
    notes = nullif(btrim(p_notes),''),
    alternative_delivery_address = p_alternative_delivery_address,
    delivery_address = case when p_alternative_delivery_address then nullif(btrim(p_delivery_address),'') end,
    delivery_postal_code = case when p_alternative_delivery_address then nullif(btrim(p_delivery_postal_code),'') end,
    delivery_city = case when p_alternative_delivery_address then nullif(btrim(p_delivery_city),'') end,
    delivery_country = case when p_alternative_delivery_address then nullif(btrim(p_delivery_country),'') end,
    delivery_contact = case when p_alternative_delivery_address then nullif(btrim(p_delivery_contact),'') end,
    delivery_note = case when p_alternative_delivery_address then nullif(btrim(p_delivery_note),'') end,
    serial_numbers_confirmed_by = null,
    serial_numbers_confirmed_at = null,
    updated_at = now()
  where id = p_case_id;
  update public.loan_case_items set serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'DRAFT_UPDATED',v_actor,jsonb_build_object('loan_date',p_loan_date,'expected_return_date',p_expected_return_date));
end;
$$;
revoke all on function public.loan_update_draft_case(uuid,date,date,text,boolean,text,text,text,text,text,text) from public, anon;
grant execute on function public.loan_update_draft_case(uuid,date,date,text,boolean,text,text,text,text,text,text) to authenticated;

create or replace function public.loan_add_asset_item(
  p_case_id uuid,
  p_supply_unit_id uuid,
  p_usage_reading_value numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_item uuid;
  v_unit public.planning_supply_units%rowtype;
  v_item_type text;
  v_product_name text;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  if not exists (select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT') then
    raise exception 'Only draft cases can be edited';
  end if;
  select * into v_unit from public.planning_supply_units u where u.id=p_supply_unit_id for update;
  if v_unit.id is null or v_unit.timan_owned is not true or v_unit.loan_eligible is not true
    or nullif(btrim(v_unit.serial_number),'') is null
    or v_unit.supply_status in ('blocked','unavailable','sold','completed') then
    raise exception 'Asset is not loan eligible';
  end if;
  if exists (select 1 from public.planning_machine_products m where m.item_number=v_unit.item_number) then
    v_item_type := 'machine';
  elsif exists (select 1 from public.planning_accessory_products a where a.item_number=v_unit.item_number) then
    v_item_type := 'equipment';
  else
    raise exception 'Asset has no canonical Planning classification';
  end if;
  if exists (select 1 from public.planning_reservations r where r.supply_unit_id=p_supply_unit_id and r.status='active')
    or exists (select 1 from public.loan_asset_allocations a where a.supply_unit_id=p_supply_unit_id and a.allocation_status='active') then
    raise exception 'Asset is already allocated';
  end if;
  select p.item_text_da into v_product_name
  from public.list_published_product_master() p
  where p.item_number=v_unit.item_number and p.is_active is true
  limit 1;
  insert into public.loan_case_items(
    case_id,item_type,product_sku,planning_supply_unit_id,usage_reading_value,usage_reading_unit,
    serial_verified,serial_snapshot,product_name_snapshot,warehouse_snapshot,created_by
  ) values (
    p_case_id,v_item_type,v_unit.item_number,p_supply_unit_id,
    case when v_item_type='machine' then p_usage_reading_value end,
    case when v_item_type='machine' and p_usage_reading_value is not null then 'hours' end,
    false,v_unit.serial_number,coalesce(v_product_name,v_unit.item_number),v_unit.warehouse_location,v_actor
  ) returning id into v_item;
  insert into public.loan_asset_allocations(case_item_id,supply_unit_id,allocated_by)
  values(v_item,p_supply_unit_id,v_actor);
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_ADDED',v_actor,jsonb_build_object('case_item_id',v_item,'supply_unit_id',p_supply_unit_id,'item_type',v_item_type));
  return v_item;
exception
  when unique_violation then raise exception 'Asset is already allocated';
end;
$$;
revoke all on function public.loan_add_asset_item(uuid,uuid,numeric) from public, anon;
grant execute on function public.loan_add_asset_item(uuid,uuid,numeric) to authenticated;

create or replace function public.loan_update_item_checkout_reading(
  p_case_id uuid,
  p_case_item_id uuid,
  p_usage_reading_value numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  if p_usage_reading_value is not null and p_usage_reading_value < 0 then raise exception 'Invalid hour meter value'; end if;
  update public.loan_case_items set
    usage_reading_value=p_usage_reading_value,
    usage_reading_unit=case when p_usage_reading_value is null then null else 'hours' end,
    serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where id=p_case_item_id and case_id=p_case_id and item_type='machine'
    and exists(select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT');
  if not found then raise exception 'Machine item is not editable'; end if;
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'CHECKOUT_READING_UPDATED',v_actor,jsonb_build_object('case_item_id',p_case_item_id));
end;
$$;
revoke all on function public.loan_update_item_checkout_reading(uuid,uuid,numeric) from public, anon;
grant execute on function public.loan_update_item_checkout_reading(uuid,uuid,numeric) to authenticated;

create or replace function public.loan_remove_draft_item(p_case_id uuid,p_case_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_supply uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  if not exists(select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT') then raise exception 'Only draft cases can be edited'; end if;
  select planning_supply_unit_id into v_supply from public.loan_case_items where id=p_case_item_id and case_id=p_case_id;
  if v_supply is null then raise exception 'Invalid loan item'; end if;
  update public.loan_asset_allocations set allocation_status='released',released_by=v_actor,released_at=now(),release_reason='DRAFT_ITEM_REMOVED'
  where case_item_id=p_case_item_id and allocation_status='active';
  delete from public.loan_case_items where id=p_case_item_id and case_id=p_case_id;
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_REMOVED',v_actor,jsonb_build_object('case_item_id',p_case_item_id,'supply_unit_id',v_supply));
end;
$$;
revoke all on function public.loan_remove_draft_item(uuid,uuid) from public, anon;
grant execute on function public.loan_remove_draft_item(uuid,uuid) to authenticated;

create or replace function public.loan_register_item_photo(
  p_case_id uuid,
  p_case_item_id uuid,
  p_storage_path text,
  p_photo_kind text,
  p_file_name text,
  p_content_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan photo access denied'; end if;
  if not exists(select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT') then raise exception 'Only draft photos can be edited'; end if;
  if not exists(select 1 from public.loan_case_items i where i.id=p_case_item_id and i.case_id=p_case_id) then raise exception 'Invalid loan item'; end if;
  if p_storage_path not like p_case_id::text || '/%' then raise exception 'Invalid storage path'; end if;
  if p_photo_kind not in ('serial_plate','hour_meter','overview') then raise exception 'Invalid photo kind'; end if;
  if p_photo_kind='hour_meter' and not exists(
    select 1 from public.loan_case_items i where i.id=p_case_item_id and i.case_id=p_case_id and i.item_type='machine'
  ) then raise exception 'Hour meter photos are only allowed for machines'; end if;
  if (select count(*) from public.loan_case_item_photos p where p.case_item_id=p_case_item_id) >= 3 then raise exception 'Maximum three photos per loan item'; end if;
  insert into public.loan_case_item_photos(case_id,case_item_id,storage_path,photo_kind,file_name,content_type,uploaded_by)
  values(p_case_id,p_case_item_id,p_storage_path,p_photo_kind,p_file_name,p_content_type,v_actor)
  returning id into v_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'PHOTO_ADDED',v_actor,jsonb_build_object('case_item_id',p_case_item_id,'photo_kind',p_photo_kind));
  return v_id;
end;
$$;
revoke all on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) to authenticated;

create or replace function public.loan_remove_item_photo(p_case_id uuid,p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_path text; v_item uuid; v_kind text;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan photo access denied'; end if;
  if not exists(select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT') then raise exception 'Only draft photos can be edited'; end if;
  select storage_path,case_item_id,photo_kind into v_path,v_item,v_kind
  from public.loan_case_item_photos where id=p_photo_id and case_id=p_case_id;
  if v_path is null then raise exception 'Invalid loan photo'; end if;
  delete from public.loan_case_item_photos where id=p_photo_id and case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'PHOTO_REMOVED',v_actor,jsonb_build_object('case_item_id',v_item,'photo_kind',v_kind));
  return v_path;
end;
$$;
revoke all on function public.loan_remove_item_photo(uuid,uuid) from public, anon;
grant execute on function public.loan_remove_item_photo(uuid,uuid) to authenticated;

drop function if exists public.loan_create_case_version(uuid);
create function public.loan_create_case_version(p_case_id uuid,p_serial_numbers_confirmed boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
  v_number integer;
  v_version uuid;
  v_terms uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.status <> 'DRAFT' then raise exception 'Only draft cases can be versioned'; end if;
  if v_case.loan_date is null then raise exception 'Loan date is required'; end if;
  if v_case.expected_return_date is null then raise exception 'Expected return date is required'; end if;
  if v_case.expected_return_date < v_case.loan_date then raise exception 'Expected return must be on or after loan date'; end if;
  if not exists(select 1 from public.loan_case_items where case_id=p_case_id) then raise exception 'At least one item is required'; end if;
  if exists(
    select 1 from public.loan_case_items i
    where i.case_id=p_case_id and (
      i.planning_supply_unit_id is null
      or nullif(btrim(i.serial_snapshot),'') is null
      or not exists(select 1 from public.loan_asset_allocations a where a.case_item_id=i.id and a.allocation_status='active')
    )
  ) then raise exception 'Every item requires an active canonical serialized asset'; end if;
  if exists(
    select 1 from public.loan_case_items i
    where i.case_id=p_case_id and not exists(
      select 1 from public.loan_case_item_photos p where p.case_item_id=i.id and p.photo_kind='serial_plate'
    )
  ) then raise exception 'A type plate photo is required for every item'; end if;
  if exists(
    select 1 from public.loan_case_items i
    where i.case_id=p_case_id and i.item_type='machine' and (
      i.usage_reading_value is null
      or not exists(select 1 from public.loan_case_item_photos p where p.case_item_id=i.id and p.photo_kind='hour_meter')
    )
  ) then raise exception 'Machine hour meter value and photo are required'; end if;
  if not p_serial_numbers_confirmed then raise exception 'Serial number confirmation is required'; end if;

  update public.loan_cases set serial_numbers_confirmed_by=v_actor,serial_numbers_confirmed_at=now(),updated_at=now()
  where id=p_case_id;
  update public.loan_case_items set serial_verified=true,serial_verified_by=v_actor,serial_verified_at=now(),updated_at=now()
  where case_id=p_case_id;

  v_number := v_case.current_version_number + 1;
  select t.id into v_terms
  from public.loan_term_versions t
  join public.loan_term_translations x on x.term_version_id=t.id and x.language_code=v_case.language_code
  where t.status='APPROVED'
  order by t.version_number desc limit 1;

  insert into public.loan_case_versions(
    case_id,version_number,status_snapshot,responsible_user_id,dealer_account_id,dealer_contact_id,
    language_code,loan_date,expected_return_date,alternative_delivery_address,delivery_address,
    delivery_postal_code,delivery_city,delivery_country,delivery_contact,delivery_note,notes,
    serial_numbers_confirmed_by,serial_numbers_confirmed_at,term_version_id,created_by
  ) values (
    v_case.id,v_number,v_case.status,v_case.responsible_user_id,v_case.dealer_account_id,v_case.dealer_contact_id,
    v_case.language_code,v_case.loan_date,v_case.expected_return_date,v_case.alternative_delivery_address,
    v_case.delivery_address,v_case.delivery_postal_code,v_case.delivery_city,v_case.delivery_country,
    v_case.delivery_contact,v_case.delivery_note,v_case.notes,v_actor,now(),v_terms,v_actor
  ) returning id into v_version;

  insert into public.loan_case_version_items(
    case_version_id,source_item_id,item_type,product_sku,planning_supply_unit_id,serial_snapshot,
    product_name_snapshot,warehouse_snapshot,usage_reading_value,usage_reading_unit,driving_use_limit,
    responsible_person,expected_return_date,serial_verified
  )
  select v_version,i.id,i.item_type,i.product_sku,i.planning_supply_unit_id,i.serial_snapshot,
    i.product_name_snapshot,i.warehouse_snapshot,i.usage_reading_value,i.usage_reading_unit,
    i.driving_use_limit,i.responsible_person,i.expected_return_date,true
  from public.loan_case_items i where i.case_id=p_case_id;

  update public.loan_cases set current_version_number=v_number,
    status=case when v_terms is null then 'DRAFT' else 'AWAITING_ACCEPTANCE' end,
    updated_at=now()
  where id=p_case_id;
  insert into public.loan_case_events(case_id,case_version_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,v_version,'VERSION_CREATED',v_actor,'DRAFT',
    case when v_terms is null then 'DRAFT' else 'AWAITING_ACCEPTANCE' end,
    jsonb_build_object('version_number',v_number,'term_version_id',v_terms,'serial_numbers_confirmed',true));
  return v_number;
end;
$$;
revoke all on function public.loan_create_case_version(uuid,boolean) from public, anon;
grant execute on function public.loan_create_case_version(uuid,boolean) to authenticated;

comment on column public.loan_cases.loan_date is 'Date the physical loan assets are handed over or collected.';
comment on column public.loan_cases.serial_numbers_confirmed_by is 'Authenticated app user who confirmed all selected physical serial numbers.';
comment on column public.loan_case_items.warehouse_snapshot is 'Warehouse location captured when the serialized asset was added to the loan draft.';
