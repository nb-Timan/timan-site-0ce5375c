-- Warranty registration persistence for SharePoint sync.
--
-- The Edge Functions already fetch and transform SharePoint rows. This
-- migration adds the missing database surface they write/read:
-- - warranty_registrations
-- - warranty_registration_history
-- - dealer_account_aliases
-- - scoped RLS helpers, policies, view and RPC used by the UI.
--
-- Additive/idempotent: no warranty, dealer, CRM or master data is deleted.

create or replace function public.is_timan_global_warranty()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.portal_role in (
            'timan_backend'::public.portal_role,
            'timan_service'::public.portal_role
          )
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved, false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

revoke all on function public.is_timan_global_warranty() from public;
grant execute on function public.is_timan_global_warranty() to authenticated;

create or replace function public.warranty_visible_dealer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select au.*
    from public.app_users au
    where coalesce(au.is_active, false) = true
      and coalesce(au.approved, false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    limit 1
  )
  select da.id
    from public.dealer_accounts da
    join me on lower(trim(me.dealer_number)) = lower(trim(da.account_number))
   where me.portal_role in (
           'timan_dealer'::public.portal_role,
           'dealer_user'::public.portal_role,
           'timan_importer'::public.portal_role,
           'timan_service_partner'::public.portal_role
         )

  union

  select child.id
    from public.dealer_accounts child
    join public.dealer_accounts parent
      on lower(trim(child.parent_account_number)) = lower(trim(parent.account_number))
    join me on lower(trim(me.dealer_number)) = lower(trim(parent.account_number))
   where me.portal_role in (
           'timan_importer'::public.portal_role,
           'timan_service_partner'::public.portal_role
         )

  union

  select da.id
    from public.dealer_accounts da
    join me on me.portal_role = 'timan_seller'::public.portal_role
   where lower(trim(coalesce(da.assigned_seller_email, ''))) = lower(trim(coalesce(me.email, '')))
     and coalesce(da.assigned_seller_email, '') <> ''

  union

  select da.id
    from public.dealer_accounts da
    join me on me.portal_role = 'timan_seller'::public.portal_role
   where coalesce(da.assigned_seller_email, '') = ''
     and lower(trim(coalesce(da.assigned_seller_initials, ''))) = lower(trim(coalesce(me.initials, '')))
     and coalesce(da.assigned_seller_initials, '') <> '';
$$;

revoke all on function public.warranty_visible_dealer_ids() from public;
grant execute on function public.warranty_visible_dealer_ids() to authenticated;

create table if not exists public.warranty_registrations (
  id uuid primary key default gen_random_uuid(),

  sharepoint_item_id text not null,
  sharepoint_form_id integer,
  sharepoint_etag text,
  sharepoint_modified_at timestamptz,
  sharepoint_created_at timestamptz,
  source text not null default 'sharepoint',
  certificate_number text,

  machine_serial_number text not null,
  machine_serial_raw text,
  machine_model text,
  tool_serials text[] default '{}'::text[],

  dealer_name_snapshot text not null,
  dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  dealer_account_number text,
  dealer_match_status text not null default 'unmatched'
    check (dealer_match_status in ('matched', 'needs_review', 'unmatched')),
  dealer_match_confidence numeric,
  dealer_match_method text,
  dealer_match_reviewed_by uuid,
  dealer_match_reviewed_at timestamptz,

  customer_name text,
  customer_address text,
  customer_postal_code text,
  customer_city text,
  customer_country text,
  customer_phone text,
  customer_email text,
  customer_latitude double precision,
  customer_longitude double precision,
  customer_geocoded_at timestamptz,
  customer_geocoding_status text,
  customer_geocoding_error text,

  delivery_date date,
  registration_date timestamptz,
  language text,
  is_demo boolean default false,
  replacement_brand text,
  comment text,

  is_active_in_source boolean not null default true,
  last_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warranty_registrations_sp_item_unique unique (sharepoint_item_id),
  constraint warranty_registrations_matched_requires_dealer check (
    dealer_match_status <> 'matched'
    or (
      dealer_account_id is not null
      and dealer_account_number is not null
      and length(trim(dealer_account_number)) > 0
    )
  )
);

