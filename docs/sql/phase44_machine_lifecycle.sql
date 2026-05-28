-- =====================================================================
-- Phase 44 - Machine Lifecycle Platform (additive, idempotent)
-- ---------------------------------------------------------------------
-- Adds the data foundation for:
--   * Service tickets
--   * Machine search
--   * Machine lifecycle profile
--   * Machine activity log
--   * Comments (external + internal)
--   * Machine documents (metadata only - no bucket yet)
--   * Owner history
--
-- SAFE / ADDITIVE:
--   * No existing tables are altered, truncated, reseeded or dropped.
--   * Claims, TSB, Warranty, Serviceinformation and Service registration
--     logic and tables are NOT touched.
--   * Storage buckets are NOT created (metadata only).
--   * No data backfill / migration.
--   * RLS is enabled only on the new tables.
--
-- Helpers used:
--   * public.is_timan_backend()        (existing)
--   * public.current_user_dealer_number() (existing, phase 43)
--   * public.is_timan_internal()       (NEW - timan_backend / seller / service)
-- =====================================================================

-- =====================================================================
-- Supabase Data API GRANTs
-- =====================================================================
-- PostgREST / GraphQL / supabase-js require explicit schema + table grants.
-- RLS remains enabled on all tables and controls which rows are visible.
-- GRANT only allows the API to reach the table; it does NOT bypass RLS.
--
-- Anon is NOT granted on Machine Lifecycle tables because:
--   * Every view requires an authenticated dealer/importer/service partner.
--   * No public/anonymous machine data is exposed.
-- =====================================================================
grant usage on schema public to authenticated;

-- =====================================================================
-- Helper: is_timan_internal()
-- Returns true if the current auth.jwt() email belongs to an app_user
-- whose portal_role is one of: timan_backend, timan_seller, timan_service.
-- =====================================================================
create or replace function public.is_timan_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and portal_role in ('timan_backend', 'timan_seller', 'timan_service')
  );
$$;

