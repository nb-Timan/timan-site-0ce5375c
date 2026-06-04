-- =====================================================================
-- Phase 57 — Warranty Registrations (SharePoint master → Supabase)
--
-- SCOPE (this migration ONLY):
--   1. public.warranty_registrations           (master, fed by SP sync)
--   2. public.warranty_registration_history    (audit / versioning)
--   3. public.dealer_account_aliases           (dealer name → account map)
--   4. Indexes
--   5. RLS policies + grants
--   6. View: v_machine_latest_warranty         (latest per serial)
--   7. RPC:  partner_map_machine_stats(uuid)   (aggregates, no PII)
--   8. Role helpers used by RLS                (forgiving, security definer)
--   9. updated_at triggers
--
-- OUT OF SCOPE (intentionally not touched):
--   - SharePoint sync edge function
--   - Any UI ("Warranty dealer matching" backend section comes later)
--   - Partnerkort wiring
--   - Claims / TSB / service history tables
--
-- KEY DESIGN PRINCIPLES (updated):
--   - sharepoint_item_id is the ONLY unique sync key.
--   - machine_serial_number is INDEXED but NOT unique. Sync MUST normalise
--     before insert: trim + uppercase + collapse internal whitespace.
--     Raw value preserved in machine_serial_raw.
--   - Dealer relation is NAME-FIRST. SharePoint only provides a free-text
--     dealer name. Sync therefore stores:
--         dealer_name_snapshot  (always, NOT NULL)
--         dealer_account_id     (nullable until matched + approved)
--         dealer_account_number (nullable until matched + approved)
--         dealer_match_status   ('unmatched' | 'needs_review' | 'matched')
--     Warranty sync is NEVER allowed to create dealer_accounts rows.
--   - dealer_account_aliases is the persistent learning table: once a
--     backend user approves "Wilmers" → dealer X, the alias is reused
--     automatically by future syncs.
--   - is_active_in_source is SYNC-OWNED (NOT portal-owned). SharePoint
--     sync flips it to false when the row vanishes from SP.
--     No hard delete of warranty_registrations.
--   - history.registration_id uses ON DELETE RESTRICT — history must not
--     disappear due to accidental deletes.
--   - service_role is the only writer. authenticated has SELECT only.
--     anon has zero access (contains PII).
--   - Partnerkort aggregates go through the RPC which NEVER returns
--     customer_name / address / phone / email.
--   - timan_seller is NOT global. Sellers are scoped via
--     warranty_visible_dealer_ids() using assigned_seller_email primary,
--     assigned_seller_initials fallback.
--
-- MATCH STRATEGY (to be implemented in the later sync edge function — NOT
-- here). Documented so RLS / table shape stays consistent with it:
--   1. Exact match on dealer_accounts.company_name (case-insensitive trim)
--   2. Match via public.dealer_account_aliases (normalized_alias)
--   3. Normalised match:
--        - lowercase, trim
--        - strip company forms: A/S, ApS, GmbH, AB, BV, s.r.o., Ltd, etc.
--        - strip punctuation, dashes and collapse whitespace
--   4. Fuzzy match with similarity score
--   5. Use country as additional weight if available
--   6. High score → suggested match (status='needs_review')
--   7. Low / no score → status='unmatched', requires manual approval
--   Sync MUST never auto-create dealer_accounts. Unmatched rows are
--   persisted with dealer_account_id = NULL.
--
-- FUTURE BACKEND UI (NOT in this migration):
--   Section "Warranty dealer matching" listing rows where
--   dealer_match_status in ('needs_review','unmatched'), showing:
--     - SharePoint dealer name (dealer_name_snapshot)
--     - Suggested match + confidence
--     - Other candidate matches
--     - [Approve match] button → writes alias + sets status='matched'
--     - Dropdown to pick a different dealer
--     - Status pill: matched / needs_review / unmatched
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
-- - timan_seller: dealers where assigned_seller_email matches the user's
--   email (primary). assigned_seller_initials is used ONLY as fallback
--   when the dealer_account has no assigned_seller_email.
-- - timan_backend / timan_service: handled via is_timan_global_warranty()
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

  -- Sellers: PRIMARY match on assigned_seller_email
  select da.id
    from public.dealer_accounts da
    join me on me.portal_role = 'timan_seller'::public.portal_role
   where lower(trim(coalesce(da.assigned_seller_email,''))) = lower(trim(coalesce(me.email,'')))
     and coalesce(da.assigned_seller_email,'') <> ''

  union

  -- Sellers: FALLBACK on assigned_seller_initials, ONLY when dealer has
  -- no assigned_seller_email set.
  select da.id
    from public.dealer_accounts da
    join me on me.portal_role = 'timan_seller'::public.portal_role
   where coalesce(da.assigned_seller_email,'') = ''
     and lower(trim(coalesce(da.assigned_seller_initials,''))) = lower(trim(coalesce(me.initials,'')))
     and coalesce(da.assigned_seller_initials,'') <> '';
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
  -- machine_serial_number MUST be normalised by the writer:
  --   trim, uppercase, collapse internal whitespace.
  -- Raw user-entered value preserved in machine_serial_raw.
  machine_serial_number       text not null,
  machine_serial_raw          text,
  machine_model               text,
  tool_serials                text[] default '{}'::text[],

  -- Dealer relation (name-first; matching is a separate concern)
  dealer_name_snapshot        text not null,
  dealer_account_id           uuid references public.dealer_accounts(id) on delete set null,
  dealer_account_number       text,
  dealer_match_status         text not null default 'unmatched'
    check (dealer_match_status in ('matched','needs_review','unmatched')),
  dealer_match_confidence     numeric,
  dealer_match_method         text,
    -- 'exact_name' | 'alias' | 'normalised' | 'fuzzy' | 'manual'
  dealer_match_reviewed_by    uuid,           -- auth_user_id of reviewer
  dealer_match_reviewed_at    timestamptz,

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

  -- Lifecycle (SYNC-OWNED — flipped by SharePoint sync when row vanishes)
  is_active_in_source         boolean not null default true,
  last_synced_at              timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint warranty_registrations_sp_item_unique unique (sharepoint_item_id),

  -- A registration cannot be 'matched' without a real dealer link.
  -- Both the internal FK and the durable external account_number must be set.
  constraint warranty_registrations_matched_requires_dealer check (
    dealer_match_status <> 'matched'
    or (
      dealer_account_id is not null
      and dealer_account_number is not null
      and length(trim(dealer_account_number)) > 0
    )
  )
);