alter table public.warranty_registrations
  add column if not exists sharepoint_form_id integer,
  add column if not exists sharepoint_created_at timestamptz,
  add column if not exists certificate_number text,
  add column if not exists customer_latitude double precision,
  add column if not exists customer_longitude double precision,
  add column if not exists customer_geocoded_at timestamptz,
  add column if not exists customer_geocoding_status text,
  add column if not exists customer_geocoding_error text;

comment on table public.warranty_registrations is
  'Warranty registration master. Source of truth is the SharePoint Warranty registration list. Contains personal data; access is RLS-gated.';

comment on column public.warranty_registrations.sharepoint_form_id is
  'SharePoint list field ID_Forms, used as visible certificate number (SP-{id}).';

comment on column public.warranty_registrations.sharepoint_created_at is
  'Original SharePoint item createdDateTime, used as Oprettet.';

comment on column public.warranty_registrations.certificate_number is
  'Optional display certificate number used by service/geocoding summaries.';

comment on column public.warranty_registrations.machine_serial_number is
  'Normalised serial number. Trigger applies trim, uppercase and whitespace collapse.';

comment on column public.warranty_registrations.dealer_name_snapshot is
  'Free-text dealer name from SharePoint, used by the matching pipeline.';

comment on column public.warranty_registrations.customer_latitude is
  'Geocoded latitude for the customer address (machine pin on partner map).';

comment on column public.warranty_registrations.customer_longitude is
  'Geocoded longitude for the customer address (machine pin on partner map).';

comment on column public.warranty_registrations.customer_geocoding_status is
  'ok | not_found | skipped | error, set by geocode-warranty-customers.';

create table if not exists public.warranty_registration_history (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.warranty_registrations(id) on delete restrict,
  changed_at timestamptz not null default now(),
  change_source text not null default 'sharepoint_sync',
  snapshot jsonb not null,
  diff jsonb
);

comment on table public.warranty_registration_history is
  'Per-change snapshot of warranty_registrations. ON DELETE RESTRICT preserves audit history.';

create table if not exists public.dealer_account_aliases (
  id uuid primary key default gen_random_uuid(),
  normalized_alias text not null unique,
  raw_alias text not null,
  dealer_account_id uuid not null references public.dealer_accounts(id) on delete cascade,
  dealer_account_number text,
  source text not null default 'manual',
  approved_by_user_id uuid,
  approved_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dealer_account_aliases_alias_not_empty check (
    length(trim(normalized_alias)) > 0
  )
);

alter table public.dealer_account_aliases
  add column if not exists raw_alias text,
  add column if not exists dealer_account_number text,
  add column if not exists source text not null default 'manual',
  add column if not exists approved_by_user_id uuid,
  add column if not exists approved_by_email text;

comment on table public.dealer_account_aliases is
  'Persistent SharePoint dealer-name to dealer_account mapping approved by backend/service users.';

create index if not exists warranty_registrations_serial_idx
  on public.warranty_registrations (machine_serial_number);

create index if not exists warranty_registrations_form_id_idx
  on public.warranty_registrations (sharepoint_form_id desc);

create index if not exists warranty_registrations_sp_created_at_idx
  on public.warranty_registrations (sharepoint_created_at desc);

create index if not exists warranty_registrations_dealer_id_idx
  on public.warranty_registrations (dealer_account_id);

create index if not exists warranty_registrations_dealer_number_idx
  on public.warranty_registrations (dealer_account_number);

create index if not exists warranty_registrations_match_status_idx
  on public.warranty_registrations (dealer_match_status)
  where dealer_match_status <> 'matched';

create index if not exists warranty_registrations_delivery_date_idx
  on public.warranty_registrations (delivery_date desc);

create index if not exists warranty_registrations_active_idx
  on public.warranty_registrations (is_active_in_source)
  where is_active_in_source = true;

