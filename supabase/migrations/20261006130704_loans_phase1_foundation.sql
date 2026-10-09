-- Loans Phase 1. Additive only: no existing user or Planning unit is enabled.
alter table public.planning_supply_units
  add column if not exists timan_owned boolean,
  add column if not exists loan_eligible boolean not null default false;

create sequence if not exists public.loan_case_number_seq;

create table if not exists public.loan_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  responsible_user_id uuid not null references public.app_users(id),
  dealer_account_id uuid not null references public.dealer_accounts(id),
  dealer_contact_id uuid not null references public.dealer_contacts(id),
  created_by uuid not null references public.app_users(id),
  language_code text not null default 'da' check (language_code in ('da','en','de','it','hu','sv','fr','pl','cs')),
  expected_return_date date,
  status text not null default 'DRAFT' check (status in (
    'DRAFT','AWAITING_ACCEPTANCE','ACCEPTED','ON_LOAN','RETURN_INSPECTION',
    'CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED'
  )),
  alternative_delivery_address boolean not null default false,
  delivery_address text,
  delivery_postal_code text,
  delivery_city text,
  delivery_country text,
  delivery_contact text,
  delivery_note text,
  notes text,
  current_version_number integer not null default 0 check (current_version_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists loan_cases_responsible_idx on public.loan_cases (responsible_user_id, created_at desc);
create index if not exists loan_cases_dealer_idx on public.loan_cases (dealer_account_id, created_at desc);

create table if not exists public.loan_case_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id) on delete cascade,
  item_type text not null check (item_type in ('machine','equipment')),
  product_sku text not null,
  planning_supply_unit_id uuid references public.planning_supply_units(id),
  usage_reading_value numeric check (usage_reading_value is null or usage_reading_value >= 0),
  usage_reading_unit text check (usage_reading_unit is null or usage_reading_unit in ('km','hours')),
  driving_use_limit text,
  responsible_person text,
  expected_return_date date,
  serial_verified boolean not null default false,
  serial_verified_by uuid references public.app_users(id),
  serial_verified_at timestamptz,
  serial_snapshot text,
  product_name_snapshot text,
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((item_type = 'machine' and planning_supply_unit_id is not null) or item_type = 'equipment')
);
create index if not exists loan_case_items_case_idx on public.loan_case_items (case_id, created_at);

create table if not exists public.loan_asset_allocations (
  id uuid primary key default gen_random_uuid(),
  case_item_id uuid not null references public.loan_case_items(id) on delete cascade,
  supply_unit_id uuid not null references public.planning_supply_units(id),
  allocation_status text not null default 'active' check (allocation_status in ('active','released')),
  allocated_by uuid not null references public.app_users(id),
  allocated_at timestamptz not null default now(),
  released_by uuid references public.app_users(id),
  released_at timestamptz,
  release_reason text
);
create unique index if not exists loan_asset_allocations_unit_active_unique
  on public.loan_asset_allocations (supply_unit_id) where allocation_status = 'active';
create unique index if not exists loan_asset_allocations_item_active_unique
  on public.loan_asset_allocations (case_item_id) where allocation_status = 'active';

