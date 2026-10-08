-- Add business-facing loan references and audited operational editing.
create sequence if not exists public.loan_number_seq
  start with 6601
  increment by 1
  minvalue 6601;

alter table public.loan_cases
  add column if not exists loan_number text;

with numbered as (
  select id, 6600 + row_number() over (order by created_at, id) as number_value
  from public.loan_cases
  where loan_number is null
)
update public.loan_cases c
set loan_number = 'U-' || numbered.number_value::text
from numbered
where c.id = numbered.id;

select setval(
  'public.loan_number_seq',
  case when count(*) = 0 then 6601 else greatest(6601, max(substring(loan_number from 3)::bigint)) end,
  count(*) > 0
)
from public.loan_cases
where loan_number ~ '^U-[0-9]+$';

alter table public.loan_cases
  alter column loan_number set default ('U-' || nextval('public.loan_number_seq')::text),
  alter column loan_number set not null;

create unique index if not exists loan_cases_loan_number_unique
  on public.loan_cases (loan_number);

alter table public.loan_cases
  drop constraint if exists loan_cases_loan_number_format;
alter table public.loan_cases
  add constraint loan_cases_loan_number_format check (loan_number ~ '^U-[0-9]+$');

create or replace function public.loan_number_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.loan_number is distinct from old.loan_number then
    raise exception 'Loan number is immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.loan_number_is_immutable() from public, anon, authenticated;

drop trigger if exists loan_number_immutable on public.loan_cases;
create trigger loan_number_immutable
before update of loan_number on public.loan_cases
for each row execute function public.loan_number_is_immutable();

create or replace function public.loan_record_field_change(
  p_case_id uuid,
  p_event_type text,
  p_field_name text,
  p_old_value text,
  p_new_value text,
  p_note text default null,
  p_case_item_id uuid default null
)
returns void
language sql
set search_path = ''
as $$
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  select p_case_id,p_event_type,public.loan_actor_id(),jsonb_strip_nulls(jsonb_build_object(
    'field',p_field_name,
    'old_value',p_old_value,
    'new_value',p_new_value,
    'note',nullif(btrim(p_note),''),
    'case_item_id',p_case_item_id
  ))
  where public.loan_actor_id() is not null
$$;
revoke all on function public.loan_record_field_change(uuid,text,text,text,text,text,uuid)
  from public, anon, authenticated;

