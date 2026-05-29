-- Phase 48 — Tilføj dealer_account_number til budget_references.
--
-- Baggrund: budget_references gemmer i dag kun dealer_name som fritekst-label
-- ("Firma · 123456 · AB"). Det betyder vi ikke kan koble referencer pålideligt
-- til en specifik forhandlerkonto i CRM uden at risikere mismatch på navne.
--
-- Denne migration tilføjer dealer_account_number som primær kobling. Gamle
-- rækker uden værdi vises fortsat via fallback (navne-match) i UI'et og
-- markeres tydeligt som "Ikke sikkert matchet" hvis fallback ikke kan
-- bekræftes.
--
-- Additiv og idempotent. Påvirker IKKE budgettal eller gemmeflow.

ALTER TABLE public.budget_references
  ADD COLUMN IF NOT EXISTS dealer_account_number text;

CREATE INDEX IF NOT EXISTS budget_references_dealer_account_idx
  ON public.budget_references (dealer_account_number)
  WHERE dealer_account_number IS NOT NULL;

COMMENT ON COLUMN public.budget_references.dealer_account_number IS
  'Forhandlerkontonummer (DealerAccount.account_number) for den valgte forhandler i reference-modal. Primær kobling til forhandler. Gamle rækker uden værdi vises via navne-fallback.';