comment on table public.warranty_registrations is
  'Warranty registration master. Source of truth = SharePoint Garantiregistrering list. Synced via edge function (added in later phase). Contains personal data; access is RLS-gated and anon has NO access.';

comment on column public.warranty_registrations.machine_serial_number is
  'Normalised serial number. Writer MUST apply: trim, uppercase, collapse internal whitespace. Central join key for claims, TSB, service history and machine search. NOT unique — re-registrations are allowed.';

comment on column public.warranty_registrations.machine_serial_raw is
  'Original serial number as entered in SharePoint. Kept for audit / debugging.';

comment on column public.warranty_registrations.dealer_name_snapshot is
  'Free-text dealer name from SharePoint (e.g. "Wilmers", "Wilmers GmbH"). Always present; used by the matching pipeline.';

comment on column public.warranty_registrations.dealer_account_id is
  'Internal FK to dealer_accounts. NULL while unmatched. Sync NEVER auto-creates a dealer_account — unmatched rows simply have NULL here and dealer_match_status=''unmatched''.';

comment on column public.warranty_registrations.dealer_account_number is
  'External durable reference. NULL until match is confirmed.';

comment on column public.warranty_registrations.dealer_match_status is
  'matched = approved link to dealer_account_id; needs_review = high-confidence suggestion awaiting manual approval; unmatched = no candidate.';

