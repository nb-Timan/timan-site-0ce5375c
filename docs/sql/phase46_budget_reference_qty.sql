-- Phase 46 — Per-reference delta quantity on budget_references.
--
-- A budget cell (year × seller × product × month × budget_type) holds a
-- single total qty. Each row in budget_references explains WHO/WHY some
-- of those units exist. Previously the row only stored old/new snapshots
-- of the cell total — which made it look as if every reference "owned"
-- the entire cell value.
--
-- This migration adds delta_qty so each reference carries the number of
-- units the user actually attached in that action. Existing references
-- keep delta_qty = NULL (treated as "unknown" in the UI).
--
-- Additive only. Safe to re-run.

ALTER TABLE public.budget_references
  ADD COLUMN IF NOT EXISTS delta_qty integer;

COMMENT ON COLUMN public.budget_references.delta_qty IS
  'Antal stk. denne reference dækker over (fx +2 stk. tilføjet i maj). NULL = ukendt (gamle rækker).';