create table if not exists public.loan_term_versions (
  id uuid primary key default gen_random_uuid(),
  version_number integer not null unique check (version_number > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','ARCHIVED')),
  created_by uuid not null references public.app_users(id),
  approved_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.loan_term_translations (
  id uuid primary key default gen_random_uuid(),
  term_version_id uuid not null references public.loan_term_versions(id) on delete cascade,
  language_code text not null check (language_code in ('da','en','de','it','hu','sv','fr','pl','cs')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (term_version_id, language_code)
);

create table if not exists public.loan_case_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  version_number integer not null check (version_number > 0),
  status_snapshot text not null,
  responsible_user_id uuid not null,
  dealer_account_id uuid not null,
  dealer_contact_id uuid not null,
  language_code text not null,
  expected_return_date date,
  alternative_delivery_address boolean not null,
  delivery_address text,
  delivery_postal_code text,
  delivery_city text,
  delivery_country text,
  delivery_contact text,
  delivery_note text,
  notes text,
  term_version_id uuid references public.loan_term_versions(id),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (case_id, version_number)
);

create table if not exists public.loan_case_version_items (
  id uuid primary key default gen_random_uuid(),
  case_version_id uuid not null references public.loan_case_versions(id) on delete cascade,
  source_item_id uuid not null,
  item_type text not null,
  product_sku text not null,
  planning_supply_unit_id uuid,
  serial_snapshot text,
  product_name_snapshot text,
  usage_reading_value numeric,
  usage_reading_unit text,
  driving_use_limit text,
  responsible_person text,
  expected_return_date date,
  serial_verified boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_acceptances (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  case_version_id uuid not null references public.loan_case_versions(id),
  accepted_by uuid not null references public.app_users(id),
  acceptance_state text not null check (acceptance_state in ('ACCEPTED','DECLINED')),
  accepted_at timestamptz not null default now(),
  unique (case_version_id, accepted_by)
);

create table if not exists public.loan_return_inspections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  inspected_by uuid not null references public.app_users(id),
  inspection_status text not null default 'DRAFT' check (inspection_status in ('DRAFT','COMPLETED')),
  notes text,
  inspected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_return_item_inspections (
  id uuid primary key default gen_random_uuid(),
  return_inspection_id uuid not null references public.loan_return_inspections(id) on delete cascade,
  case_item_id uuid not null references public.loan_case_items(id),
  usage_reading_value numeric check (usage_reading_value is null or usage_reading_value >= 0),
  condition_state text,
  notes text,
  created_at timestamptz not null default now(),
  unique (return_inspection_id, case_item_id)
);

create table if not exists public.loan_deviations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  case_item_id uuid references public.loan_case_items(id),
  deviation_type text not null,
  description text not null,
  resolution_state text not null default 'OPEN' check (resolution_state in ('OPEN','RESOLVED','ACCEPTED')),
  created_by uuid not null references public.app_users(id),
  resolved_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.loan_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  case_version_id uuid references public.loan_case_versions(id),
  event_type text not null,
  actor_user_id uuid not null references public.app_users(id),
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists loan_case_events_case_idx on public.loan_case_events (case_id, created_at desc);

create table if not exists public.loan_case_item_photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id),
  case_item_id uuid not null references public.loan_case_items(id) on delete cascade,
  storage_path text not null unique,
  photo_kind text not null check (photo_kind in ('serial_plate','overview')),
  file_name text not null,
  content_type text,
  uploaded_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  unique (case_item_id, photo_kind)
);

create or replace function public.loan_actor_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.app_users u
  where auth.uid() is not null and u.auth_user_id = auth.uid()
    and u.approved is true and u.is_active is true
  limit 1
$$;
revoke all on function public.loan_actor_id() from public, anon;
grant execute on function public.loan_actor_id() to authenticated;

create or replace function public.can_access_loans()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_users u
    where auth.uid() is not null and u.auth_user_id = auth.uid()
      and u.approved is true and u.is_active is true
      and u.portal_role::text in ('timan_backend','timan_seller','timan_service','timan_dealer','timan_service_partner')
      and 'loans' = any(coalesce(u.allowed_areas, array[]::text[]))
  )
$$;
revoke all on function public.can_access_loans() from public, anon;
grant execute on function public.can_access_loans() to authenticated;

create or replace function public.can_administer_loans()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_users u
    where u.auth_user_id = auth.uid() and u.approved is true and u.is_active is true
      and u.portal_role::text = 'timan_backend'
      and 'loans' = any(coalesce(u.allowed_areas, array[]::text[]))
  )
$$;
revoke all on function public.can_administer_loans() from public, anon;
grant execute on function public.can_administer_loans() to authenticated;

create or replace function public.loan_can_view_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c
    join public.app_users u on u.auth_user_id = auth.uid()
    join public.dealer_accounts d on d.id = c.dealer_account_id
    where c.id = p_case_id and (
      u.portal_role::text = 'timan_backend'
      or (u.portal_role::text in ('timan_seller','timan_service') and (c.responsible_user_id = u.id or c.created_by = u.id))
      or (u.portal_role::text in ('timan_dealer','timan_service_partner')
          and nullif(btrim(u.dealer_number), '') in (nullif(btrim(d.account_number), ''), nullif(btrim(d.dealer_number), '')))
    )
  )
