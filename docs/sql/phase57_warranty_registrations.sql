-- =====================================================================
-- Phase 57 — Warranty Registrations (SharePoint master → Supabase)
--
-- SCOPE (this migration ONLY):
--   1. public.warranty_registrations           (master, fed by SP sync)
--   2. public.warranty_registration_history    (audit / versioning)
--   3. Indexes
--   4. RLS policies + grants
--   5. View: v_machine_latest_warranty         (latest per serial)
--   6. RPC:  partner_map_machine_stats(uuid)   (aggregates, no PII)
--   7. Role helpers used by RLS                (forgiving, security definer)
--
-- OUT OF SCOPE (intentionally not touched):
--   - SharePoint sync edge function
--   - Any UI
--   - Partnerkort wiring
--   - Claims / TSB / service history tables
--
-- DESIGN PRINCIPLES:
--   - sharepoint_item_id is the ONLY unique sync key.
--   - machine_serial_number is INDEXED but NOT unique
--     (re-registrations and historical duplicates are allowed; latest is
--      surfaced via v_machine_latest_warranty).
--   - dealer_account_id is the internal FK (nullable while unresolved);
--     dealer_account_number is the durable external reference from SP.
--   - No hard delete: rows that vanish from SP get is_active_in_source=false.
--   - service_role is the only writer (sync function). authenticated has
--     SELECT only, gated by RLS. anon has zero access (contains PII).
--   - Partnerkort aggregates go through the RPC which NEVER returns
--     customer_name / address / phone / email.
--
-- Additive, idempotent. Run manually after review.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) Forgiving role helpers used by RLS / RPC
--    (mirror pattern from phase13 is_timan_backend)
--
--    IMPORTANT: only timan_backend and timan_service get GLOBAL warranty
--    visibility. timan_seller is NOT global — sellers are scoped to their
--    assigned dealer_accounts via warranty_visible_dealer_ids().
-- ---------------------------------------------------------------------

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
      and coalesce(au.approved,  false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;
revoke all on function public.is_timan_global_warranty() from public;
grant execute on function public.is_timan_global_warranty() to authenticated;



-- Resolve set of dealer_account ids visible to the current user.
-- - timan_dealer / dealer_user: dealer linked via app_users.dealer_number
-- - timan_importer / timan_service_partner: linked dealer + its children
--   (uses dealer_accounts.parent_account_number if present, else just own)
-- - timan_seller: all dealers assigned to seller (by email or initials)
-- - timan_backend / timan_service: handled via is_timan_global_warranty(), not here
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
      and coalesce(au.approved,  false) = true
      and (
        au.auth_user_id = auth.uid()
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    limit 1
  )
  -- Own dealer (by dealer_number → account_number)
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

  -- Child dealers when the user is importer / service partner
  -- (parent_account_number column exists from phase15; we guard with COALESCE)
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

  -- Sellers see their assigned dealers
  select da.id
    from public.dealer_accounts da
    join me on me.portal_role = 'timan_seller'::public.portal_role
   where (
           lower(trim(coalesce(da.assigned_seller_email,'')))   = lower(trim(coalesce(me.email,'')))
           and coalesce(da.assigned_seller_email,'') <> ''
         )
      or (
           lower(trim(coalesce(da.assigned_seller_initials,''))) = lower(trim(coalesce(me.initials,'')))
           and coalesce(da.assigned_seller_initials,'') <> ''
         );
$$;
revoke all on function public.warranty_visible_dealer_ids() from public;
grant execute on function public.warranty_visible_dealer_ids() to authenticated;


-- ---------------------------------------------------------------------
-- 1) public.warranty_registrations  (master, SP-fed)
-- ---------------------------------------------------------------------

