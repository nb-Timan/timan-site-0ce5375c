-- =====================================================================
-- Phase 18 — Dealer notes (Notehistorik)
--
-- Internal Timan note history per dealer. NEVER visible to external
-- dealer / service partner / importer users.
--
-- Safe to run multiple times.
-- =====================================================================

create table if not exists public.dealer_notes (
  id                  uuid primary key default gen_random_uuid(),
  dealer_number       text not null,
  dealer_name         text,
  created_by_user_id  uuid,
  created_by_email    text,
  seller_initials     text,
  note_type           text not null default 'general'
                      check (note_type in ('general','call','visit','follow_up','demo','offer','service')),
  note_text           text not null,
  linked_activity_id  uuid,
  follow_up_date      timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists dealer_notes_dealer_idx     on public.dealer_notes (dealer_number);
create index if not exists dealer_notes_created_idx    on public.dealer_notes (created_at desc);
create index if not exists dealer_notes_followup_idx   on public.dealer_notes (follow_up_date);
create index if not exists dealer_notes_seller_idx     on public.dealer_notes (seller_initials);

alter table public.dealer_notes enable row level security;

-- Helpers from previous phases:
--   public.is_timan_backend()   — backend admins
-- We also need a "is internal Timan user" check (backend or seller/service).

create or replace function public.is_timan_internal()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active = true
      and portal_role in ('timan_backend','timan_seller','timan_service')
  );
$$;

drop policy if exists dealer_notes_select_internal on public.dealer_notes;
drop policy if exists dealer_notes_insert_internal on public.dealer_notes;
drop policy if exists dealer_notes_update_backend  on public.dealer_notes;
drop policy if exists dealer_notes_delete_backend  on public.dealer_notes;

create policy dealer_notes_select_internal
  on public.dealer_notes for select
  to authenticated
  using (public.is_timan_internal());

create policy dealer_notes_insert_internal
  on public.dealer_notes for insert
  to authenticated
  with check (public.is_timan_internal());

create policy dealer_notes_update_backend
  on public.dealer_notes for update
  to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

create policy dealer_notes_delete_backend
  on public.dealer_notes for delete
  to authenticated
  using (public.is_timan_backend());

-- =====================================================================
-- Verify:
--   select * from public.dealer_notes limit 5;
-- =====================================================================
