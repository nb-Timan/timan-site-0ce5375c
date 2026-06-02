-- Phase 52 — Self-service dealer profile / onboarding.
--
-- HOW TO RUN
-- 1. Open Supabase SQL editor.
-- 2. Paste this file and run. Idempotent / safe to re-run.
--
-- WHAT THIS DOES
-- A) Extends public.dealer_accounts with additional profile columns
--    (director, finance, media/social, sales, workshop, marketing).
-- B) Creates public.dealer_contacts for extra people in sales/workshop/
--    parts/marketing/finance areas.
-- C) Adds RLS so a dealer-side authenticated user can read + write their
--    own dealer_accounts row (column-restricted) and their own
--    dealer_contacts rows. Backend keeps full access.
-- D) Adds column-level GRANT UPDATE on dealer_accounts for the new
--    self-service fields (defense-in-depth on top of RLS).
--
-- Depends on phase50 (current_user_dealer_number helper + RLS skeleton)
-- and phase9c (is_timan_backend / backend-only base policies).

-- A) Columns ----------------------------------------------------------------
alter table public.dealer_accounts
  add column if not exists director_name           text,
  add column if not exists invoice_email           text,
  add column if not exists finance_contact_name    text,
  add column if not exists finance_contact_phone   text,
  add column if not exists finance_contact_email   text,
  add column if not exists website                 text,
  add column if not exists social_facebook         text,
  add column if not exists social_linkedin         text,
  add column if not exists social_tiktok           text,
  add column if not exists social_youtube          text,
  add column if not exists social_instagram        text,
  add column if not exists sales_contact_name      text,
  add column if not exists sales_contact_phone     text,
  add column if not exists sales_contact_email     text,
  add column if not exists sales_has_multiple      boolean not null default false,
  add column if not exists workshop_contact_name   text,
  add column if not exists workshop_contact_phone  text,
  add column if not exists workshop_contact_email  text,
  add column if not exists workshop_has_multiple   boolean not null default false,
  add column if not exists marketing_contact_name  text,
  add column if not exists marketing_contact_phone text,
  add column if not exists marketing_contact_email text;

-- B) dealer_contacts table --------------------------------------------------
create table if not exists public.dealer_contacts (
  id                 uuid primary key default gen_random_uuid(),
  dealer_account_id  uuid not null references public.dealer_accounts(id) on delete cascade,
  contact_area       text not null check (contact_area in ('sales','workshop','parts','marketing','finance')),
  role_title         text,
  name               text,
  email              text,
  phone              text,
  is_primary         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists dealer_contacts_account_idx on public.dealer_contacts(dealer_account_id);
create index if not exists dealer_contacts_area_idx    on public.dealer_contacts(contact_area);

create or replace function public.dealer_contacts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dealer_contacts_touch on public.dealer_contacts;
create trigger trg_dealer_contacts_touch
  before update on public.dealer_contacts
  for each row execute function public.dealer_contacts_touch_updated_at();

-- C) RLS for dealer_contacts ------------------------------------------------
alter table public.dealer_contacts enable row level security;

drop policy if exists dealer_contacts_select_backend on public.dealer_contacts;
create policy dealer_contacts_select_backend
  on public.dealer_contacts for select to authenticated
  using (public.is_timan_backend());

drop policy if exists dealer_contacts_write_backend on public.dealer_contacts;
create policy dealer_contacts_write_backend
  on public.dealer_contacts for all to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

drop policy if exists dealer_contacts_select_own on public.dealer_contacts;
create policy dealer_contacts_select_own
  on public.dealer_contacts for select to authenticated
  using (
    exists (
      select 1 from public.dealer_accounts da
      where da.id = dealer_contacts.dealer_account_id
        and da.account_number = public.current_user_dealer_number()
    )
  );

drop policy if exists dealer_contacts_insert_own on public.dealer_contacts;
create policy dealer_contacts_insert_own
  on public.dealer_contacts for insert to authenticated
  with check (
    exists (
      select 1 from public.dealer_accounts da
      where da.id = dealer_contacts.dealer_account_id
        and da.account_number = public.current_user_dealer_number()
    )
  );

drop policy if exists dealer_contacts_update_own on public.dealer_contacts;
create policy dealer_contacts_update_own
  on public.dealer_contacts for update to authenticated
  using (
    exists (
      select 1 from public.dealer_accounts da
      where da.id = dealer_contacts.dealer_account_id
        and da.account_number = public.current_user_dealer_number()
    )
  )
  with check (
    exists (
      select 1 from public.dealer_accounts da
      where da.id = dealer_contacts.dealer_account_id
        and da.account_number = public.current_user_dealer_number()
    )
  );

drop policy if exists dealer_contacts_delete_own on public.dealer_contacts;
create policy dealer_contacts_delete_own
  on public.dealer_contacts for delete to authenticated
  using (
    exists (
      select 1 from public.dealer_accounts da
      where da.id = dealer_contacts.dealer_account_id
        and da.account_number = public.current_user_dealer_number()
    )
  );

-- D) Grants -----------------------------------------------------------------
grant select, insert, update, delete on public.dealer_contacts to authenticated;
grant all on public.dealer_contacts to service_role;

-- Extend column-level UPDATE grant on dealer_accounts so the dealer can
-- maintain their own profile fields (other columns remain backend-only).
grant update (
  address, postal_code, city, email, phone,
  vat_number, primary_contact_name, primary_contact_email, primary_contact_phone,
  director_name, invoice_email,
  finance_contact_name, finance_contact_phone, finance_contact_email,
  website, social_facebook, social_linkedin, social_tiktok, social_youtube, social_instagram,
  sales_contact_name, sales_contact_phone, sales_contact_email, sales_has_multiple,
  workshop_contact_name, workshop_contact_phone, workshop_contact_email, workshop_has_multiple,
  marketing_contact_name, marketing_contact_phone, marketing_contact_email
) on public.dealer_accounts to authenticated;

-- VERIFICATION (run while signed in as a dealer user):
--   select id, company_name, director_name, website
--   from public.dealer_accounts;
--   select * from public.dealer_contacts;
