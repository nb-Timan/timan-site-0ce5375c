-- Adds optional submodule_key to portal_change_log so a single module entry
-- (e.g. module_key = 'service') can be attributed to a specific submodule
-- card inside the corresponding portal area (e.g. submodule_key =
-- 'service_tickets', 'claims', 'warranty_reg', 'service_maintenance',
-- 'machine_search', 'tsb_portal'). Existing rows keep working as
-- module-level changes when submodule_key is null.

ALTER TABLE public.portal_change_log
  ADD COLUMN IF NOT EXISTS submodule_key text;

CREATE INDEX IF NOT EXISTS portal_change_log_submodule_key_idx
  ON public.portal_change_log(submodule_key);