create index if not exists warranty_registrations_customer_coords_idx
  on public.warranty_registrations (customer_latitude, customer_longitude)
  where customer_latitude is not null and customer_longitude is not null;

create index if not exists warranty_registrations_customer_geocoding_status_idx
  on public.warranty_registrations (customer_geocoding_status);

create index if not exists warranty_registration_history_reg_idx
  on public.warranty_registration_history (registration_id, changed_at desc);

create index if not exists dealer_account_aliases_dealer_idx
  on public.dealer_account_aliases (dealer_account_id);

create or replace function public.set_updated_at_warranty_registrations()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_wr_set_updated_at on public.warranty_registrations;
create trigger trg_wr_set_updated_at
  before update on public.warranty_registrations
  for each row execute function public.set_updated_at_warranty_registrations();

create or replace function public.normalize_warranty_serial()
returns trigger
language plpgsql
as $$
declare
  v_raw text := new.machine_serial_number;
begin
  if v_raw is null or length(trim(v_raw)) = 0 then
    raise exception 'machine_serial_number is required'
      using errcode = '23502';
  end if;

  if (tg_op = 'INSERT' and new.machine_serial_raw is null)
     or (tg_op = 'UPDATE' and (new.machine_serial_raw is null or length(trim(new.machine_serial_raw)) = 0)) then
    new.machine_serial_raw := v_raw;
  end if;

  new.machine_serial_number := upper(regexp_replace(trim(v_raw), '\s+', '', 'g'));
  if new.certificate_number is null then
    new.certificate_number := coalesce(
      case when new.sharepoint_form_id is not null then 'SP-' || new.sharepoint_form_id::text end,
      case when new.sharepoint_item_id is not null then 'SP-' || new.sharepoint_item_id end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_wr_normalize_serial on public.warranty_registrations;
create trigger trg_wr_normalize_serial
  before insert or update of machine_serial_number, machine_serial_raw, sharepoint_form_id, sharepoint_item_id
  on public.warranty_registrations
  for each row execute function public.normalize_warranty_serial();

create or replace function public.set_updated_at_dealer_account_aliases()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_daa_set_updated_at on public.dealer_account_aliases;
create trigger trg_daa_set_updated_at
  before update on public.dealer_account_aliases
  for each row execute function public.set_updated_at_dealer_account_aliases();

alter table public.warranty_registrations enable row level security;
alter table public.warranty_registration_history enable row level security;
alter table public.dealer_account_aliases enable row level security;

drop policy if exists wr_internal_select on public.warranty_registrations;
create policy wr_internal_select
  on public.warranty_registrations
  for select
  to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists wr_scoped_select on public.warranty_registrations;
create policy wr_scoped_select
  on public.warranty_registrations
  for select
  to authenticated
  using (
    dealer_account_id is not null
    and dealer_match_status = 'matched'
    and dealer_account_id in (select public.warranty_visible_dealer_ids())
  );

drop policy if exists wrh_internal_select on public.warranty_registration_history;
create policy wrh_internal_select
  on public.warranty_registration_history
  for select
  to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists wrh_scoped_select on public.warranty_registration_history;
create policy wrh_scoped_select
  on public.warranty_registration_history
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.warranty_registrations wr
       where wr.id = warranty_registration_history.registration_id
         and wr.dealer_account_id is not null
         and wr.dealer_match_status = 'matched'
         and wr.dealer_account_id in (select public.warranty_visible_dealer_ids())
    )
  );

drop policy if exists daa_internal_select on public.dealer_account_aliases;
create policy daa_internal_select
  on public.dealer_account_aliases
  for select
  to authenticated
  using (public.is_timan_global_warranty());

drop policy if exists dealer_account_aliases_select_backend_service on public.dealer_account_aliases;

grant select on public.warranty_registrations to authenticated;
grant all on public.warranty_registrations to service_role;
grant select on public.warranty_registration_history to authenticated;
grant all on public.warranty_registration_history to service_role;
grant select on public.dealer_account_aliases to authenticated;
grant all on public.dealer_account_aliases to service_role;