create or replace function public.loan_list_case_overview(p_partner_id uuid default null)
returns table (
  id uuid,
  loan_number text,
  case_number text,
  responsible_user_id uuid,
  responsible_name text,
  dealer_account_id uuid,
  partner_name text,
  dealer_contact_id uuid,
  loan_date date,
  expected_return_date date,
  status text,
  asset_count bigint,
  can_edit_expected_return boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,c.loan_number,c.case_number,c.responsible_user_id,
    coalesce(nullif(btrim(r.display_name),''),nullif(btrim(r.full_name),''),r.email),
    c.dealer_account_id,d.company_name,c.dealer_contact_id,c.loan_date,c.expected_return_date,c.status,
    count(i.id),
    exists (
      select 1 from public.app_users actor
      where actor.auth_user_id=auth.uid() and actor.approved is true and actor.is_active is true
        and actor.portal_role::text in ('timan_backend','timan_seller','timan_service')
        and (actor.portal_role::text='timan_backend' or actor.id=c.responsible_user_id)
    ),
    c.created_at,c.updated_at
  from public.loan_cases c
  join public.app_users r on r.id=c.responsible_user_id
  join public.dealer_accounts d on d.id=c.dealer_account_id
  left join public.loan_case_items i on i.case_id=c.id
  where public.loan_can_view_case(c.id)
    and (p_partner_id is null or c.dealer_account_id=p_partner_id)
  group by c.id,r.id,d.id
  order by c.created_at desc
$$;
revoke all on function public.loan_list_case_overview(uuid) from public, anon;
grant execute on function public.loan_list_case_overview(uuid) to authenticated;

create or replace function public.loan_list_case_history(p_case_id uuid)
returns table (
  id uuid,
  event_type text,
  actor_user_id uuid,
  actor_name text,
  from_status text,
  to_status text,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,e.event_type,e.actor_user_id,
    coalesce(nullif(btrim(a.display_name),''),nullif(btrim(a.full_name),''),a.email),
    e.from_status,e.to_status,e.metadata,e.created_at
  from public.loan_case_events e
  join public.app_users a on a.id=e.actor_user_id
  where e.case_id=p_case_id and public.loan_can_view_case(p_case_id)
  order by e.created_at desc,e.id desc
$$;
revoke all on function public.loan_list_case_history(uuid) from public, anon;
grant execute on function public.loan_list_case_history(uuid) to authenticated;

create or replace function public.loan_update_expected_return(
  p_case_id uuid,
  p_expected_return_date date,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_case public.loan_cases%rowtype;
begin
  select * into v_actor from public.app_users
  where auth_user_id=auth.uid() and approved is true and is_active is true;
  if v_actor.id is null or not public.can_access_loans() then raise exception 'Loan access denied'; end if;

  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.id is null then raise exception 'Loan case not found'; end if;
  if v_actor.portal_role::text <> 'timan_backend' and v_actor.id <> v_case.responsible_user_id then
    raise exception 'Expected return update denied';
  end if;
  if v_case.status in ('CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED') then
    raise exception 'Closed loan cases cannot be changed';
  end if;
  if p_expected_return_date is null then raise exception 'Expected return date is required'; end if;
  if v_case.loan_date is not null and p_expected_return_date < v_case.loan_date then
    raise exception 'Expected return must be on or after loan date';
  end if;
  if nullif(btrim(p_note),'') is null then raise exception 'A change note is required'; end if;
  if p_expected_return_date is not distinct from v_case.expected_return_date then
    raise exception 'Expected return date is unchanged';
  end if;

  update public.loan_cases
  set expected_return_date=p_expected_return_date,updated_at=now()
  where id=p_case_id;
  update public.loan_case_items
  set expected_return_date=p_expected_return_date,updated_at=now()
  where case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'EXPECTED_RETURN_CHANGED',v_actor.id,jsonb_build_object(
    'field','expected_return_date',
    'old_value',v_case.expected_return_date,
    'new_value',p_expected_return_date,
    'note',btrim(p_note)
  ));
end;
$$;
revoke all on function public.loan_update_expected_return(uuid,date,text) from public, anon;
grant execute on function public.loan_update_expected_return(uuid,date,text) to authenticated;

create or replace function public.loan_reopen_for_edit(p_case_id uuid,p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_status text;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.can_administer_loans() then raise exception 'Backend loan administration required'; end if;
  select status into v_status from public.loan_cases where id=p_case_id for update;
  if v_status not in ('READY_FOR_REVIEW','AWAITING_ACCEPTANCE','ACCEPTED') then
    raise exception 'Loan is frozen or already editable';
  end if;
  update public.loan_cases
  set status='DRAFT',serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
  update public.loan_case_items
  set serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,'CASE_REOPENED_FOR_EDIT',v_actor,v_status,'DRAFT',jsonb_strip_nulls(jsonb_build_object('note',nullif(btrim(p_note),''))));
end;
$$;
revoke all on function public.loan_reopen_for_edit(uuid,text) from public, anon;
grant execute on function public.loan_reopen_for_edit(uuid,text) to authenticated;

create or replace function public.loan_update_case_relationships(
  p_case_id uuid,
  p_responsible_user_id uuid,
  p_dealer_account_id uuid,
  p_dealer_contact_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.loan_cases%rowtype;
begin
  if not public.can_administer_loans() then raise exception 'Backend loan administration required'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;
  if not exists (
    select 1 from public.app_users u where u.id=p_responsible_user_id
      and u.approved is true and u.is_active is true and u.portal_role::text in ('timan_backend','timan_seller')
  ) then raise exception 'Invalid responsible seller'; end if;
  if not exists (
    select 1 from public.dealer_accounts d where d.id=p_dealer_account_id
      and d.assigned_seller_id=p_responsible_user_id
      and coalesce(d.is_active,true) is true and coalesce(d.is_deleted,false) is false
  ) then raise exception 'Partner does not belong to seller'; end if;
  if not exists (
    select 1 from public.dealer_contacts c where c.id=p_dealer_contact_id
      and c.dealer_account_id=p_dealer_account_id and nullif(btrim(c.name),'') is not null
  ) then raise exception 'Invalid canonical partner contact'; end if;

  if v_case.responsible_user_id is distinct from p_responsible_user_id then
    perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','responsible_user_id',v_case.responsible_user_id::text,p_responsible_user_id::text);
  end if;
  if v_case.dealer_account_id is distinct from p_dealer_account_id then
    perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','dealer_account_id',v_case.dealer_account_id::text,p_dealer_account_id::text);
  end if;
  if v_case.dealer_contact_id is distinct from p_dealer_contact_id then
    perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','dealer_contact_id',v_case.dealer_contact_id::text,p_dealer_contact_id::text);
  end if;
  update public.loan_cases set
    responsible_user_id=p_responsible_user_id,
    dealer_account_id=p_dealer_account_id,
    dealer_contact_id=p_dealer_contact_id,
    updated_at=now()
  where id=p_case_id;
end;
$$;
revoke all on function public.loan_update_case_relationships(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.loan_update_case_relationships(uuid,uuid,uuid,uuid) to authenticated;

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
declare
  v_case public.loan_cases%rowtype;
  v_notes text:=nullif(btrim(p_notes),'');
  v_address text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_address),'') end;
  v_postal text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_postal_code),'') end;
  v_city text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_city),'') end;
  v_country text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_country),'') end;
  v_contact text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_contact),'') end;
  v_delivery_note text:=case when p_alternative_delivery_address then nullif(btrim(p_delivery_note),'') end;
