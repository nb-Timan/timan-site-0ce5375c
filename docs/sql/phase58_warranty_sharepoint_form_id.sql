-- Phase 58: Add SharePoint ID_Forms (form id) to warranty_registrations.
--
-- Purpose:
--   The certificate number shown in the portal must match the SharePoint
--   "ID_Forms" column (e.g. 224), not the Graph API item id. This adds a
--   dedicated nullable integer column so the sync can populate it without
--   touching the existing sharepoint_item_id contract.
--
-- Safe to run multiple times.

ALTER TABLE public.warranty_registrations
  ADD COLUMN IF NOT EXISTS sharepoint_form_id integer;

CREATE INDEX IF NOT EXISTS warranty_registrations_form_id_idx
  ON public.warranty_registrations (sharepoint_form_id DESC);

COMMENT ON COLUMN public.warranty_registrations.sharepoint_form_id IS
  'SharePoint list field ID_Forms — used as visible certificate number (SP-{id}).';
