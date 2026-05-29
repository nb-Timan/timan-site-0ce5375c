-- Phase 47 — Group references that belong to the SAME budget change.
--
-- Background: A single user action ("change arbejdsbudget +2 in May") may
-- spawn several budget_references rows (one per dealer). Without a group id
-- there is no way to know which rows belong to that change, so the modal
-- can't:
--   (a) cap the distribution at the change's total qty, or
--   (b) replace the existing distribution when the user re-opens it.
--
-- This migration adds reference_group_id (typically the audit_log row id
-- for that change) so all rows from one save share a key.
--
-- Additive only. Safe to re-run.

ALTER TABLE public.budget_references
  ADD COLUMN IF NOT EXISTS reference_group_id text;

CREATE INDEX IF NOT EXISTS budget_references_group_idx
  ON public.budget_references (reference_group_id)
  WHERE reference_group_id IS NOT NULL;

COMMENT ON COLUMN public.budget_references.reference_group_id IS
  'Stabil nøgle for den budgetændring rækken hører til (typisk audit_log.id). Alle rækker fra samme gem deler samme id; ved redigering slettes gruppen og indsættes igen.';
