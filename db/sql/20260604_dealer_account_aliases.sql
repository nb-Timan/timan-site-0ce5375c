-- Phase: SharePoint Warranty — manual dealer alias approvals.
--
-- Stores approved SharePoint forhandlernavn → dealer_account mappings so
-- future dry-runs (and the eventual real sync) treat them as safe matches.
--
-- Apply manually against the external Supabase project:
--   psql "$DATABASE_URL" -f db/sql/20260604_dealer_account_aliases.sql
--
-- No automatic dealer_account creation. Aliases are only written by
-- backend/service users via the sharepoint-warranty-approve-alias
-- edge function (uses the service role).

CREATE TABLE IF NOT EXISTS public.dealer_account_aliases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_alias      text NOT NULL UNIQUE,
  raw_alias             text NOT NULL,
  dealer_account_id     uuid NOT NULL REFERENCES public.dealer_accounts(id) ON DELETE CASCADE,
  dealer_account_number text,
  source                text NOT NULL DEFAULT 'manual',
  approved_by_user_id   uuid,
  approved_by_email     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_account_aliases_dealer_idx
  ON public.dealer_account_aliases (dealer_account_id);

GRANT SELECT ON public.dealer_account_aliases TO authenticated;
GRANT ALL    ON public.dealer_account_aliases TO service_role;

ALTER TABLE public.dealer_account_aliases ENABLE ROW LEVEL SECURITY;

-- Backend + Service may read aliases. Writes happen only via the edge
-- function with the service role key, so no INSERT/UPDATE/DELETE policy
-- is granted to authenticated.
DROP POLICY IF EXISTS dealer_account_aliases_select_backend_service ON public.dealer_account_aliases;
CREATE POLICY dealer_account_aliases_select_backend_service
  ON public.dealer_account_aliases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE lower(au.email) = lower(auth.jwt() ->> 'email')
        AND au.is_active = true
        AND au.approved  = true
        AND au.portal_role IN ('timan_backend', 'timan_service')
    )
  );