$$;
revoke all on function public.loan_can_view_case(uuid) from public, anon;
grant execute on function public.loan_can_view_case(uuid) to authenticated;

create or replace function public.loan_can_manage_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c join public.app_users u on u.auth_user_id = auth.uid()
    where c.id = p_case_id and (
      u.portal_role::text = 'timan_backend'
      or (u.portal_role::text in ('timan_seller','timan_service') and (c.responsible_user_id = u.id or c.created_by = u.id))
    )
  )
$$;
revoke all on function public.loan_can_manage_case(uuid) from public, anon;
grant execute on function public.loan_can_manage_case(uuid) to authenticated;

create or replace function public.loan_can_accept_case(p_case_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.loan_cases c
    join public.app_users u on u.auth_user_id = auth.uid()
    join public.dealer_accounts d on d.id = c.dealer_account_id
    where c.id = p_case_id and (
      (u.portal_role::text in ('timan_backend','timan_seller','timan_service')
        and (u.portal_role::text = 'timan_backend' or c.responsible_user_id = u.id or c.created_by = u.id))
      or (u.portal_role::text in ('timan_dealer','timan_service_partner')
        and nullif(btrim(u.dealer_number), '') in (nullif(btrim(d.account_number), ''), nullif(btrim(d.dealer_number), '')))
    )
  )
$$;
revoke all on function public.loan_can_accept_case(uuid) from public, anon;
grant execute on function public.loan_can_accept_case(uuid) to authenticated;

create or replace function public.loan_list_sellers()
returns table (id uuid, display_name text, initials text)
language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(nullif(btrim(u.display_name), ''), nullif(btrim(u.full_name), ''), u.email), u.initials
  from public.app_users u
  where public.can_access_loans()
    and exists (select 1 from public.app_users a where a.auth_user_id = auth.uid() and a.portal_role::text in ('timan_backend','timan_seller','timan_service'))
    and u.approved is true and u.is_active is true and u.portal_role::text in ('timan_backend','timan_seller')
  order by coalesce(nullif(btrim(u.display_name), ''), nullif(btrim(u.full_name), ''), u.email)
$$;
revoke all on function public.loan_list_sellers() from public, anon;
grant execute on function public.loan_list_sellers() to authenticated;

create or replace function public.loan_list_partners_for_seller(p_seller_id uuid)
returns table (id uuid, account_number text, company_name text, customer_type text)
language sql stable security definer set search_path = '' as $$
  select d.id, d.account_number, d.company_name, d.customer_type
  from public.dealer_accounts d
  where public.can_access_loans()
    and exists (select 1 from public.app_users a where a.auth_user_id = auth.uid() and a.portal_role::text in ('timan_backend','timan_seller','timan_service'))
    and d.assigned_seller_id = p_seller_id
    and coalesce(d.is_active, true) is true and coalesce(d.is_deleted, false) is false and coalesce(d.is_blocked, false) is false
  order by d.company_name
$$;
revoke all on function public.loan_list_partners_for_seller(uuid) from public, anon;
grant execute on function public.loan_list_partners_for_seller(uuid) to authenticated;

