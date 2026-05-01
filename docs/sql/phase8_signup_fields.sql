-- Phase 8 — Self-signup fields + admin approval workflow
--
-- HOW TO RUN
-- 1. Open your Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- Adds the columns the new signup form needs (first_name, last_name, address,
-- city, postal_code) and ensures the approval workflow defaults are correct
-- (approved=false, is_active=false, status='pending', portal_role='pending').

-- 1) Extend portal_role enum with 'pending' if missing -----------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'portal_role')
     and not exists (
       select 1
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'portal_role' and e.enumlabel = 'pending'
     )
  then
    alter type public.portal_role add value 'pending';
  end if;
end$$;

-- 2) Add new columns ---------------------------------------------------------
alter table public.app_users
  add column if not exists first_name   text,
  add column if not exists last_name    text,
  add column if not exists address      text,
  add column if not exists city         text,
  add column if not exists postal_code  text;

-- 3) Helpful index for admin search -----------------------------------------
create index if not exists app_users_postal_code_idx on public.app_users (postal_code);
create index if not exists app_users_approved_idx    on public.app_users (approved);

-- 4) Make sure RLS allows anon INSERT for self-signup ------------------------
-- (SELECT/UPDATE policies from phase2 already exist.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_users' and policyname='app_users_anon_insert'
  ) then
    create policy "app_users_anon_insert" on public.app_users for insert with check (true);
  end if;
end$$;

-- 5) Backfill first/last name from full_name where empty --------------------
update public.app_users
set first_name = coalesce(first_name, split_part(full_name, ' ', 1))
where first_name is null and full_name is not null;

update public.app_users
set last_name = coalesce(last_name, nullif(regexp_replace(full_name, '^\S+\s*', ''), ''))
where last_name is null and full_name is not null;
