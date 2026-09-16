-- Canonical performed-service model (Model C).
--
-- Warranty registrations remain the machine registry.  A service record is
-- final when saved: it is not a warranty-like submission or approval flow.
-- The single write RPC validates the effective user's dealer scope and writes
-- the service event, optional user change and every part in one transaction.

create table if not exists public.service_registrations (
  id uuid primary key default gen_random_uuid(),
  machine_registration_id uuid references public.warranty_registrations(id) on delete set null,
  normalized_serial text not null,
  serial_number text not null,
  machine_type text not null,
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete restrict,
  dealer_account_number text not null,
  dealer_name_snapshot text not null,
  customer_name text,
  customer_email text,
  service_date date not null,
  operating_hours integer not null check (operating_hours >= 0),
  service_interval_hours integer not null check (service_interval_hours >= 0),
  service_plan_completed boolean not null default true,
  technician_name text not null,
  notes text,
  faults_found text,
  spare_parts_used text,
  attachment_urls text[] not null default '{}'::text[],
  total_servicekit_price numeric not null default 0 check (total_servicekit_price >= 0),
  total_extra_parts_price numeric not null default 0 check (total_extra_parts_price >= 0),
  total_price numeric not null default 0 check (total_price >= 0),
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_registrations_normalized_serial_not_empty check (length(btrim(normalized_serial)) > 0)
);

create table if not exists public.service_registration_parts (
  id uuid primary key default gen_random_uuid(),
  service_registration_id uuid not null references public.service_registrations(id) on delete cascade,
  source_type text not null check (source_type in ('servicekit', 'extra')),
  item_number text,
  description text,
  unit_price numeric not null default 0 check (unit_price >= 0),
  quantity numeric not null check (quantity > 0),
  line_total numeric not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  constraint service_registration_parts_identity check (
    nullif(btrim(coalesce(item_number, '')), '') is not null
    or nullif(btrim(coalesce(description, '')), '') is not null
  )
);