create or replace view public.v_machine_latest_warranty
with (security_invoker = true)
as
  select distinct on (machine_serial_number)
         wr.*
    from public.warranty_registrations wr
   where wr.is_active_in_source = true
   order by wr.machine_serial_number, wr.delivery_date desc nulls last, wr.registration_date desc nulls last;

grant select on public.v_machine_latest_warranty to authenticated;

create or replace function public.partner_map_machine_stats(p_dealer_id uuid)
returns table (
  dealer_account_id uuid,
  total_machines integer,
  total_registrations integer,
  serial_count integer,
  latest_delivery date,
  models jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
       public.is_timan_global_warranty()
       or p_dealer_id in (select public.warranty_visible_dealer_ids())
     ) then
    raise exception 'not authorised for dealer %', p_dealer_id
      using errcode = '42501';
  end if;

  return query
    with rows as (
      select *
        from public.warranty_registrations
       where warranty_registrations.dealer_account_id = p_dealer_id
         and warranty_registrations.dealer_match_status = 'matched'
         and warranty_registrations.is_active_in_source = true
    ),
    model_counts as (
      select machine_model, count(distinct machine_serial_number)::int as n
        from rows
       where machine_model is not null
       group by machine_model
    )
    select
      p_dealer_id,
      (select count(distinct machine_serial_number)::int from rows),
      (select count(*)::int from rows),
      (select count(distinct machine_serial_number)::int from rows),
      (select max(delivery_date) from rows),
      coalesce(
        (select jsonb_object_agg(machine_model, n) from model_counts),
        '{}'::jsonb
      );
end;
$$;

revoke all on function public.partner_map_machine_stats(uuid) from public;
grant execute on function public.partner_map_machine_stats(uuid) to authenticated;

create or replace function public.warranty_update_registration(
  p_id uuid,
  p_changes jsonb
)
returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.warranty_registrations%rowtype;
  v_after public.warranty_registrations%rowtype;
  v_is_internal boolean := public.is_timan_global_warranty();
  v_scoped boolean;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
  v_new jsonb;
  v_old_text text;
  v_new_text text;
  v_new_date date;
  v_new_uuid uuid;
  v_target_dealer_id uuid;
  v_target_dealer_no text;
  v_dealer_id_provided boolean := false;
  v_dealer_no_provided boolean := false;
  v_dealer_row public.dealer_accounts%rowtype;
  v_old_status text;
  v_cols_common text[] := array[
    'customer_name', 'customer_address', 'customer_postal_code',
    'customer_city', 'customer_country', 'customer_phone', 'customer_email',
    'delivery_date', 'machine_model', 'comment'
  ];
  v_cols_internal text[] := array[
    'machine_serial_number',
    'dealer_account_id', 'dealer_account_number'
  ];