create or replace function public.loan_list_partner_contacts(p_dealer_account_id uuid)
returns table (id uuid, name text, role_title text, email text, phone text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.role_title, c.email, c.phone
  from public.dealer_contacts c
  where public.can_access_loans() and c.dealer_account_id = p_dealer_account_id
    and nullif(btrim(c.name), '') is not null
    and (
      exists (select 1 from public.app_users a where a.auth_user_id = auth.uid() and a.portal_role::text in ('timan_backend','timan_seller','timan_service'))
      or exists (
        select 1 from public.app_users a join public.dealer_accounts d on d.id = p_dealer_account_id
        where a.auth_user_id = auth.uid() and a.portal_role::text in ('timan_dealer','timan_service_partner')
          and nullif(btrim(a.dealer_number), '') in (nullif(btrim(d.account_number), ''), nullif(btrim(d.dealer_number), ''))
      )
    )
  order by coalesce(c.is_primary, false) desc, c.name
$$;
revoke all on function public.loan_list_partner_contacts(uuid) from public, anon;
grant execute on function public.loan_list_partner_contacts(uuid) to authenticated;

create or replace function public.loan_list_eligible_machines()
returns table (id uuid, sku text, product_name text, serial_number text, machine_ident_number text, warehouse_location text, supply_status text)
language sql stable security definer set search_path = '' as $$
  select u.id, u.item_number, null::text, u.serial_number, u.machine_ident_number, u.warehouse_location, u.supply_status
  from public.planning_supply_units u
  where public.can_access_loans()
    and exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.portal_role::text in ('timan_backend','timan_seller','timan_service')
    )
    and u.timan_owned is true and u.loan_eligible is true
    and nullif(btrim(u.serial_number), '') is not null
    and u.supply_status not in ('blocked','unavailable')
    and not exists (select 1 from public.planning_reservations r where r.supply_unit_id = u.id and r.status = 'active')
    and not exists (select 1 from public.loan_asset_allocations a where a.supply_unit_id = u.id and a.allocation_status = 'active')
  order by u.item_number, u.serial_number
$$;
revoke all on function public.loan_list_eligible_machines() from public, anon;
grant execute on function public.loan_list_eligible_machines() to authenticated;

create or replace function public.loan_create_case(
  p_responsible_user_id uuid, p_dealer_account_id uuid, p_dealer_contact_id uuid,
  p_expected_return_date date default null, p_notes text default null,
  p_alternative_delivery_address boolean default false, p_delivery_address text default null,
  p_delivery_postal_code text default null, p_delivery_city text default null, p_delivery_country text default null,
  p_delivery_contact text default null, p_delivery_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_case uuid; v_language text;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.can_access_loans() then raise exception 'Loan access denied'; end if;
  if not exists (
    select 1 from public.app_users a
    where a.id = v_actor and a.portal_role::text in ('timan_backend','timan_seller','timan_service')
  ) then raise exception 'Loan case creation denied'; end if;
  if not exists (select 1 from public.app_users u where u.id = p_responsible_user_id and u.approved is true and u.is_active is true and u.portal_role::text in ('timan_backend','timan_seller')) then raise exception 'Invalid responsible seller'; end if;
  if not exists (select 1 from public.dealer_accounts d where d.id = p_dealer_account_id and d.assigned_seller_id = p_responsible_user_id and coalesce(d.is_active,true) is true and coalesce(d.is_deleted,false) is false) then raise exception 'Partner does not belong to seller'; end if;
  if not exists (select 1 from public.dealer_contacts c where c.id = p_dealer_contact_id and c.dealer_account_id = p_dealer_account_id and nullif(btrim(c.name),'') is not null) then raise exception 'Invalid canonical partner contact'; end if;
  select case when lower(coalesce(u.preferred_language, 'da')) in ('da','en','de','it','hu','sv','fr','pl','cs') then lower(u.preferred_language) else 'da' end into v_language from public.app_users u where u.id = v_actor;
  insert into public.loan_cases (case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by,language_code,expected_return_date,notes,alternative_delivery_address,delivery_address,delivery_postal_code,delivery_city,delivery_country,delivery_contact,delivery_note)
  values ('LN-' || lpad(nextval('public.loan_case_number_seq')::text, 6, '0'),p_responsible_user_id,p_dealer_account_id,p_dealer_contact_id,v_actor,v_language,p_expected_return_date,nullif(btrim(p_notes),''),p_alternative_delivery_address,case when p_alternative_delivery_address then nullif(btrim(p_delivery_address),'') end,case when p_alternative_delivery_address then nullif(btrim(p_delivery_postal_code),'') end,case when p_alternative_delivery_address then nullif(btrim(p_delivery_city),'') end,case when p_alternative_delivery_address then nullif(btrim(p_delivery_country),'') end,case when p_alternative_delivery_address then nullif(btrim(p_delivery_contact),'') end,case when p_alternative_delivery_address then nullif(btrim(p_delivery_note),'') end)
  returning id into v_case;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,to_status) values(v_case,'CASE_CREATED',v_actor,'DRAFT');
  return v_case;
