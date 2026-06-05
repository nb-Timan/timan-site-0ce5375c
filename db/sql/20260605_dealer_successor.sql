-- 20260605_dealer_successor.sql
--
-- Additiv migration — tilføjer "efterfølger-forhandler" (successor) felter
-- til public.dealer_accounts.
--
-- Mål:
--   En tidligere forhandler (fx AP Motorcenter) som er spærret eller lukket
--   skal beholdes i tabellen så historik bevares. Fremadrettet ansvar
--   (service / warranty / CRM / ordrer) kan kobles til en aktiv efterfølger
--   (fx Reesink) via en manuel pegepind.
--
-- Sikkerhed:
--   * Ingen DROP, ingen TRUNCATE, ingen sletning af eksisterende data.
--   * Ingen ændring af eksisterende RLS-policies.
--   * Alle felter er nullable og defaulter til NULL — eksisterende rækker
--     ændres ikke.
--   * Kører idempotent (ADD COLUMN IF NOT EXISTS).
--   * Ingen automatisk historikflytning. Ingen ændring af warranty_registrations,
--     configurations, dealer_account_aliases eller andre tabeller.
--
-- Status afledes i app-laget:
--   is_deleted = true  →  "Lukket"
--   is_blocked = true  →  "Spærret"
--   ellers             →  "Aktiv"

BEGIN;

ALTER TABLE public.dealer_accounts
  ADD COLUMN IF NOT EXISTS successor_dealer_id uuid NULL
    REFERENCES public.dealer_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS successor_dealer_account_number text NULL,
  ADD COLUMN IF NOT EXISTS closed_reason text NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

-- En forhandler må ikke være sin egen efterfølger.
ALTER TABLE public.dealer_accounts
  DROP CONSTRAINT IF EXISTS dealer_accounts_successor_not_self;
ALTER TABLE public.dealer_accounts
  ADD CONSTRAINT dealer_accounts_successor_not_self
  CHECK (successor_dealer_id IS NULL OR successor_dealer_id <> id);

-- Hurtige opslag: "hvem er efterfølger til X?"
CREATE INDEX IF NOT EXISTS dealer_accounts_successor_dealer_id_idx
  ON public.dealer_accounts(successor_dealer_id)
  WHERE successor_dealer_id IS NOT NULL;

COMMENT ON COLUMN public.dealer_accounts.successor_dealer_id IS
  'Portalstyret. Peger på den aktive forhandler der har overtaget forpligtelser. '
  'Må aldrig overskrives af SharePoint-sync. Ingen automatisk historikflytning.';
COMMENT ON COLUMN public.dealer_accounts.successor_dealer_account_number IS
  'Snapshot af efterfølgerens account_number (bekvemmelighed til lister/eksporter).';
COMMENT ON COLUMN public.dealer_accounts.closed_reason IS
  'Kort tekstforklaring på hvorfor forhandleren er lukket/spærret (portalstyret).';
COMMENT ON COLUMN public.dealer_accounts.closed_at IS
  'Tidspunkt for portalstyret lukning. Adskilt fra blocked_at/deleted_at.';

COMMIT;