begin
  select * into v_before
    from public.warranty_registrations
   where id = p_id
   for update;
  if not found then
    raise exception 'warranty_registration % not found', p_id
      using errcode = 'P0002';
  end if;

  v_old_status := v_before.dealer_match_status;
  v_scoped := v_before.dealer_account_id is not null
              and v_before.dealer_match_status = 'matched'
              and v_before.dealer_account_id in (select public.warranty_visible_dealer_ids());

  if not (v_is_internal or v_scoped) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  if v_is_internal then
    v_dealer_id_provided := p_changes ? 'dealer_account_id';
    v_dealer_no_provided := p_changes ? 'dealer_account_number';

    if v_dealer_id_provided then
      v_new_text := nullif(btrim(coalesce(p_changes ->> 'dealer_account_id', '')), '');
      begin
        v_target_dealer_id := case when v_new_text is null then null else v_new_text::uuid end;
      exception when others then
        raise exception 'dealer_account_id is not a valid uuid: %', v_new_text
          using errcode = '22P02';
      end;
    else
      v_target_dealer_id := v_before.dealer_account_id;
    end if;

    if v_dealer_no_provided then
      v_target_dealer_no := nullif(btrim(coalesce(p_changes ->> 'dealer_account_number', '')), '');
    else
      v_target_dealer_no := v_before.dealer_account_number;
    end if;

    if v_dealer_id_provided or v_dealer_no_provided then
      if v_target_dealer_id is null or v_target_dealer_no is null then
        raise exception 'Dealer link cannot be cleared from portal edit. Use matching workflow.'
          using errcode = '22023';
      end if;

      select * into v_dealer_row
        from public.dealer_accounts
       where id = v_target_dealer_id;
      if not found then
        raise exception 'dealer_account % not found', v_target_dealer_id
          using errcode = 'P0002';
      end if;

      if lower(btrim(coalesce(v_dealer_row.account_number, ''))) <> lower(btrim(v_target_dealer_no)) then
        raise exception 'dealer_account_number % does not match dealer_account %',
          v_target_dealer_no, v_target_dealer_id
          using errcode = '22023';
      end if;
    end if;
  end if;

  for v_key, v_new in select * from jsonb_each(coalesce(p_changes, '{}'::jsonb))
  loop
    if not (v_key = any(v_cols_common) or (v_is_internal and v_key = any(v_cols_internal))) then
      continue;
    end if;

    if jsonb_typeof(v_new) = 'null' then
      v_new_text := null;
    else
      v_new_text := nullif(btrim(v_new #>> '{}'), '');
    end if;

    execute format('select ($1).%I::text', v_key) into v_old_text using v_before;
    if v_old_text is not distinct from v_new_text then
      continue;
    end if;

    if v_key = 'delivery_date' then
      begin
        v_new_date := case when v_new_text is null then null else v_new_text::date end;
      exception when others then
        raise exception 'delivery_date is not a valid date: %', v_new_text
          using errcode = '22007';
      end;
      update public.warranty_registrations
         set delivery_date = v_new_date
       where id = p_id;
    elsif v_key = 'dealer_account_id' then
      v_new_uuid := case when v_new_text is null then null else v_new_text::uuid end;
      update public.warranty_registrations
         set dealer_account_id = v_new_uuid
       where id = p_id;
    else
      execute format(
        'update public.warranty_registrations set %I = $1 where id = $2',
        v_key
      ) using v_new_text, p_id;
    end if;

    v_diff := v_diff || jsonb_build_object(
      v_key, jsonb_build_object('old', to_jsonb(v_old_text), 'new', to_jsonb(v_new_text))
    );
  end loop;

  if v_is_internal
     and (v_dealer_id_provided or v_dealer_no_provided)
     and v_target_dealer_id is not null
     and v_target_dealer_no is not null
  then
    update public.warranty_registrations
       set dealer_match_status = 'matched',
           dealer_match_method = 'manual',
           dealer_match_reviewed_by = auth.uid(),
           dealer_match_reviewed_at = now()
     where id = p_id;

    if v_old_status is distinct from 'matched' then
      v_diff := v_diff || jsonb_build_object(
        'dealer_match_status',
        jsonb_build_object('old', to_jsonb(v_old_status), 'new', to_jsonb('matched'::text))
      );
    end if;
    v_diff := v_diff || jsonb_build_object(
      'dealer_match_method',
      jsonb_build_object('old', to_jsonb(v_before.dealer_match_method), 'new', to_jsonb('manual'::text))
    );
  end if;

  if v_diff = '{}'::jsonb then
    return v_before;
  end if;

  insert into public.warranty_registration_history
    (registration_id, change_source, snapshot, diff)
  values (
    p_id,
    'portal_edit',
    to_jsonb(v_before) || jsonb_build_object('_actor', auth.uid()),
    v_diff || jsonb_build_object('_actor', to_jsonb(auth.uid()))
  );

  select * into v_after from public.warranty_registrations where id = p_id;
  return v_after;
end;
$$;

revoke all on function public.warranty_update_registration(uuid, jsonb) from public;
grant execute on function public.warranty_update_registration(uuid, jsonb) to authenticated;