create table if not exists public.warranty_registrations (
  id                          uuid primary key default gen_random_uuid(),

  -- SharePoint source
  sharepoint_item_id          text not null,
  sharepoint_etag             text,
  sharepoint_modified_at      timestamptz,
  source                      text not null default 'sharepoint',
    -- 'sharepoint' | 'manual' | 'portal'

  -- Machine (central join key across service universe)
  machine_serial_number       text not null,           -- NORMALISED upper/trim
  machine_serial_raw          text,                    -- as entered in SP
  machine_model               text,
  tool_serials                text[] default '{}'::text[],

  -- Dealer relation (dual-reference, see phase57 design notes)
  dealer_account_id           uuid references public.dealer_accounts(id) on delete set null,
  dealer_account_number       text,                    -- external durable ref
  dealer_name_snapshot        text,                    -- as captured in SP

  -- End customer (PERSONAL DATA — protected via RLS + RPC strip)
  customer_name               text,
  customer_address            text,
  customer_postal_code        text,
  customer_city               text,
  customer_country            text,
  customer_phone              text,
  customer_email              text,

  -- Form fields
  delivery_date               date,
  registration_date           timestamptz,
  language                    text,
  is_demo                     boolean default false,
  replacement_brand           text,
  comment                     text,

  -- Lifecycle (portal-owned — sync MUST NOT overwrite)
  is_active_in_source         boolean not null default true,
  last_synced_at              timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint warranty_registrations_sp_item_unique unique (sharepoint_item_id)
);

comment on table public.warranty_registrations is
  'Warranty registration master. Source of truth = SharePoint Garantiregistrering list. Synced via edge function (added in later phase). Contains personal data; access is RLS-gated and anon has NO access.';

comment on column public.warranty_registrations.machine_serial_number is
  'Normalised serial number (upper/trim). Central join key for claims, TSB, service history and machine search. NOT unique — re-registrations are allowed.';

comment on column public.warranty_registrations.dealer_account_id is
  'Internal FK to dealer_accounts. Nullable while unresolved (e.g. dealer not yet synced). Sync resolves via dealer_account_number.';

comment on column public.warranty_registrations.dealer_account_number is
  'External durable reference from SharePoint. Survives even if dealer_accounts row is missing or rebuilt.';

comment on column public.warranty_registrations.is_active_in_source is
  'PORTAL-OWNED. False = row vanished from SharePoint. Sync NEVER hard-deletes; only flips this flag.';


-- ---------------------------------------------------------------------
-- 2) public.warranty_registration_history  (audit / version snapshots)
-- ---------------------------------------------------------------------

create table if not exists public.warranty_registration_history (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.warranty_registrations(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  change_source   text not null default 'sharepoint_sync',
    -- 'sharepoint_sync' | 'portal_edit' | 'manual'
  snapshot        jsonb not null,    -- full row before the change
  diff            jsonb              -- field-level diff (optional)
);

comment on table public.warranty_registration_history is
  'Per-change snapshot of warranty_registrations. Preserves history even if SharePoint mutates or removes the source row.';


-- ---------------------------------------------------------------------
-- 3) Indexes
-- ---------------------------------------------------------------------

create index if not exists warranty_registrations_serial_idx
  on public.warranty_registrations (machine_serial_number);

create index if not exists warranty_registrations_dealer_id_idx
  on public.warranty_registrations (dealer_account_id);

create index if not exists warranty_registrations_dealer_number_idx
  on public.warranty_registrations (dealer_account_number);

create index if not exists warranty_registrations_delivery_date_idx
  on public.warranty_registrations (delivery_date desc);

create index if not exists warranty_registrations_active_idx
  on public.warranty_registrations (is_active_in_source)
  where is_active_in_source = true;

create index if not exists warranty_registration_history_reg_idx
  on public.warranty_registration_history (registration_id, changed_at desc);


-- ---------------------------------------------------------------------
-- 4) RLS + grants
-- ---------------------------------------------------------------------

-- Master table
alter table public.warranty_registrations enable row level security;

