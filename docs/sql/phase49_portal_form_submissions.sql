-- Phase 49 — Portal form submissions (Salg & Marketing > Diverse > Formularer).
--
-- HOW TO RUN
-- 1. Open Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- WHAT THIS DOES
-- Creates a generic public.portal_form_submissions table used by the in-portal
-- forms under Salg & Marketing > Diverse > Formularer (replaces the old
-- Microsoft Forms links). One table covers all current and future form types
-- via a typed `form_type` + a flexible `payload jsonb`.
--
-- ACCESS MODEL
-- INSERT
--   - Dealer / importer / service partner / dealer_user:
--       may only insert with dealer_account_number = own au.dealer_number.
--   - Timan Sælger:
--       may insert for dealers they own (app_users.account_owner_user_id)
--       or with dealer_account_number = null.
--   - Timan Backend / Timan Service:
--       may insert for any dealer (incl. null).
--   - All inserts must be tagged with the caller's own app_users.id / email.
--   - dealer_account_number = null is only allowed for form types that do
--     not require dealer linkage (currently: budget_feedback).
-- SELECT
--   - Submitter sees their own.
--   - Dealer-side users see all rows tagged with their own dealer_number.
--   - Timan Sælger sees rows for dealers they own.
--   - Timan Backend / Timan Service see all.
--   - service_role: full access (for edge functions / admin code).

-- 1) form_type enum ----------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'portal_form_type') then
    create type public.portal_form_type as enum (
      'budget_feedback',
      'dealer_invoice_accept',
      'company_contact_info'
    );
  end if;
end$$;

grant usage on type public.portal_form_type to authenticated;
grant usage on type public.portal_form_type to service_role;

-- 2) Table -------------------------------------------------------------------
create table if not exists public.portal_form_submissions (
  id                     uuid primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),

  form_type              public.portal_form_type not null,

  -- Dealer linkage (primary key is the account number; name kept as fallback)
  dealer_account_number  text,
  dealer_name            text,

  -- Authorship
  submitted_by_user_id   uuid references public.app_users(id) on delete set null,
  submitted_by_email     text,
  submitted_by_name      text,

  -- Free-form per-form-type fields
  payload                jsonb not null default '{}'::jsonb
);

create index if not exists portal_form_submissions_type_created_idx
  on public.portal_form_submissions (form_type, created_at desc);
create index if not exists portal_form_submissions_dealer_acct_idx
  on public.portal_form_submissions (dealer_account_number);
create index if not exists portal_form_submissions_submitter_idx
  on public.portal_form_submissions (submitted_by_user_id);

-- 3) Grants (Data API / PostgREST) ------------------------------------------
grant select, insert on public.portal_form_submissions to authenticated;
grant all on public.portal_form_submissions to service_role;

-- 4) Row-Level Security ------------------------------------------------------
alter table public.portal_form_submissions enable row level security;

-- 4a) INSERT — strict authorship + dealer-scope + form-type rules.
drop policy if exists "portal_form_submissions insert own" on public.portal_form_submissions;
drop policy if exists "portal_form_submissions insert scoped" on public.portal_form_submissions;
create policy "portal_form_submissions insert scoped"
on public.portal_form_submissions
for insert
to authenticated
with check (
  -- (1) Form-type dealer requirement.
  --     Forms that require a dealer linkage must have a non-null
  --     dealer_account_number. Extend this list when adding new
  --     dealer-bound form types to the enum.
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
     where au.user_id = auth.uid()
       -- Caller must tag the row with their own identity.
       and (
         au.id = portal_form_submissions.submitted_by_user_id
         or lower(au.email) = lower(coalesce(portal_form_submissions.submitted_by_email, ''))
       )
       and (
         -- Timan Backend / Timan Service: may insert for any dealer.
         au.portal_role in ('timan_backend','timan_service')
         or au.role = 'timan_backend'

         -- Timan Sælger: own dealers, or no dealer linkage.
         or (
           (au.portal_role = 'timan_seller' or au.role = 'timan_saelger')
           and (
             portal_form_submissions.dealer_account_number is null
             or exists (
               select 1
                 from public.app_users dealer
                where dealer.account_owner_user_id = au.id
                  and dealer.dealer_number = portal_form_submissions.dealer_account_number
             )
           )
         )

         -- Dealer-side users: dealer_account_number must equal own dealer.
         or (
           (
             au.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user')
             or au.role = 'partner'
           )
           and au.dealer_number is not null
           and portal_form_submissions.dealer_account_number = au.dealer_number
         )
       )
  )
);

-- 4b) SELECT: Timan Backend / Timan Service see everything.
drop policy if exists "portal_form_submissions read admin" on public.portal_form_submissions;
create policy "portal_form_submissions read admin"
on public.portal_form_submissions
for select
to authenticated
using (
  exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.portal_role in ('timan_backend','timan_service')
         or au.role = 'timan_backend'
       )
  )
);

-- 4c) SELECT: Timan Sælger sees submissions from dealers they own
--     (reuses app_users.account_owner_user_id from phase 3).
drop policy if exists "portal_form_submissions read seller scope" on public.portal_form_submissions;
create policy "portal_form_submissions read seller scope"
on public.portal_form_submissions
for select
to authenticated
using (
  exists (
    select 1
      from public.app_users me
      join public.app_users dealer
        on dealer.account_owner_user_id = me.id
     where me.user_id = auth.uid()
       and (me.portal_role = 'timan_seller' or me.role = 'timan_saelger')
       and (
         (portal_form_submissions.dealer_account_number is not null
            and dealer.dealer_number = portal_form_submissions.dealer_account_number)
         or dealer.id = portal_form_submissions.submitted_by_user_id
       )
  )
);

-- 4d) SELECT: the submitter sees their own submissions.
drop policy if exists "portal_form_submissions read own" on public.portal_form_submissions;
create policy "portal_form_submissions read own"
on public.portal_form_submissions
for select
to authenticated
using (
  exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and (
         au.id = portal_form_submissions.submitted_by_user_id
         or lower(au.email) = lower(coalesce(portal_form_submissions.submitted_by_email, ''))
       )
  )
);

-- 4e) SELECT: dealer-side users (forhandler / importør / service partner /
--     dealer_user) see submissions tagged with their own dealer account number.
drop policy if exists "portal_form_submissions read same dealer" on public.portal_form_submissions;
create policy "portal_form_submissions read same dealer"
on public.portal_form_submissions
for select
to authenticated
using (
  portal_form_submissions.dealer_account_number is not null
  and exists (
    select 1
      from public.app_users au
     where au.user_id = auth.uid()
       and au.dealer_number = portal_form_submissions.dealer_account_number
       and (
         au.portal_role in ('timan_dealer','timan_importer','timan_service_partner','dealer_user')
         or au.role = 'partner'
       )
  )
);

-- Notes
-- * No DELETE / UPDATE policies — submissions are append-only from the portal.
--   Backend corrections go through service_role.
-- * Future form types: extend the portal_form_type enum and (if the form
--   requires a dealer) add the value to the form-type dealer requirement
--   list in policy 4a.
