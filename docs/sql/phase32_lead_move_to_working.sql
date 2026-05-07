-- phase32_lead_move_to_working.sql
-- Adds an explicit "move to working forecast" qty on CRM leads.
--
--   crm_leads.move_to_working_qty INTEGER  (default 0)
--
-- Only when this value is > 0 should the lead contribute to Arbejdsbudget
-- (working forecast) for the lead's machine model in the month of its
-- Forventet lukkedato (expected_close_date).
--
-- This field is INDEPENDENT from estimated_value / probability — those
-- still drive pipeline value as today and are NOT used for Arbejdsbudget.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS move_to_working_qty INTEGER NOT NULL DEFAULT 0
  CHECK (move_to_working_qty >= 0);

-- Optional helper index for budget aggregation queries.
CREATE INDEX IF NOT EXISTS crm_leads_move_to_working_idx
  ON public.crm_leads (move_to_working_qty)
  WHERE move_to_working_qty > 0;