comment on column public.warranty_registrations.is_active_in_source is
  'SYNC-OWNED. False = row vanished from SharePoint. Sync NEVER hard-deletes; only flips this flag. Portal code MUST NOT modify it.';


-- ---------------------------------------------------------------------
-- 2) public.warranty_registration_history  (audit / version snapshots)
-- ---------------------------------------------------------------------

create table if not exists public.warranty_registration_history (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.warranty_registrations(id) on delete restrict,
  changed_at      timestamptz not null default now(),
  change_source   text not null default 'sharepoint_sync',
    -- 'sharepoint_sync' | 'portal_edit' | 'manual' | 'match_review'
  snapshot        jsonb not null,    -- full row before the change
  diff            jsonb              -- field-level diff (optional)
);

comment on table public.warranty_registration_history is
  'Per-change snapshot of warranty_registrations. ON DELETE RESTRICT so history survives accidental deletes.';


-- ---------------------------------------------------------------------
-- 3) public.dealer_account_aliases  (persistent name → account learning)
-- ---------------------------------------------------------------------

create table if not exists public.dealer_account_aliases (
  id                    uuid primary key default gen_random_uuid(),
  alias_name            text not null,                     -- as seen in source
  normalized_alias      text not null,                     -- lower/trim/stripped
  dealer_account_id     uuid references public.dealer_accounts(id) on delete set null,
  dealer_account_number text,
  confidence            numeric,
  source                text not null default 'warranty_sharepoint',
  created_by            uuid,                              -- auth_user_id
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint dealer_account_aliases_unique unique (normalized_alias, source)
);

comment on table public.dealer_account_aliases is
  'Persistent dealer-name → dealer_account mapping. Populated by backend users when approving warranty matches. Reused automatically on subsequent syncs.';

comment on column public.dealer_account_aliases.normalized_alias is
  'Writer MUST normalise: lowercase, trim, strip company forms (A/S, ApS, GmbH, AB, BV, s.r.o., Ltd...), strip punctuation/dashes, collapse whitespace.';


-- ---------------------------------------------------------------------
-- 4) Indexes
-- ---------------------------------------------------------------------

create index if not exists warranty_registrations_serial_idx
  on public.warranty_registrations (machine_serial_number);

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

create index if not exists warranty_registration_history_reg_idx
  on public.warranty_registration_history (registration_id, changed_at desc);

create index if not exists dealer_account_aliases_dealer_idx
  on public.dealer_account_aliases (dealer_account_id);


-- ---------------------------------------------------------------------
-- 5) updated_at triggers (idempotent, per-table — matches phase35 pattern)
-- ---------------------------------------------------------------------

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

-- Enforce serial-number normalisation at the DB level so no writer
-- (sync, RPC, manual SQL) can ever bypass it. machine_serial_raw
-- preserves the original. machine_serial_number stays NON-unique.
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

  -- Preserve original only on insert, or on update when it's still empty.
  if (tg_op = 'INSERT' and new.machine_serial_raw is null)
     or (tg_op = 'UPDATE' and (new.machine_serial_raw is null
                               or length(trim(new.machine_serial_raw)) = 0)) then
    new.machine_serial_raw := v_raw;
  end if;

  -- trim → collapse internal whitespace → uppercase
  new.machine_serial_number :=
    upper(regexp_replace(trim(v_raw), '\s+', '', 'g'));

  return new;
end;
$$;

drop trigger if exists trg_wr_normalize_serial on public.warranty_registrations;
create trigger trg_wr_normalize_serial
  before insert or update of machine_serial_number, machine_serial_raw
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


-- ---------------------------------------------------------------------
-- 6) RLS + grants
-- ---------------------------------------------------------------------

-- ---- Master table -----
alter table public.warranty_registrations enable row level security;

