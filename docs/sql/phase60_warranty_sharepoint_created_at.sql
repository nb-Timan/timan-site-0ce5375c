-- Phase 60: store the SharePoint item's original Created date.
--
-- The portal "Oprettet" column must always reflect the immutable original
-- SharePoint createdDateTime — not Modified, not the import date, not
-- Supabase's own created_at. Previously the sync only wrote
-- sharepoint_modified_at, so the UI fell back to created_at (the import
-- run date), making every row appear created on the import day.
--
-- Safe to run multiple times.

ALTER TABLE public.warranty_registrations
  ADD COLUMN IF NOT EXISTS sharepoint_created_at timestamptz;

CREATE INDEX IF NOT EXISTS warranty_registrations_sp_created_at_idx
  ON public.warranty_registrations (sharepoint_created_at DESC);

COMMENT ON COLUMN public.warranty_registrations.sharepoint_created_at IS
  'Original SharePoint item createdDateTime — immutable, used as "Oprettet".';
