-- =====================================================================
-- Phase 62 — RLS SELECT access on public.configurations for CRM views.
--
-- WHY
--   public.crm_configurations_view is declared with security_invoker=on,
--   so it inherits the SELECT policies of the underlying
--   public.configurations table. Today those policies only let an
--   authenticated user read rows they themselves CREATED
--   (created_by_user_id = auth.uid()).
--
--   That breaks CRM → Tilbud / Ordrer:
--     • Timan Backend (e.g. NB) only sees rows they personally saved.
--       Quotes created by another seller (or by AKR himself) are hidden
--       even though listCrmConfigurations + isSentForCrm would otherwise
--       include them.
--     • A Timan Sælger never sees quotes the backend created on their
--       behalf using "view as <seller>".
--
--   Concrete repro: Q-20260611-435I exists in
--   public.crm_configurations_view (verified via service role), but the
--   SPA shows only Q-20260522-40Q5 because 435I was created by a
--   different auth user.
--
-- WHAT THIS DOES
--   Adds two additive SELECT policies on public.configurations:
--     1. "configurations backend select all"
--          — any active app_users row with portal_role='timan_backend'
--            can SELECT every configuration. Mirrors phase 7 / 9c.
--     2. "configurations seller select assigned"
--          — a Timan Sælger can SELECT rows where they are the
--            assigned_seller_id OR seller_email matches OR (legacy)
--            created_by_user_id matches.
--
--   Existing "own rows" policies are kept untouched.
--
-- SAFETY
--   • Additive — no DROP/UPDATE/DELETE on data, no policy removed.
--   • Does NOT change INSERT/UPDATE/DELETE policies.
--   • Does NOT touch pricing, configurator state, or any other table.
--   • Idempotent — uses DROP POLICY IF EXISTS before each CREATE.
--
-- HOW TO RUN
--   Supabase → SQL Editor → paste → Run.
-- =====================================================================

alter table public.configurations enable row level security;

-- ---------------------------------------------------------------------
-- 1) Backend users see everything.
-- ---------------------------------------------------------------------
drop policy if exists "configurations backend select all"
  on public.configurations;
create policy "configurations backend select all"
  on public.configurations
  for select
  to authenticated
  using ( public.is_timan_backend() );

-- ---------------------------------------------------------------------
-- 2) Timan Sælgere see rows assigned to them.
--    Matches the same fan-out rowVisibleToScope uses in the SPA:
--    assigned_seller_id, seller_email, or legacy created_by_user_id.
-- ---------------------------------------------------------------------
drop policy if exists "configurations seller select assigned"
  on public.configurations;
create policy "configurations seller select assigned"
  on public.configurations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where au.user_id = auth.uid()
        and au.portal_role = 'timan_seller'
        and au.is_active  = true
        and (
             configurations.assigned_seller_id = au.id
          or (configurations.seller_email is not null
              and lower(configurations.seller_email) = lower(au.email))
          or configurations.created_by_user_id = au.user_id
        )
    )
  );

-- Verify policies are in place:
--   select polname, polcmd from pg_policy
--    where polrelid = 'public.configurations'::regclass
--    order by polname;