-- Internal Timan roles see everything
drop policy if exists wr_internal_select on public.warranty_registrations;
create policy wr_internal_select
  on public.warranty_registrations
  for select
  to authenticated
  using ( public.is_timan_global_warranty() );

-- Dealer / importer / service partner / seller: scoped via helper
drop policy if exists wr_scoped_select on public.warranty_registrations;
create policy wr_scoped_select
  on public.warranty_registrations
  for select
  to authenticated
  using (
    dealer_account_id is not null
    and dealer_account_id in (select public.warranty_visible_dealer_ids())
  );

-- NO insert/update/delete policies for authenticated.
-- Only service_role (sync edge function) writes directly.

grant select on public.warranty_registrations to authenticated;
grant all    on public.warranty_registrations to service_role;
-- intentionally NO grant to anon (contains PII).

-- History table
alter table public.warranty_registration_history enable row level security;

drop policy if exists wrh_internal_select on public.warranty_registration_history;
create policy wrh_internal_select
  on public.warranty_registration_history
  for select
  to authenticated
  using ( public.is_timan_global_warranty() );

grant select on public.warranty_registration_history to authenticated;
grant all    on public.warranty_registration_history to service_role;
-- intentionally NO grant to anon.


-- ---------------------------------------------------------------------
-- 5) View: latest warranty registration per serial number
--    security_invoker = true → underlying RLS applies to the caller.
-- ---------------------------------------------------------------------

create or replace view public.v_machine_latest_warranty as
  select distinct on (machine_serial_number)
         wr.*
    from public.warranty_registrations wr
   where wr.is_active_in_source = true
   order by wr.machine_serial_number, wr.delivery_date desc nulls last, wr.registration_date desc nulls last;

alter view public.v_machine_latest_warranty set (security_invoker = true);

grant select on public.v_machine_latest_warranty to authenticated;


-- ---------------------------------------------------------------------
-- 6) RPC: partner_map_machine_stats(dealer_id)
--    Returns AGGREGATES only. NEVER exposes:
--      customer_name, customer_address, customer_phone, customer_email
--    Caller scope is enforced inside the function.
-- ---------------------------------------------------------------------

create or replace function public.partner_map_machine_stats(p_dealer_id uuid)
returns table (
  dealer_account_id   uuid,
  total_machines      integer,
  latest_delivery     date,
  models              jsonb,        -- {"X40 Pro": 3, "Z20": 2}
  serial_count        integer       -- distinct serial numbers
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Scope check: caller must either be internal or have this dealer in scope.
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
       where dealer_account_id = p_dealer_id
         and is_active_in_source = true
    ),
    model_counts as (
      select machine_model, count(*)::int as n
        from rows
       where machine_model is not null
       group by machine_model
    )
    select
      p_dealer_id,
      (select count(*)::int from rows),
      (select max(delivery_date) from rows),
      coalesce(
        (select jsonb_object_agg(machine_model, n) from model_counts),
        '{}'::jsonb
      ),
      (select count(distinct machine_serial_number)::int from rows);
end;
$$;

comment on function public.partner_map_machine_stats(uuid) is
  'Aggregated machine stats for Partnerkort. NEVER returns customer PII (name, address, phone, email). Scope-checked against caller.';

revoke all on function public.partner_map_machine_stats(uuid) from public;
grant execute on function public.partner_map_machine_stats(uuid) to authenticated;


-- =====================================================================
-- Verify (manual):
--
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('warranty_registrations','warranty_registration_history');
--
--   select policyname, cmd from pg_policies
--    where schemaname='public'
--      and tablename in ('warranty_registrations','warranty_registration_history');
--
--   -- Should return zero rows (no anon access):
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name='warranty_registrations' and grantee='anon';
--
--   -- Smoke test the RPC (as internal user):
--   select * from public.partner_map_machine_stats(
--     (select id from public.dealer_accounts limit 1)
--   );
-- =====================================================================
