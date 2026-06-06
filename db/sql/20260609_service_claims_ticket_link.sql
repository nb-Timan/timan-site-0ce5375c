-- 2026-06-09 — Service Claims: link to source service_tickets + dealer-request workflow
--
-- Adds a nullable reference from a claim back to the originating service ticket
-- so dealers (and internal staff) can convert a ticket into a claim while the
-- ticket itself stays open. Also documents the new claim status value used by
-- the dealer self-service "Ansøg om claim fra sag" flow.
--
-- Status column on service_claims is plain text (no enum / no check constraint
-- in the current schema) so the new `pending_service_review` value does NOT
-- require a constraint change. If you later add a CHECK constraint, include
-- 'pending_service_review' in the allowed list.
--
-- Safe to re-run.

ALTER TABLE public.service_claims
  ADD COLUMN IF NOT EXISTS service_ticket_id uuid NULL
    REFERENCES public.service_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_claims_service_ticket_id
  ON public.service_claims(service_ticket_id);

-- Helpful for the admin "Afventer servicegodkendelse" queue and for dealer
-- "Mine claim-ansøgninger" filtered queries.
CREATE INDEX IF NOT EXISTS idx_service_claims_status
  ON public.service_claims(status);

CREATE INDEX IF NOT EXISTS idx_service_claims_dealer_company
  ON public.service_claims(dealer_company);