-- Internal Timan roles (backend + service) see everything
drop policy if exists wr_internal_select on public.warranty_registrations;
create policy wr_internal_select
  on public.warranty_registrations
  for select
  to authenticated
  using ( public.is_timan_global_warranty() );

-- Dealer / importer / service partner / seller: scoped via helper.
-- Unmatched rows (dealer_account_id NULL) are NEVER visible to scoped users;
-- only internal roles see them — exactly what dealer-matching backend needs.
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

-- NO insert/update/delete policies for authenticated.
-- Only service_role (sync edge function + backend admin RPCs) writes.

grant select on public.warranty_registrations to authenticated;
grant all    on public.warranty_registrations to service_role;
-- intentionally NO grant to anon (contains PII).


-- ---- History table -----
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


-- ---- Alias table -----
alter table public.dealer_account_aliases enable row level security;

-- Only internal backend/service roles may read aliases. No anon. No write
-- policies for authenticated — alias approval goes through service_role
-- (later RPC / edge function), so this stays tight.
drop policy if exists daa_internal_select on public.dealer_account_aliases;
create policy daa_internal_select
  on public.dealer_account_aliases
  for select
  to authenticated
  using ( public.is_timan_global_warranty() );

grant select on public.dealer_account_aliases to authenticated;
grant all    on public.dealer_account_aliases to service_role;
-- intentionally NO grant to anon.


-- ---------------------------------------------------------------------
-- 7) View: latest warranty registration per serial number
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
-- 8) RPC: partner_map_machine_stats(dealer_id)
--    Returns AGGREGATES only. NEVER exposes:
--      customer_name, customer_address, customer_phone, customer_email
--    Caller scope is enforced inside the function.
--    Only counts MATCHED + ACTIVE registrations.
--
--    Counters:
--      total_machines      = COUNT(DISTINCT machine_serial_number)
--                            → this is what Partnerkort shows as
--                            "Antal registrerede maskiner".
--      total_registrations = COUNT(*) raw rows (re-registrations,
--                            ownership transfers etc. inflate this).
--      serial_count        = alias for total_machines, kept for clarity
--                            and backwards compatibility with consumers.
-- ---------------------------------------------------------------------

create or replace function public.partner_map_machine_stats(p_dealer_id uuid)
returns table (
  dealer_account_id   uuid,
  total_machines      integer,   -- distinct serial numbers (Partnerkort metric)
  total_registrations integer,   -- raw row count
  serial_count        integer,   -- == total_machines (kept for clarity)
  latest_delivery     date,
  models              jsonb      -- {"X40 Pro": 3, "Z20": 2}
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
         and dealer_match_status = 'matched'
         and is_active_in_source = true
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

comment on function public.partner_map_machine_stats(uuid) is
  'Aggregated machine stats for Partnerkort. NEVER returns customer PII (name, address, phone, email). Scope-checked against caller. Only counts matched + active registrations. total_machines = distinct serial numbers (the Partnerkort headline metric); total_registrations = raw row count.';

revoke all on function public.partner_map_machine_stats(uuid) from public;
grant execute on function public.partner_map_machine_stats(uuid) to authenticated;


-- =====================================================================
-- Verify (manual):
--
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('warranty_registrations',
--                         'warranty_registration_history',
--                         'dealer_account_aliases');
--
--   select policyname, cmd from pg_policies
--    where schemaname='public'
--      and tablename in ('warranty_registrations',
--                        'warranty_registration_history',
--                        'dealer_account_aliases');
--
--   -- Should return zero rows (no anon access):
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_name in ('warranty_registrations',
--                         'warranty_registration_history',
--                         'dealer_account_aliases')
--      and grantee='anon';
--
--   -- Smoke test the RPC (as internal user):
--   select * from public.partner_map_machine_stats(
--     (select id from public.dealer_accounts limit 1)
--   );
-- =====================================================================
