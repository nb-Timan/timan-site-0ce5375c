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
-- - Dealers / importers / service partners / dealer users: may INSERT their
--   own submissions and SELECT only their own submissions.
-- - Timan Sælger: may SELECT submissions belonging to dealers they own
--   (via app_users.account_owner_user_id), reusing the existing CRM
--   scoping logic from phase3_crm_account_owner.sql.
-- - Timan Backend / Timan Service: may SELECT all submissions.
-- - service_role: full access (for edge functions / admin code).

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

-- 4a) INSERT: any authenticated user may submit their own form.
--     The row must be tagged with their own app_users.id OR their email,
--     so dealers cannot impersonate other dealers/sellers.
drop policy if exists "portal_form_submissions insert own" on public.portal_form_submissions;
create policy "portal_form_submissions insert own"
on public.portal_form_submissions
for insert
to authenticated
with check (
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

-- 4d) SELECT: the submitter sees their own submissions (dealers + everyone else).
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
--     This covers the case where multiple users at the same dealer must see
--     each other's submissions.
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
-- * Future form types: extend the portal_form_type enum and add a new
--   payload shape on the frontend; no schema change required here.
