-- Phase 51 — Stram RLS på portal_form_submissions med dealer-scope.
--
-- HOW TO RUN
-- 1. Open Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- WHAT THIS DOES
-- Erstatter INSERT- og SELECT-policies på public.portal_form_submissions, så
-- eksterne forhandler-roller kun kan indsætte/læse rækker hvor
-- dealer_account_number = public.current_user_dealer_number()
-- (security-definer helper fra Phase 50).
--
-- ROLLER
--   Eksterne (dealer-scope tvinges):
--     - timan_dealer
--     - timan_importer
--     - timan_service_partner
--     - dealer_user
--     - role = 'partner'    (legacy felt på app_users, hvis brugt)
--   Interne (uændret fuld adgang):
--     - timan_backend (portal_role eller role)
--     - timan_service
--
-- NOTES
-- - Ingen importør → underforhandler relation. Eksterne ser KUN egen konto.
-- - Ingen sælger-scope policy tilføjes her (afventer sikker SQL-relation).
-- - Submitter-egen-SELECT bevares men STRAMMES så ekstern bruger kun
--   må se egne submissions hvor dealer_account_number stemmer.
--   Interne brugere er allerede dækket af admin-policy og påvirkes ikke.
-- - DELETE/UPDATE forbliver uden policy (append-only fra portalen).

-- 0) Forudsætning: helperen fra Phase 50 skal findes. -----------------------
do $$
begin
  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'current_user_dealer_number'
  ) then
    raise exception
      'Phase 50 helper public.current_user_dealer_number() mangler. Kør phase50 først.';
  end if;
end$$;

-- 1) Drop tidligere policies så vi kan genskabe rent. -----------------------
drop policy if exists "portal_form_submissions insert own"            on public.portal_form_submissions;
drop policy if exists "portal_form_submissions insert scoped"         on public.portal_form_submissions;
drop policy if exists "portal_form_submissions read admin"            on public.portal_form_submissions;
drop policy if exists "portal_form_submissions read seller scope"     on public.portal_form_submissions;
drop policy if exists "portal_form_submissions read own"              on public.portal_form_submissions;
drop policy if exists "portal_form_submissions read same dealer"      on public.portal_form_submissions;

-- Sikr RLS er aktiv (idempotent).
alter table public.portal_form_submissions enable row level security;

-- 2) INSERT — strammet dealer-scope via current_user_dealer_number(). -------
create policy "portal_form_submissions insert scoped"
on public.portal_form_submissions
for insert
to authenticated
with check (
  -- (1) Form-type dealer requirement: visse form-typer SKAL have dealer.
  (
    portal_form_submissions.dealer_account_number is not null
    or portal_form_submissions.form_type not in (
      'dealer_invoice_accept',
      'company_contact_info'
    )
  )
  -- (2) Authorship + role-based dealer scope.
  and exists (
    select 1
      from public.app_users au
     where au.auth_user_id = auth.uid()
       and (
         au.id = portal_form_submissions.submitted_by_user_id
         or lower(au.email) = lower(coalesce(portal_form_submissions.submitted_by_email, ''))
       )
       and (
         -- Interne: Timan Backend / Timan Service må indsætte for hvilken som helst dealer.
         au.portal_role in ('timan_backend','timan_service')
         or au.role = 'timan_backend'

         -- Eksterne dealer-roller: dealer_account_number SKAL matche
         -- helperens værdi (= app_users.dealer_number for den signerede bruger).
         or (
           (
             au.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user')
             or au.role = 'partner'
           )
           and portal_form_submissions.dealer_account_number is not null
           and portal_form_submissions.dealer_account_number = public.current_user_dealer_number()
         )
       )
  )
);

-- 3) SELECT — admin (Timan Backend / Timan Service) ser alt. ----------------
create policy "portal_form_submissions read admin"
on public.portal_form_submissions
for select
to authenticated
using (
  exists (
    select 1
      from public.app_users au
     where au.auth_user_id = auth.uid()
       and (
         au.portal_role in ('timan_backend','timan_service')
         or au.role = 'timan_backend'
       )
  )
);

-- 4) SELECT — eksterne dealer-roller ser KUN egen dealer-scope. -------------
-- Bemærk: Vi bruger current_user_dealer_number() direkte (Phase 50 helper),
-- så vi undgår at gentage app_users-opslaget for hver række.
create policy "portal_form_submissions read same dealer"
on public.portal_form_submissions
for select
to authenticated
using (
  portal_form_submissions.dealer_account_number is not null
  and portal_form_submissions.dealer_account_number = public.current_user_dealer_number()
  and exists (
    select 1
      from public.app_users au
     where au.auth_user_id = auth.uid()
       and (
         au.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user')
         or au.role = 'partner'
       )
  )
);

-- 5) SELECT — submitter ser egne rækker, men kun hvis dealer-scope holder. --
-- For eksterne brugere kræver vi at dealer_account_number matcher helperen,
-- så et lækket/forkert dealer-tag ikke kan læses tilbage.
-- Interne brugere er allerede dækket af "read admin".
create policy "portal_form_submissions read own"
on public.portal_form_submissions
for select
to authenticated
using (
  exists (
    select 1
      from public.app_users au
     where au.auth_user_id = auth.uid()
       and (
         au.id = portal_form_submissions.submitted_by_user_id
         or lower(au.email) = lower(coalesce(portal_form_submissions.submitted_by_email, ''))
       )
       and (
         -- Interne får adgang her uden ekstra dealer-tjek.
         au.portal_role in ('timan_backend','timan_service')
         or au.role = 'timan_backend'
         -- Eksterne: kun hvis rækken er tagget med deres egen dealer.
         or (
           (
             au.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user')
             or au.role = 'partner'
           )
           and portal_form_submissions.dealer_account_number is not null
           and portal_form_submissions.dealer_account_number = public.current_user_dealer_number()
         )
       )
  )
);

-- VERIFIKATION (kør som ekstern dealer-bruger via appen):
--   select form_type, dealer_account_number, created_at
--   from public.portal_form_submissions
--   order by created_at desc;
-- Forventet: kun rækker hvor dealer_account_number = egen dealer_number.
--
-- Forsøg på at indsætte på en anden dealer (skal fejle med RLS-violation):
--   insert into public.portal_form_submissions
--     (form_type, dealer_account_number, submitted_by_email, payload)
--   values ('company_contact_info', 'ANDEN-DEALER',
--           (select email from public.app_users where auth_user_id = auth.uid()),
--           '{}'::jsonb);
--
-- Forsøg på at indsætte på egen dealer (skal lykkes):
--   insert into public.portal_form_submissions
--     (form_type, dealer_account_number, submitted_by_email, payload)
--   values ('company_contact_info', public.current_user_dealer_number(),
--           (select email from public.app_users where auth_user_id = auth.uid()),
--           '{"test":true}'::jsonb);
