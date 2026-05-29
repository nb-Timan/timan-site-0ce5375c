-- =====================================================================
-- Phase 4l — Storage bucket + RLS for sent quote/order PDFs
--
-- Purpose:
--   Create the private `sent-pdfs` bucket used by uploadSentPdf() in
--   src/lib/configurationsService.ts to persist the generated PDF of a
--   sent quote or order. Path layout:
--     <auth.uid>/<configuration_id>/<timestamp>-<filename>.pdf
--
--   Same bucket is used for both quotes and orders.
--
-- Safe to re-run. Does NOT touch other buckets, does NOT disable RLS,
-- does NOT grant anon/public access, does NOT delete data.
--
-- HOW TO RUN: Supabase → SQL Editor → paste this file → Run.
-- =====================================================================

-- 1) Create private bucket -------------------------------------------------
insert into storage.buckets (id, name, public)
values ('sent-pdfs', 'sent-pdfs', false)
on conflict (id) do nothing;

-- 2) Drop only this migration's policies (idempotent) ----------------------
drop policy if exists "sent_pdfs_select_own"      on storage.objects;
drop policy if exists "sent_pdfs_select_internal" on storage.objects;
drop policy if exists "sent_pdfs_insert_own"      on storage.objects;
drop policy if exists "sent_pdfs_update_own"      on storage.objects;
drop policy if exists "sent_pdfs_delete_internal" on storage.objects;

-- 3) SELECT: owner (path prefix = auth.uid) --------------------------------
create policy "sent_pdfs_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3b) SELECT: Timan-internal staff can see all sent PDFs -------------------
create policy "sent_pdfs_select_internal"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sent-pdfs'
  and public.is_timan_internal()
);

-- 4) INSERT: authenticated user uploads under their own folder -------------
create policy "sent_pdfs_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 5) UPDATE: owner only (rare; allows upsert metadata) ---------------------
create policy "sent_pdfs_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'sent-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 6) DELETE: Timan-internal only (no anon, no dealer self-delete) ----------
create policy "sent_pdfs_delete_internal"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sent-pdfs'
  and public.is_timan_internal()
);

-- =====================================================================
-- Verify:
--   select * from storage.buckets where id = 'sent-pdfs';
--   select policyname from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'sent_pdfs_%';
-- =====================================================================
