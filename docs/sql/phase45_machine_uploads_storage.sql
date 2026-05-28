-- =====================================================================
-- Phase 45 — Storage bucket + RLS policies for machine uploads
--
-- Purpose:
--   Prepare a private Supabase Storage bucket `machine-uploads` that will
--   later hold files attached to service tickets and machine profiles.
--   This migration is additive and safe to re-run.
--
-- Path convention (enforced by RLS for dealer-scoped users):
--   dealer/{dealer_number}/machine/{serial_number}/ticket/{ticket_id}/{filename}
--   Example:
--     dealer/11913/machine/411000-00-1535/ticket/abc-uuid/billede.jpg
--
-- Helpers reused (must already exist):
--   public.is_timan_internal()         -- timan_backend/seller/service
--   public.is_timan_backend()
--   public.current_user_dealer_number() -- dealer_number for caller
--
-- This file does NOT:
--   - touch any other bucket
--   - disable RLS
--   - drop unrelated policies
--   - change anything in Claims, TSB, Warranty, Service registration
--   - grant anon/public access
--
-- HOW TO RUN
--   Open Supabase → SQL Editor, paste this file, click Run.
--   (Do NOT execute automatically from the app.)
-- =====================================================================

-- ---------- 1) Create the private bucket -----------------------------------
insert into storage.buckets (id, name, public)
values ('machine-uploads', 'machine-uploads', false)
on conflict (id) do nothing;

-- ---------- 2) Drop only the policies this migration owns ------------------
-- (Idempotent; scoped by name so we never touch unrelated policies.)
drop policy if exists "machine_uploads_select_internal"        on storage.objects;
drop policy if exists "machine_uploads_select_dealer_scoped"   on storage.objects;
drop policy if exists "machine_uploads_insert_internal"        on storage.objects;
drop policy if exists "machine_uploads_insert_dealer_scoped"   on storage.objects;
drop policy if exists "machine_uploads_update_internal"        on storage.objects;
drop policy if exists "machine_uploads_update_dealer_scoped"   on storage.objects;
drop policy if exists "machine_uploads_delete_internal"        on storage.objects;
drop policy if exists "machine_uploads_delete_dealer_scoped"   on storage.objects;

-- RLS is already enabled on storage.objects by Supabase. We do NOT alter it.

-- ---------- 3) SELECT policies --------------------------------------------
create policy "machine_uploads_select_internal"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.is_timan_internal()
);

create policy "machine_uploads_select_dealer_scoped"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.current_user_dealer_number() is not null
  and name like 'dealer/' || public.current_user_dealer_number() || '/%'
);

-- ---------- 4) INSERT policies --------------------------------------------
create policy "machine_uploads_insert_internal"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'machine-uploads'
  and public.is_timan_internal()
);

create policy "machine_uploads_insert_dealer_scoped"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'machine-uploads'
  and public.current_user_dealer_number() is not null
  and name like 'dealer/' || public.current_user_dealer_number() || '/%'
);

-- ---------- 5) UPDATE policies --------------------------------------------
create policy "machine_uploads_update_internal"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.is_timan_internal()
)
with check (
  bucket_id = 'machine-uploads'
  and public.is_timan_internal()
);

create policy "machine_uploads_update_dealer_scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.current_user_dealer_number() is not null
  and name like 'dealer/' || public.current_user_dealer_number() || '/%'
)
with check (
  bucket_id = 'machine-uploads'
  and public.current_user_dealer_number() is not null
  and name like 'dealer/' || public.current_user_dealer_number() || '/%'
);

-- ---------- 6) DELETE policies --------------------------------------------
create policy "machine_uploads_delete_internal"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.is_timan_internal()
);

create policy "machine_uploads_delete_dealer_scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'machine-uploads'
  and public.current_user_dealer_number() is not null
  and name like 'dealer/' || public.current_user_dealer_number() || '/%'
);

-- ---------- 7) GRANTS ------------------------------------------------------
-- Supabase ships default grants on the `storage` schema for the
-- `authenticated` and `service_role` roles. Nothing extra is required for
-- this bucket — RLS above is what gates access. We intentionally do NOT
-- grant anything to `anon` (no public access to machine-uploads).

-- =====================================================================
-- Verify (signed in via the app):
--   select * from storage.buckets where id = 'machine-uploads';
--   select policyname from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'machine_uploads_%';
-- =====================================================================