end $$;
revoke all on function public.loan_create_case(uuid,uuid,uuid,date,text,boolean,text,text,text,text,text,text) from public, anon;
grant execute on function public.loan_create_case(uuid,uuid,uuid,date,text,boolean,text,text,text,text,text,text) to authenticated;

create or replace function public.loan_add_machine_item(
  p_case_id uuid, p_supply_unit_id uuid, p_usage_reading_value numeric default null,
  p_usage_reading_unit text default null, p_driving_use_limit text default null,
  p_responsible_person text default null, p_expected_return_date date default null,
  p_serial_verified boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_item uuid; v_unit public.planning_supply_units%rowtype;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  if not exists (select 1 from public.loan_cases c where c.id = p_case_id and c.status = 'DRAFT') then raise exception 'Only draft cases can be edited'; end if;
  if not p_serial_verified then raise exception 'Serial verification is required'; end if;
  select * into v_unit from public.planning_supply_units u where u.id = p_supply_unit_id for update;
  if v_unit.id is null or v_unit.timan_owned is not true or v_unit.loan_eligible is not true or nullif(btrim(v_unit.serial_number),'') is null or v_unit.supply_status in ('blocked','unavailable') then raise exception 'Machine is not loan eligible'; end if;
  if exists (select 1 from public.planning_reservations r where r.supply_unit_id = p_supply_unit_id and r.status = 'active') or exists (select 1 from public.loan_asset_allocations a where a.supply_unit_id = p_supply_unit_id and a.allocation_status = 'active') then raise exception 'Machine is already allocated'; end if;
  insert into public.loan_case_items(case_id,item_type,product_sku,planning_supply_unit_id,usage_reading_value,usage_reading_unit,driving_use_limit,responsible_person,expected_return_date,serial_verified,serial_verified_by,serial_verified_at,serial_snapshot,created_by)
  values(p_case_id,'machine',v_unit.item_number,p_supply_unit_id,p_usage_reading_value,case when p_usage_reading_value is null then null else p_usage_reading_unit end,nullif(btrim(p_driving_use_limit),''),nullif(btrim(p_responsible_person),''),p_expected_return_date,true,v_actor,now(),v_unit.serial_number,v_actor)
  returning id into v_item;
  insert into public.loan_asset_allocations(case_item_id,supply_unit_id,allocated_by) values(v_item,p_supply_unit_id,v_actor);
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata) values(p_case_id,'MACHINE_ADDED',v_actor,jsonb_build_object('case_item_id',v_item,'supply_unit_id',p_supply_unit_id));
  return v_item;
end $$;
revoke all on function public.loan_add_machine_item(uuid,uuid,numeric,text,text,text,date,boolean) from public, anon;
grant execute on function public.loan_add_machine_item(uuid,uuid,numeric,text,text,text,date,boolean) to authenticated;