-- =====================================================================
-- 1. public.machines
-- =====================================================================
create table if not exists public.machines (
  id                  uuid primary key default gen_random_uuid(),
  serial_number       text not null,
  machine_number      text,
  machine_type        text not null,
  model               text,
  production_year     integer,
  dealer_account_id   uuid references public.dealer_accounts(id) on delete set null,
  dealer_number       text,
  dealer_name         text,
  customer_name       text,
  customer_email      text,
  customer_phone      text,
  seller_user_id      uuid,
  seller_email        text,
  seller_initials     text,
  warranty_start_date date,
  warranty_end_date   date,
  current_hours       integer,
  created_by_user_id  uuid,
  created_by_email    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists machines_serial_lower_uidx
  on public.machines (lower(serial_number));
create index if not exists machines_dealer_number_idx
  on public.machines (dealer_number);
create index if not exists machines_dealer_account_id_idx
  on public.machines (dealer_account_id);
create index if not exists machines_machine_type_idx
  on public.machines (machine_type);

grant select, insert, update, delete on public.machines to authenticated;
grant all on public.machines to service_role;

-- =====================================================================
-- 2. public.machine_owner_history
-- =====================================================================
create table if not exists public.machine_owner_history (
  id                uuid primary key default gen_random_uuid(),
  machine_id        uuid references public.machines(id) on delete cascade,
  serial_number     text not null,
  dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  dealer_number     text,
  dealer_name       text,
  customer_name     text,
  customer_email    text,
  from_date         date,
  to_date           date,
  created_at        timestamptz not null default now()
);

create index if not exists machine_owner_history_machine_id_idx
  on public.machine_owner_history (machine_id);
create index if not exists machine_owner_history_serial_idx
  on public.machine_owner_history (lower(serial_number));
create index if not exists machine_owner_history_dealer_number_idx
  on public.machine_owner_history (dealer_number);

grant select, insert, update, delete on public.machine_owner_history to authenticated;
grant all on public.machine_owner_history to service_role;

-- =====================================================================
-- 3. public.service_tickets
-- =====================================================================
create table if not exists public.service_tickets (
  id                    uuid primary key default gen_random_uuid(),
  ticket_number         text unique,
  machine_id            uuid references public.machines(id) on delete set null,
  serial_number         text not null,
  machine_type          text,
  dealer_account_id     uuid references public.dealer_accounts(id) on delete set null,
  dealer_number         text,
  dealer_name           text,
  customer_name         text,
  customer_email        text,
  customer_phone        text,
  contact_person        text,
  contact_email         text,
  contact_phone         text,
  operating_hours       integer,
  title                 text not null,
  description           text not null,
  priority              text not null default 'normal',
  status                text not null default 'created',
  category              text,
  assigned_user_id      uuid,
  assigned_email        text,
  assigned_name         text,
  related_claim_id      uuid,
  related_tsb_id        uuid,
  related_warranty_id   uuid,
  closed_at             timestamptz,
  created_by_user_id    uuid,
  created_by_email      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- CHECK constraints (idempotent via DO block)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_tickets_status_chk') then
    alter table public.service_tickets
      add constraint service_tickets_status_chk
      check (status in (
        'created','in_progress','waiting_timan','waiting_dealer','waiting_customer',
        'waiting_parts','resolved','closed',
        'converted_to_claim','converted_to_warranty','converted_to_tsb'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'service_tickets_priority_chk') then
    alter table public.service_tickets
      add constraint service_tickets_priority_chk
      check (priority in ('low','normal','high','critical_machine_stopped'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'service_tickets_category_chk') then
    alter table public.service_tickets
      add constraint service_tickets_category_chk
      check (category is null or category in (
        'engine','hydraulics','electronics','remote_control','transmission',
        'service','spare_part','software','safety','other'
      ));
  end if;
end$$;

create index if not exists service_tickets_serial_idx        on public.service_tickets (lower(serial_number));
create index if not exists service_tickets_machine_id_idx    on public.service_tickets (machine_id);
create index if not exists service_tickets_dealer_number_idx on public.service_tickets (dealer_number);
create index if not exists service_tickets_status_idx        on public.service_tickets (status);
create index if not exists service_tickets_priority_idx      on public.service_tickets (priority);
create index if not exists service_tickets_created_at_idx    on public.service_tickets (created_at desc);

grant select, insert, update, delete on public.service_tickets to authenticated;
grant all on public.service_tickets to service_role;

-- =====================================================================
-- 4. public.service_ticket_comments
-- =====================================================================
create table if not exists public.service_ticket_comments (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references public.service_tickets(id) on delete cascade,
  comment_type        text not null default 'external',
  body                text not null,
  created_by_user_id  uuid,
  created_by_email    text,
  created_by_name     text,
  created_at          timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_ticket_comments_type_chk') then
    alter table public.service_ticket_comments
      add constraint service_ticket_comments_type_chk
      check (comment_type in ('external','internal'));
  end if;
end$$;

create index if not exists service_ticket_comments_ticket_id_idx
  on public.service_ticket_comments (ticket_id);
create index if not exists service_ticket_comments_created_at_idx
  on public.service_ticket_comments (created_at desc);

grant select, insert, update, delete on public.service_ticket_comments to authenticated;
grant all on public.service_ticket_comments to service_role;

-- =====================================================================
-- 5. public.machine_activity_log
-- =====================================================================
create table if not exists public.machine_activity_log (
  id                    uuid primary key default gen_random_uuid(),
  machine_id            uuid references public.machines(id) on delete set null,
  serial_number         text not null,
  event_type            text not null,
  title                 text not null,
  description           text,
  related_entity_type   text,
  related_entity_id     uuid,
  visibility            text not null default 'dealer_visible',
  created_by_user_id    uuid,
  created_by_email      text,
  created_at            timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'machine_activity_log_visibility_chk') then
    alter table public.machine_activity_log
      add constraint machine_activity_log_visibility_chk
      check (visibility in ('internal','dealer_visible'));
  end if;
end$$;

create index if not exists machine_activity_log_machine_id_idx on public.machine_activity_log (machine_id);
create index if not exists machine_activity_log_serial_idx     on public.machine_activity_log (lower(serial_number));
create index if not exists machine_activity_log_created_at_idx on public.machine_activity_log (created_at desc);

grant select, insert, update, delete on public.machine_activity_log to authenticated;
grant all on public.machine_activity_log to service_role;

-- =====================================================================
-- 6. public.machine_documents (metadata only - no storage bucket yet)
-- =====================================================================
create table if not exists public.machine_documents (
  id                  uuid primary key default gen_random_uuid(),
  machine_id          uuid references public.machines(id) on delete set null,
  serial_number       text not null,
  related_entity_type text,
  related_entity_id   uuid,
  file_name           text not null,
  file_type           text,
  file_url            text,
  storage_bucket      text,
  storage_path        text,
  visibility          text not null default 'dealer_visible',
  uploaded_by_user_id uuid,
  uploaded_by_email   text,
  uploaded_at         timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'machine_documents_visibility_chk') then
    alter table public.machine_documents
      add constraint machine_documents_visibility_chk
      check (visibility in ('internal','dealer_visible'));
  end if;
end$$;

create index if not exists machine_documents_machine_id_idx on public.machine_documents (machine_id);
create index if not exists machine_documents_serial_idx     on public.machine_documents (lower(serial_number));

grant select, insert, update, delete on public.machine_documents to authenticated;
grant all on public.machine_documents to service_role;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.machines                 enable row level security;
alter table public.machine_owner_history    enable row level security;
alter table public.service_tickets          enable row level security;
alter table public.service_ticket_comments  enable row level security;
alter table public.machine_activity_log     enable row level security;
alter table public.machine_documents        enable row level security;

-- ---------------------------------------------------------------------
-- machines
-- ---------------------------------------------------------------------
drop policy if exists machines_select on public.machines;
create policy machines_select on public.machines
  for select to authenticated
  using (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists machines_insert on public.machines;
create policy machines_insert on public.machines
  for insert to authenticated
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists machines_update on public.machines;
create policy machines_update on public.machines
  for update to authenticated
  using (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  )
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists machines_delete_internal on public.machines;
create policy machines_delete_internal on public.machines
  for delete to authenticated
  using (public.is_timan_internal() or public.is_timan_backend());

-- ---------------------------------------------------------------------
-- machine_owner_history
-- ---------------------------------------------------------------------
drop policy if exists moh_select on public.machine_owner_history;
create policy moh_select on public.machine_owner_history
  for select to authenticated
  using (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists moh_write_internal on public.machine_owner_history;
create policy moh_write_internal on public.machine_owner_history
  for all to authenticated
  using (public.is_timan_internal() or public.is_timan_backend())
  with check (public.is_timan_internal() or public.is_timan_backend());

-- ---------------------------------------------------------------------
-- service_tickets
-- ---------------------------------------------------------------------
drop policy if exists service_tickets_select on public.service_tickets;
create policy service_tickets_select on public.service_tickets
  for select to authenticated
  using (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_tickets_insert on public.service_tickets;
create policy service_tickets_insert on public.service_tickets
  for insert to authenticated
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_tickets_update on public.service_tickets;
create policy service_tickets_update on public.service_tickets
  for update to authenticated
  using (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  )
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_tickets_delete_internal on public.service_tickets;
create policy service_tickets_delete_internal on public.service_tickets
  for delete to authenticated
  using (public.is_timan_internal() or public.is_timan_backend());

-- ---------------------------------------------------------------------
-- service_ticket_comments
--   Internal comments are visible only to internal users.
--   External comments follow ticket dealer scope.
-- ---------------------------------------------------------------------
drop policy if exists stc_select on public.service_ticket_comments;
create policy stc_select on public.service_ticket_comments
  for select to authenticated
  using (
    (
      comment_type = 'internal'
      and (public.is_timan_internal() or public.is_timan_backend())
    )
    or (
      comment_type = 'external'
      and exists (
        select 1 from public.service_tickets t
        where t.id = service_ticket_comments.ticket_id
          and (
            public.is_timan_internal()
            or public.is_timan_backend()
            or (t.dealer_number is not null and t.dealer_number = public.current_user_dealer_number())
          )
      )
    )
  );

drop policy if exists stc_insert on public.service_ticket_comments;
create policy stc_insert on public.service_ticket_comments
  for insert to authenticated
  with check (
    -- Internal comments may only be created by internal users.
    (
      comment_type = 'internal'
      and (public.is_timan_internal() or public.is_timan_backend())
    )
    or (
      comment_type = 'external'
      and exists (
        select 1 from public.service_tickets t
        where t.id = service_ticket_comments.ticket_id
          and (
            public.is_timan_internal()
            or public.is_timan_backend()
            or (t.dealer_number is not null and t.dealer_number = public.current_user_dealer_number())
          )
      )
    )
  );

drop policy if exists stc_update_internal on public.service_ticket_comments;
create policy stc_update_internal on public.service_ticket_comments
  for update to authenticated
  using (public.is_timan_internal() or public.is_timan_backend())
  with check (public.is_timan_internal() or public.is_timan_backend());

drop policy if exists stc_delete_internal on public.service_ticket_comments;
create policy stc_delete_internal on public.service_ticket_comments
  for delete to authenticated
  using (public.is_timan_internal() or public.is_timan_backend());

-- ---------------------------------------------------------------------
-- machine_activity_log
--   Internal events visible only to internal users.
--   dealer_visible events follow dealer scope via machine/serial.
-- ---------------------------------------------------------------------
drop policy if exists mal_select on public.machine_activity_log;
create policy mal_select on public.machine_activity_log
  for select to authenticated
  using (
    (
      visibility = 'internal'
      and (public.is_timan_internal() or public.is_timan_backend())
    )
    or (
      visibility = 'dealer_visible'
      and (
        public.is_timan_internal()
        or public.is_timan_backend()
        or exists (
          select 1 from public.machines m
          where m.dealer_number is not null
            and m.dealer_number = public.current_user_dealer_number()
            and (
              m.id = machine_activity_log.machine_id
              or lower(m.serial_number) = lower(machine_activity_log.serial_number)
            )
        )
      )
    )
  );

drop policy if exists mal_insert on public.machine_activity_log;
create policy mal_insert on public.machine_activity_log
  for insert to authenticated
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (
      visibility = 'dealer_visible'
      and exists (
        select 1 from public.machines m
        where m.dealer_number is not null
          and m.dealer_number = public.current_user_dealer_number()
          and (
            m.id = machine_activity_log.machine_id
            or lower(m.serial_number) = lower(machine_activity_log.serial_number)
          )
      )
    )
  );


drop policy if exists mal_write_internal on public.machine_activity_log;
create policy mal_write_internal on public.machine_activity_log
  for update to authenticated
  using (public.is_timan_internal() or public.is_timan_backend())
  with check (public.is_timan_internal() or public.is_timan_backend());

drop policy if exists mal_delete_internal on public.machine_activity_log;
create policy mal_delete_internal on public.machine_activity_log
  for delete to authenticated
  using (public.is_timan_internal() or public.is_timan_backend());

-- ---------------------------------------------------------------------
-- machine_documents
-- ---------------------------------------------------------------------
drop policy if exists md_select on public.machine_documents;
create policy md_select on public.machine_documents
  for select to authenticated
  using (
    (
      visibility = 'internal'
      and (public.is_timan_internal() or public.is_timan_backend())
    )
    or (
      visibility = 'dealer_visible'
      and (
        public.is_timan_internal()
        or public.is_timan_backend()
        or exists (
          select 1 from public.machines m
          where m.dealer_number is not null
            and m.dealer_number = public.current_user_dealer_number()
            and (
              m.id = machine_documents.machine_id
              or lower(m.serial_number) = lower(machine_documents.serial_number)
            )
        )
      )
    )
  );

drop policy if exists md_insert on public.machine_documents;
create policy md_insert on public.machine_documents
  for insert to authenticated
  with check (
    public.is_timan_internal()
    or public.is_timan_backend()
    or (
      visibility = 'dealer_visible'
      and exists (
        select 1 from public.machines m
        where m.dealer_number is not null
          and m.dealer_number = public.current_user_dealer_number()
          and (
            m.id = machine_documents.machine_id
            or lower(m.serial_number) = lower(machine_documents.serial_number)
          )
      )
    )
  );


drop policy if exists md_update_internal on public.machine_documents;
create policy md_update_internal on public.machine_documents
  for update to authenticated
  using (public.is_timan_internal() or public.is_timan_backend())
  with check (public.is_timan_internal() or public.is_timan_backend());

drop policy if exists md_delete_internal on public.machine_documents;
create policy md_delete_internal on public.machine_documents
  for delete to authenticated
  using (public.is_timan_internal() or public.is_timan_backend());

-- =====================================================================
-- END phase 44
-- =====================================================================
