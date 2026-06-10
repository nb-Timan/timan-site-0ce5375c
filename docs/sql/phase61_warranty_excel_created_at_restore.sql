-- Phase 61: restore warranty_registrations.sharepoint_created_at from Excel.
--
-- The original Excel export is the authoritative source of truth for the
-- immutable "Oprettet" date. This script overwrites sharepoint_created_at
-- for every row whose sharepoint_form_id matches a row in the Excel
-- VALUES list — regardless of any previously stored value.
--
-- Update rule (intentionally unconditional):
--   where wr.sharepoint_form_id = v.sharepoint_form_id;
--
-- Combined with the sync change in sharepoint-warranty-sync (existing DB
-- value wins over SP createdDateTime), any value restored here is
-- protected from being overwritten by a later SharePoint sync.
--
-- Only the sharepoint_created_at column is touched. No other fields.
--
-- HOW TO USE
-- 1. Replace the rows inside the VALUES (...) block with the full Excel
--    export (sharepoint_form_id, created_at_iso). Timestamps must be ISO
--    8601 with timezone, e.g. '2025-06-16 09:13:10+00'.
-- 2. Run in the Supabase SQL editor.
-- 3. Verify SP-117 still reads 2025-06-16 09:13:10.
-- 4. Run one Warranty sync — sharepoint_created_at must stay unchanged.
--
-- Safe to re-run.

BEGIN;

WITH v (sharepoint_form_id, sharepoint_created_at) AS (
  VALUES
    -- (form_id, original Excel created date)
    (117::int, '2025-06-16 09:13:10+00'::timestamptz)
    -- , (118, '2025-06-16 10:02:44+00')
    -- , (119, '2025-06-17 08:31:09+00')
    -- ...paste the remaining Excel rows here...
)
UPDATE public.warranty_registrations wr
   SET sharepoint_created_at = v.sharepoint_created_at
  FROM v
 WHERE wr.sharepoint_form_id = v.sharepoint_form_id;

-- Sanity check — should return SP-117 with 2025-06-16 09:13:10+00.
-- SELECT sharepoint_form_id, sharepoint_created_at
--   FROM public.warranty_registrations
--  WHERE sharepoint_form_id = 117;

COMMIT;