create or replace function public.loan_create_case_version(p_case_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_case public.loan_cases%rowtype; v_number integer; v_version uuid; v_terms uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id = p_case_id for update;
  if v_case.status <> 'DRAFT' then raise exception 'Only draft cases can be versioned'; end if;
  if not exists (select 1 from public.loan_case_items where case_id = p_case_id) then raise exception 'At least one item is required'; end if;
  if exists (
    select 1 from public.loan_case_items i
    where i.case_id = p_case_id and not exists (
      select 1 from public.loan_case_item_photos p where p.case_item_id = i.id and p.photo_kind = 'serial_plate'
    )
  ) then raise exception 'A serial plate photo is required for every item'; end if;
  v_number := v_case.current_version_number + 1;
  select t.id into v_terms from public.loan_term_versions t join public.loan_term_translations x on x.term_version_id=t.id and x.language_code=v_case.language_code where t.status='APPROVED' order by t.version_number desc limit 1;
  insert into public.loan_case_versions(case_id,version_number,status_snapshot,responsible_user_id,dealer_account_id,dealer_contact_id,language_code,expected_return_date,alternative_delivery_address,delivery_address,delivery_postal_code,delivery_city,delivery_country,delivery_contact,delivery_note,notes,term_version_id,created_by)
  values(v_case.id,v_number,v_case.status,v_case.responsible_user_id,v_case.dealer_account_id,v_case.dealer_contact_id,v_case.language_code,v_case.expected_return_date,v_case.alternative_delivery_address,v_case.delivery_address,v_case.delivery_postal_code,v_case.delivery_city,v_case.delivery_country,v_case.delivery_contact,v_case.delivery_note,v_case.notes,v_terms,v_actor)
  returning id into v_version;
  insert into public.loan_case_version_items(case_version_id,source_item_id,item_type,product_sku,planning_supply_unit_id,serial_snapshot,product_name_snapshot,usage_reading_value,usage_reading_unit,driving_use_limit,responsible_person,expected_return_date,serial_verified)
  select v_version,i.id,i.item_type,i.product_sku,i.planning_supply_unit_id,i.serial_snapshot,i.product_name_snapshot,i.usage_reading_value,i.usage_reading_unit,i.driving_use_limit,i.responsible_person,i.expected_return_date,i.serial_verified from public.loan_case_items i where i.case_id=p_case_id;
  update public.loan_cases set current_version_number=v_number, status=case when v_terms is null then 'DRAFT' else 'AWAITING_ACCEPTANCE' end, updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,case_version_id,event_type,actor_user_id,from_status,to_status,metadata) values(p_case_id,v_version,'VERSION_CREATED',v_actor,'DRAFT',case when v_terms is null then 'DRAFT' else 'AWAITING_ACCEPTANCE' end,jsonb_build_object('version_number',v_number,'term_version_id',v_terms));
  return v_number;
end $$;
revoke all on function public.loan_create_case_version(uuid) from public, anon;
grant execute on function public.loan_create_case_version(uuid) to authenticated;

create or replace function public.loan_accept_case_version(p_case_id uuid, p_case_version_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_acceptance uuid; v_state text; v_version_number integer;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_accept_case(p_case_id) then raise exception 'Loan acceptance denied'; end if;
  select v.version_number into v_version_number from public.loan_case_versions v
  join public.loan_cases c on c.id=v.case_id
  where v.id=p_case_version_id and v.case_id=p_case_id and v.term_version_id is not null
    and c.status='AWAITING_ACCEPTANCE' and c.current_version_number=v.version_number;
  if v_version_number is null then raise exception 'Current approved terms and version are required'; end if;
  v_state := case when p_accept then 'ACCEPTED' else 'DECLINED' end;
  insert into public.loan_acceptances(case_id,case_version_id,accepted_by,acceptance_state)
  values(p_case_id,p_case_version_id,v_actor,v_state) returning id into v_acceptance;
  if p_accept then update public.loan_cases set status='ACCEPTED',updated_at=now() where id=p_case_id; end if;
  insert into public.loan_case_events(case_id,case_version_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,p_case_version_id,'VERSION_' || v_state,v_actor,'AWAITING_ACCEPTANCE',case when p_accept then 'ACCEPTED' else 'AWAITING_ACCEPTANCE' end,jsonb_build_object('version_number',v_version_number));
  return v_acceptance;
end $$;
revoke all on function public.loan_accept_case_version(uuid,uuid,boolean) from public, anon;
grant execute on function public.loan_accept_case_version(uuid,uuid,boolean) to authenticated;

create or replace function public.loan_register_item_photo(p_case_id uuid,p_case_item_id uuid,p_storage_path text,p_photo_kind text,p_file_name text,p_content_type text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan photo access denied'; end if;
  if not exists(select 1 from public.loan_case_items i where i.id=p_case_item_id and i.case_id=p_case_id) then raise exception 'Invalid loan item'; end if;
  if p_storage_path not like p_case_id::text || '/%' then raise exception 'Invalid storage path'; end if;
  if (select count(*) from public.loan_case_item_photos p where p.case_item_id=p_case_item_id) >= 2 then raise exception 'Maximum two photos per loan item'; end if;
  insert into public.loan_case_item_photos(case_id,case_item_id,storage_path,photo_kind,file_name,content_type,uploaded_by)
  values(p_case_id,p_case_item_id,p_storage_path,p_photo_kind,p_file_name,p_content_type,v_actor) returning id into v_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata) values(p_case_id,'PHOTO_ADDED',v_actor,jsonb_build_object('case_item_id',p_case_item_id,'photo_kind',p_photo_kind));
  return v_id;
end $$;
revoke all on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) to authenticated;