-- This is intentionally a user-history table, not another machine registry.
-- Warranty customer data remains untouched; the active row is the current
-- machine user after an explicit service-time user change.
create table if not exists public.machine_service_user_history (
  id uuid primary key default gen_random_uuid(),
  machine_registration_id uuid references public.warranty_registrations(id) on delete set null,
  normalized_serial text not null,
  serial_number text not null,
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete restrict,
  user_name text not null,
  user_email text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  source_service_registration_id uuid references public.service_registrations(id) on delete set null,
  changed_by_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint machine_service_user_history_serial_not_empty check (length(btrim(normalized_serial)) > 0),
  constraint machine_service_user_history_date_order check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists machine_service_user_history_one_current_idx
  on public.machine_service_user_history(normalized_serial)
  where ended_at is null;
create index if not exists service_registrations_scope_date_idx
  on public.service_registrations(dealer_account_id, service_date desc, created_at desc);
create index if not exists service_registrations_serial_idx
  on public.service_registrations(normalized_serial, service_date desc);
create index if not exists service_registration_parts_registration_idx
  on public.service_registration_parts(service_registration_id);
create index if not exists machine_service_user_history_scope_idx
  on public.machine_service_user_history(dealer_account_id, normalized_serial, started_at desc);

create or replace function public.set_updated_at_service_registrations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_service_registrations_updated_at on public.service_registrations;
create trigger trg_service_registrations_updated_at
before update on public.service_registrations
for each row execute function public.set_updated_at_service_registrations();

-- Matches the existing Warranty/Machine Journal scope and adds explicit
-- service-partner links plus collaboration-manager accounts.
create or replace function public.service_visible_dealer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select au.*
    from public.app_users au
    where coalesce(au.is_active, false)
      and coalesce(au.approved, false)
      and (au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
    limit 1
  )
  select public.warranty_visible_dealer_ids()

  union

  select scoped.id
  from public.resolve_collaboration_manager_accounts() scoped
  join me on me.organization_access_role = 'collaboration_manager'

  union

  select relation.target_account_id
  from public.partner_account_relations relation
  join public.dealer_accounts service_partner on service_partner.id = relation.source_account_id
  join me on lower(trim(service_partner.account_number)) = lower(trim(me.dealer_number))
  where me.portal_role::text = 'timan_service_partner'
    and relation.relation_type = 'service_partner_has_dealer'
    and relation.active = true;
$$;
revoke all on function public.service_visible_dealer_ids() from public;
revoke execute on function public.service_visible_dealer_ids() from anon;
grant execute on function public.service_visible_dealer_ids() to authenticated;

create or replace function public.service_is_global_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_timan_global_warranty();
$$;
revoke all on function public.service_is_global_actor() from public;
revoke execute on function public.service_is_global_actor() from anon;
grant execute on function public.service_is_global_actor() to authenticated;

alter table public.service_registrations enable row level security;
alter table public.service_registration_parts enable row level security;
alter table public.machine_service_user_history enable row level security;

drop policy if exists service_registrations_select_scoped on public.service_registrations;
create policy service_registrations_select_scoped
on public.service_registrations for select to authenticated
using (
  public.service_is_global_actor()
  or dealer_account_id in (select public.service_visible_dealer_ids())
);

drop policy if exists service_registration_parts_select_scoped on public.service_registration_parts;
create policy service_registration_parts_select_scoped
on public.service_registration_parts for select to authenticated
using (
  exists (
    select 1 from public.service_registrations registration
    where registration.id = service_registration_parts.service_registration_id
      and (
        public.service_is_global_actor()
        or registration.dealer_account_id in (select public.service_visible_dealer_ids())
      )
  )
);

drop policy if exists machine_service_user_history_select_scoped on public.machine_service_user_history;
create policy machine_service_user_history_select_scoped
on public.machine_service_user_history for select to authenticated
using (
  public.service_is_global_actor()
  or dealer_account_id in (select public.service_visible_dealer_ids())
);

grant select on public.service_registrations, public.service_registration_parts, public.machine_service_user_history to authenticated;
grant all on public.service_registrations, public.service_registration_parts, public.machine_service_user_history to service_role;

create or replace function public.list_scoped_service_dealers()
returns table (
  id uuid,
  account_number text,
  company_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select da.id, da.account_number, da.company_name
  from public.dealer_accounts da
  where coalesce(da.is_active, true)
    and not coalesce(da.is_deleted, false)
    and not coalesce(da.is_blocked, false)
    and (
      public.service_is_global_actor()
      or da.id in (select public.service_visible_dealer_ids())
    )
  order by da.company_name, da.account_number;
$$;
revoke all on function public.list_scoped_service_dealers() from public;
revoke execute on function public.list_scoped_service_dealers() from anon;
grant execute on function public.list_scoped_service_dealers() to authenticated;

-- Autocomplete deliberately returns only records already inside the caller's
-- service scope. A non-visible exact serial behaves as no match, preventing
-- customer/dealer/model leakage.
create or replace function public.search_scoped_service_machines(
  p_query text,
  p_dealer_account_number text default null
)
returns table (
  machine_registration_id uuid,
  serial_number text,
  normalized_serial text,
  machine_model text,
  customer_name text,
  customer_email text,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_warranties as (
    select wr.*
    from public.warranty_registrations wr
    where wr.is_active_in_source
      and wr.dealer_account_id is not null
      and (
        public.service_is_global_actor()
        or wr.dealer_account_id in (select public.service_visible_dealer_ids())
      )
      and (
        nullif(btrim(coalesce(p_dealer_account_number, '')), '') is null
        or lower(trim(wr.dealer_account_number)) = lower(trim(p_dealer_account_number))
      )
  ), current_users as (
    select distinct on (normalized_serial)
      normalized_serial, user_name, user_email
    from public.machine_service_user_history
    where ended_at is null
    order by normalized_serial, started_at desc
  )
  select
    wr.id,
    wr.machine_serial_number,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    wr.machine_model,
    coalesce(current_users.user_name, wr.customer_name),
    coalesce(current_users.user_email, wr.customer_email),
    wr.dealer_account_id,
    wr.dealer_account_number,
    wr.dealer_name_snapshot
  from scoped_warranties wr
  left join current_users
    on current_users.normalized_serial = upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
  where nullif(btrim(coalesce(p_query, '')), '') is not null
    and (
      upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
        like '%' || upper(regexp_replace(p_query, '[^A-Za-z0-9]+', '', 'g')) || '%'
      or lower(coalesce(wr.machine_model, '')) like '%' || lower(btrim(p_query)) || '%'
    )
  order by wr.machine_serial_number
  limit 20;
$$;
revoke all on function public.search_scoped_service_machines(text, text) from public;
revoke execute on function public.search_scoped_service_machines(text, text) from anon;
grant execute on function public.search_scoped_service_machines(text, text) to authenticated;

create or replace function public.list_scoped_service_machines(
  p_dealer_account_number text default null,
  p_machine_type text default null,
  p_query text default null
)
returns table (
  machine_registration_id uuid,
  serial_number text,
  normalized_serial text,
  machine_model text,
  customer_name text,
  customer_email text,
  dealer_account_id uuid,
  dealer_account_number text,
  dealer_name text,
  latest_service_date date,
  current_hours integer
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_warranties as (
    select wr.*
    from public.warranty_registrations wr
    where wr.is_active_in_source
      and wr.dealer_account_id is not null
      and (
        public.service_is_global_actor()
        or wr.dealer_account_id in (select public.service_visible_dealer_ids())
      )
      and (
        nullif(btrim(coalesce(p_dealer_account_number, '')), '') is null
        or lower(trim(wr.dealer_account_number)) = lower(trim(p_dealer_account_number))
      )
      and (
        nullif(btrim(coalesce(p_machine_type, '')), '') is null
        or lower(coalesce(wr.machine_model, '')) like '%' || lower(btrim(p_machine_type)) || '%'
      )
      and (
        nullif(btrim(coalesce(p_query, '')), '') is null
        or upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
          like '%' || upper(regexp_replace(p_query, '[^A-Za-z0-9]+', '', 'g')) || '%'
        or lower(coalesce(wr.machine_model, '')) like '%' || lower(btrim(p_query)) || '%'
      )
  ), current_users as (
    select distinct on (normalized_serial)
      normalized_serial, user_name, user_email
    from public.machine_service_user_history
    where ended_at is null
    order by normalized_serial, started_at desc
  ), latest_services as (
    select distinct on (normalized_serial)
      normalized_serial, service_date, operating_hours
    from public.service_registrations
    order by normalized_serial, service_date desc, created_at desc
  )
  select
    wr.id,
    wr.machine_serial_number,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    wr.machine_model,
    coalesce(current_users.user_name, wr.customer_name),
    coalesce(current_users.user_email, wr.customer_email),
    wr.dealer_account_id,
    wr.dealer_account_number,
    wr.dealer_name_snapshot,
    latest_services.service_date,
    latest_services.operating_hours
  from scoped_warranties wr
  left join current_users
    on current_users.normalized_serial = upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
  left join latest_services
    on latest_services.normalized_serial = upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g'))
  order by wr.machine_serial_number;
$$;
revoke all on function public.list_scoped_service_machines(text, text, text) from public;
revoke execute on function public.list_scoped_service_machines(text, text, text) from anon;
grant execute on function public.list_scoped_service_machines(text, text, text) to authenticated;

create or replace function public.create_scoped_service_registration(p_registration jsonb)
returns public.service_registrations
language plpgsql
security definer
set search_path = public
as $service_registration_create$
declare
  v_actor public.app_users%rowtype;
  v_dealer public.dealer_accounts%rowtype;
  v_warranty public.warranty_registrations%rowtype;
  v_registration public.service_registrations%rowtype;
  v_has_warranty boolean := false;
  v_serial_raw text := nullif(btrim(coalesce(p_registration ->> 'serial_number', '')), '');
  v_normalized_serial text;
  v_requested_dealer_number text := nullif(btrim(coalesce(p_registration ->> 'dealer_account_number', '')), '');
  v_machine_type text := nullif(btrim(coalesce(p_registration ->> 'machine_type', '')), '');
  v_customer_name text := nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), '');
  v_customer_email text := nullif(btrim(coalesce(p_registration ->> 'customer_email', '')), '');
  v_new_user_name text := nullif(btrim(coalesce(p_registration ->> 'new_user_name', '')), '');
  v_new_user_email text := nullif(btrim(coalesce(p_registration ->> 'new_user_email', '')), '');
  v_register_user_change boolean := coalesce((p_registration ->> 'register_user_change')::boolean, false);
  v_service_date date;
  v_operating_hours integer;
  v_interval_hours integer;
  v_technician text := nullif(btrim(coalesce(p_registration ->> 'technician_name', '')), '');
  v_part jsonb;
  v_parts jsonb := coalesce(p_registration -> 'parts', '[]'::jsonb);
  v_source_type text;
  v_quantity numeric;
  v_unit_price numeric;
  v_actor_audit record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select au.* into v_actor
  from public.app_users au
  where coalesce(au.is_active, false)
    and coalesce(au.approved, false)
    and (au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  order by case when au.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if not found or v_actor.portal_role::text not in (
    'timan_backend', 'timan_service', 'timan_dealer', 'dealer_user',
    'timan_importer', 'timan_service_partner'
  ) then
    raise exception 'You do not have permission to create a service registration' using errcode = '42501';
  end if;

  if v_actor.portal_role::text in ('timan_dealer', 'dealer_user') then
    v_requested_dealer_number := nullif(btrim(v_actor.dealer_number), '');
  end if;

  if v_requested_dealer_number is null then
    raise exception 'Choose an active dealer before creating a service registration' using errcode = '42501';
  end if;

  select da.* into v_dealer
  from public.dealer_accounts da
  where lower(trim(da.account_number)) = lower(trim(v_requested_dealer_number))
    and coalesce(da.is_active, true)
    and not coalesce(da.is_deleted, false)
    and not coalesce(da.is_blocked, false)
  limit 1;

  if not found
    or not (
      public.service_is_global_actor()
      or v_dealer.id in (select public.service_visible_dealer_ids())
    ) then
    raise exception 'The selected dealer is not available for service registration' using errcode = '42501';
  end if;

  if v_serial_raw is null or v_machine_type is null or v_technician is null then
    raise exception 'Machine serial, model and technician are required' using errcode = '22023';
  end if;

  v_normalized_serial := upper(regexp_replace(v_serial_raw, '[^A-Za-z0-9]+', '', 'g'));
  if v_normalized_serial = '' then
    raise exception 'Machine serial is invalid' using errcode = '22023';
  end if;

  begin
    v_service_date := nullif(btrim(coalesce(p_registration ->> 'service_date', '')), '')::date;
    v_operating_hours := nullif(btrim(coalesce(p_registration ->> 'operating_hours', '')), '')::integer;
    v_interval_hours := nullif(btrim(coalesce(p_registration ->> 'service_interval_hours', '')), '')::integer;
  exception when invalid_text_representation then
    raise exception 'Service date, operating hours or interval is invalid' using errcode = '22023';
  end;
  if v_service_date is null or v_operating_hours is null or v_operating_hours < 0
    or v_interval_hours is null or v_interval_hours < 0 then
    raise exception 'Service date, operating hours and interval are required' using errcode = '22023';
  end if;

  select wr.* into v_warranty
  from public.warranty_registrations wr
  where wr.is_active_in_source
    and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_normalized_serial
  order by wr.registration_date desc nulls last, wr.created_at desc
  limit 1;

  v_has_warranty := found;

  if v_has_warranty then
    if v_warranty.dealer_account_id is null
      or not (
        public.service_is_global_actor()
        or v_warranty.dealer_account_id in (select public.service_visible_dealer_ids())
      )
      or v_warranty.dealer_account_id <> v_dealer.id then
      -- Deliberately generic: do not reveal a machine outside the caller's scope.
      raise exception 'The selected machine is not available for this service registration' using errcode = '42501';
    end if;
    v_machine_type := coalesce(nullif(btrim(v_warranty.machine_model), ''), v_machine_type);
    v_customer_name := coalesce(v_customer_name, v_warranty.customer_name);
    v_customer_email := coalesce(v_customer_email, v_warranty.customer_email);
  end if;

  if v_register_user_change then
    if v_new_user_name is null then
      raise exception 'A new customer or user is required when registering a user change' using errcode = '22023';
    end if;
    v_customer_name := v_new_user_name;
    v_customer_email := v_new_user_email;
  end if;

  if jsonb_typeof(v_parts) <> 'array' then
    raise exception 'Service parts must be a list' using errcode = '22023';
  end if;

  insert into public.service_registrations (
    machine_registration_id, normalized_serial, serial_number, machine_type,
    dealer_account_id, dealer_account_number, dealer_name_snapshot,
    customer_name, customer_email, service_date, operating_hours,
    service_interval_hours, service_plan_completed, technician_name,
    notes, faults_found, spare_parts_used, attachment_urls,
    total_servicekit_price, total_extra_parts_price, total_price,
    created_by_user_id, created_by_email
  ) values (
    case when v_has_warranty then v_warranty.id else null end,
    v_normalized_serial, v_serial_raw, v_machine_type,
    v_dealer.id, v_dealer.account_number, v_dealer.company_name,
    v_customer_name, v_customer_email, v_service_date, v_operating_hours,
    v_interval_hours, coalesce((p_registration ->> 'service_plan_completed')::boolean, true), v_technician,
    nullif(btrim(coalesce(p_registration ->> 'notes', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'faults_found', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'spare_parts_used', '')), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_registration -> 'attachment_urls', '[]'::jsonb))), '{}'::text[]),
    greatest(coalesce((p_registration ->> 'total_servicekit_price')::numeric, 0), 0),
    greatest(coalesce((p_registration ->> 'total_extra_parts_price')::numeric, 0), 0),
    greatest(coalesce((p_registration ->> 'total_price')::numeric, 0), 0),
    v_actor.id, v_actor.email
  ) returning * into v_registration;

  for v_part in select value from jsonb_array_elements(v_parts)
  loop
    v_source_type := nullif(btrim(coalesce(v_part ->> 'source_type', '')), '');
    if v_source_type not in ('servicekit', 'extra')
      or (
        nullif(btrim(coalesce(v_part ->> 'item_number', '')), '') is null
        and nullif(btrim(coalesce(v_part ->> 'description', '')), '') is null
      ) then
      raise exception 'A service part is invalid' using errcode = '22023';
    end if;
    begin
      v_quantity := coalesce((v_part ->> 'quantity')::numeric, 0);
      v_unit_price := coalesce((v_part ->> 'unit_price')::numeric, 0);
    exception when invalid_text_representation then
      raise exception 'A service part price or quantity is invalid' using errcode = '22023';
    end;
    if v_quantity <= 0 or v_unit_price < 0 then
      raise exception 'A service part price or quantity is invalid' using errcode = '22023';
    end if;
    insert into public.service_registration_parts (
      service_registration_id, source_type, item_number, description, unit_price, quantity, line_total
    ) values (
      v_registration.id, v_source_type,
      nullif(btrim(coalesce(v_part ->> 'item_number', '')), ''),
      nullif(btrim(coalesce(v_part ->> 'description', '')), ''),
      v_unit_price, v_quantity, v_unit_price * v_quantity
    );
  end loop;

  if v_register_user_change then
    update public.machine_service_user_history
       set ended_at = now()
     where normalized_serial = v_normalized_serial
       and ended_at is null;
    insert into public.machine_service_user_history (
      machine_registration_id, normalized_serial, serial_number, dealer_account_id,
      user_name, user_email, source_service_registration_id, changed_by_user_id
    ) values (
      case when v_has_warranty then v_warranty.id else null end,
      v_normalized_serial, v_serial_raw, v_dealer.id,
      v_new_user_name, v_new_user_email, v_registration.id, v_actor.id
    );
  end if;

  select * into v_actor_audit from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label, new_value, changed_fields, status
  ) values (
    v_actor_audit.actor_user_id, v_actor_audit.actor_email, v_actor_audit.actor_name, v_actor_audit.actor_role,
    'create', 'service', 'service_registration', v_registration.id::text,
    v_registration.serial_number,
    jsonb_build_object(
      'dealer_account_id', v_dealer.id,
      'machine_registration_id', v_registration.machine_registration_id,
      'part_count', jsonb_array_length(v_parts),
      'register_user_change', v_register_user_change
    ),
    array['service_date', 'operating_hours', 'service_interval_hours', 'parts'], 'success'
  );

  return v_registration;
end;
$service_registration_create$;
revoke all on function public.create_scoped_service_registration(jsonb) from public;
revoke execute on function public.create_scoped_service_registration(jsonb) from anon;
grant execute on function public.create_scoped_service_registration(jsonb) to authenticated;