begin
  if public.loan_actor_id() is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;
  if p_loan_date is not null and p_expected_return_date is not null and p_expected_return_date<p_loan_date then
    raise exception 'Expected return must be on or after loan date';
  end if;

  if v_case.loan_date is distinct from p_loan_date then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','loan_date',v_case.loan_date::text,p_loan_date::text); end if;
  if v_case.expected_return_date is distinct from p_expected_return_date then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','expected_return_date',v_case.expected_return_date::text,p_expected_return_date::text); end if;
  if v_case.notes is distinct from v_notes then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','notes',v_case.notes,v_notes); end if;
  if v_case.alternative_delivery_address is distinct from p_alternative_delivery_address then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','alternative_delivery_address',v_case.alternative_delivery_address::text,p_alternative_delivery_address::text); end if;
  if v_case.delivery_address is distinct from v_address then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_address',v_case.delivery_address,v_address); end if;
  if v_case.delivery_postal_code is distinct from v_postal then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_postal_code',v_case.delivery_postal_code,v_postal); end if;
  if v_case.delivery_city is distinct from v_city then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_city',v_case.delivery_city,v_city); end if;
  if v_case.delivery_country is distinct from v_country then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_country',v_case.delivery_country,v_country); end if;
  if v_case.delivery_contact is distinct from v_contact then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_contact',v_case.delivery_contact,v_contact); end if;
  if v_case.delivery_note is distinct from v_delivery_note then perform public.loan_record_field_change(p_case_id,'CASE_FIELD_CHANGED','delivery_note',v_case.delivery_note,v_delivery_note); end if;

  update public.loan_cases set
    loan_date=p_loan_date,expected_return_date=p_expected_return_date,notes=v_notes,
    alternative_delivery_address=p_alternative_delivery_address,delivery_address=v_address,
    delivery_postal_code=v_postal,delivery_city=v_city,delivery_country=v_country,
    delivery_contact=v_contact,delivery_note=v_delivery_note,
    serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
  update public.loan_case_items set serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where case_id=p_case_id;
end;
$$;
revoke all on function public.loan_update_draft_case(uuid,date,date,text,boolean,text,text,text,text,text,text) from public, anon;
grant execute on function public.loan_update_draft_case(uuid,date,date,text,boolean,text,text,text,text,text,text) to authenticated;

create or replace function public.loan_update_item_usage(
  p_case_id uuid,
  p_case_item_id uuid,
  p_usage_reading_value numeric,
  p_usage_reading_unit text,
  p_driving_use_limit text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_item public.loan_case_items%rowtype;
  v_limit text:=nullif(btrim(p_driving_use_limit),'');
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  perform 1 from public.loan_cases where id=p_case_id and status='DRAFT' for update;
  if not found then raise exception 'Only draft cases can be edited'; end if;
  if p_usage_reading_value is not null and p_usage_reading_value<0 then raise exception 'Invalid usage reading'; end if;
  if (p_usage_reading_value is null)<>(p_usage_reading_unit is null) then raise exception 'Usage reading and unit must be supplied together'; end if;
  if p_usage_reading_unit is not null and p_usage_reading_unit not in ('km','hours') then raise exception 'Invalid usage unit'; end if;
  select * into v_item from public.loan_case_items where id=p_case_item_id and case_id=p_case_id and item_type='machine' for update;
  if v_item.id is null then raise exception 'Machine item is not editable'; end if;

  if v_item.usage_reading_value is distinct from p_usage_reading_value then perform public.loan_record_field_change(p_case_id,'ITEM_FIELD_CHANGED','usage_reading_value',v_item.usage_reading_value::text,p_usage_reading_value::text,null,p_case_item_id); end if;
  if v_item.usage_reading_unit is distinct from p_usage_reading_unit then perform public.loan_record_field_change(p_case_id,'ITEM_FIELD_CHANGED','usage_reading_unit',v_item.usage_reading_unit,p_usage_reading_unit,null,p_case_item_id); end if;
  if v_item.driving_use_limit is distinct from v_limit then perform public.loan_record_field_change(p_case_id,'ITEM_FIELD_CHANGED','driving_use_limit',v_item.driving_use_limit,v_limit,null,p_case_item_id); end if;

  update public.loan_case_items set usage_reading_value=p_usage_reading_value,usage_reading_unit=p_usage_reading_unit,
    driving_use_limit=v_limit,serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where id=p_case_item_id;
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
end;
$$;
revoke all on function public.loan_update_item_usage(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.loan_update_item_usage(uuid,uuid,numeric,text,text) to authenticated;

comment on column public.loan_cases.loan_number is
  'Immutable business-facing loan reference allocated atomically from U-6601.';