do $$ declare t text; begin
  foreach t in array array['loan_cases','loan_case_items','loan_asset_allocations','loan_case_versions','loan_case_version_items','loan_term_versions','loan_term_translations','loan_acceptances','loan_return_inspections','loan_return_item_inspections','loan_deviations','loan_case_events','loan_case_item_photos'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy loan_cases_read on public.loan_cases for select to authenticated using (public.loan_can_view_case(id));
create policy loan_items_read on public.loan_case_items for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_allocations_read on public.loan_asset_allocations for select to authenticated using (exists(select 1 from public.loan_case_items i where i.id=case_item_id and public.loan_can_view_case(i.case_id)));
create policy loan_versions_read on public.loan_case_versions for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_version_items_read on public.loan_case_version_items for select to authenticated using (exists(select 1 from public.loan_case_versions v where v.id=case_version_id and public.loan_can_view_case(v.case_id)));
create policy loan_terms_read on public.loan_term_versions for select to authenticated using (public.can_access_loans() and status='APPROVED');
create policy loan_term_translations_read on public.loan_term_translations for select to authenticated using (public.can_access_loans() and exists(select 1 from public.loan_term_versions v where v.id=term_version_id and v.status='APPROVED'));
create policy loan_acceptances_read on public.loan_acceptances for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_return_inspections_read on public.loan_return_inspections for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_return_item_inspections_read on public.loan_return_item_inspections for select to authenticated using (exists(select 1 from public.loan_return_inspections r where r.id=return_inspection_id and public.loan_can_view_case(r.case_id)));
create policy loan_deviations_read on public.loan_deviations for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_events_read on public.loan_case_events for select to authenticated using (public.loan_can_view_case(case_id));
create policy loan_photos_read on public.loan_case_item_photos for select to authenticated using (public.loan_can_view_case(case_id));

grant select on public.loan_cases, public.loan_case_items, public.loan_asset_allocations, public.loan_case_versions,
  public.loan_case_version_items, public.loan_term_versions, public.loan_term_translations, public.loan_acceptances,
  public.loan_return_inspections, public.loan_return_item_inspections, public.loan_deviations,
  public.loan_case_events, public.loan_case_item_photos to authenticated;
revoke insert, update, delete, truncate on public.loan_case_versions, public.loan_case_version_items, public.loan_case_events from authenticated, anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('loan-case-media','loan-case-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.loan_storage_case_id(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin return ((storage.foldername(p_name))[1])::uuid; exception when others then return null; end $$;
revoke all on function public.loan_storage_case_id(text) from public, anon;
grant execute on function public.loan_storage_case_id(text) to authenticated;

create policy loan_media_select on storage.objects for select to authenticated
using (bucket_id='loan-case-media' and public.loan_can_view_case(public.loan_storage_case_id(name)));
create policy loan_media_insert on storage.objects for insert to authenticated
with check (bucket_id='loan-case-media' and public.loan_can_manage_case(public.loan_storage_case_id(name)));
create policy loan_media_delete on storage.objects for delete to authenticated
using (bucket_id='loan-case-media' and public.loan_can_manage_case(public.loan_storage_case_id(name)));

comment on column public.planning_supply_units.timan_owned is 'Explicit business evidence that Timan owns this physical unit. NULL means unclassified.';
comment on column public.planning_supply_units.loan_eligible is 'Explicit loan eligibility. Existing units remain false until reviewed.';
comment on table public.loan_case_events is 'Append-only loan audit events; authenticated clients receive SELECT only.';
