-- Phase 63 — CRITICAL security remediation for public.app_users.
--
-- HOW TO RUN
-- 1. Open your Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent). No user data is modified or deleted.
--
-- WHY
-- Phase 2 / Phase 36 left public.app_users effectively world-writable:
--   select using (true) / update using (true) with check (true)
-- Combined with the publishable (anon) key that ships in the SPA, ANY visitor
-- could enumerate every user, flip `approved`/`is_active`, rewrite
-- `portal_role`, `permissions`, `allowed_modules`/`allowed_areas`, or link
-- `auth_user_id` to their own auth account and become `timan_backend`.
-- Phase 36 is hereby SUPERSEDED and its permissive policies are NOT
-- acceptable — do not re-apply it.
--
-- WHAT THIS DOES
--   1. Revokes all anon privileges on app_users (no read, no write).
--   2. Drops every permissive policy.
--   3. Adds SECURITY DEFINER helpers: public.is_backend / public.is_timan_staff.
--   4. Adds narrow policies: self-read, staff-read, self-update only.
--   5. Adds a BEFORE UPDATE trigger that blocks protected-column changes
--      from anything that is not the service role (Edge Function).
--   6. Adds public.app_user_directory — a minimal seller directory view so the
--      UI never needs broad SELECT on app_users.
--
-- Privileged writes (role, permissions, approval, activation, auth linking)
-- now go exclusively through the `admin-user-actions` Edge Function, which
-- authenticates the caller, verifies timan_backend + approved + active, and
-- uses the service-role key server-side only.

-- 0) RLS on --------------------------------------------------------------
alter table public.app_users enable row level security;

-- 1) Grants ---------------------------------------------------------------
revoke all on public.app_users from anon;
revoke all on public.app_users from public;
grant select, update on public.app_users to authenticated;
grant all on public.app_users to service_role;

-- 2) Drop permissive / legacy policies ------------------------------------
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'app_users'
  loop
    execute format('drop policy %I on public.app_users', p.policyname);
  end loop;
end$$;

-- 3) Trusted authorization helpers ----------------------------------------
-- Identity is derived from the verified JWT only (auth.uid(), or the verified
-- email claim for rows whose auth_user_id has not been linked yet).
-- Never from client-supplied values.

create or replace function public.app_user_owns_row(
  _auth_user_id uuid,
  _email        text
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    (_auth_user_id is not null and _auth_user_id = auth.uid())
    or (
      auth.uid() is not null
      and _email is not null
      and lower(_email) = lower(nullif(auth.jwt() ->> 'email', ''))
    )
$$;

create or replace function public.is_backend(_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.app_users u
     where _uid is not null
       and (
         u.auth_user_id = _uid
         or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
       )
       and u.portal_role = 'timan_backend'::public.portal_role
       and coalesce(u.approved, false) = true
       and coalesce(u.is_active, false) = true
  )
$$;

create or replace function public.is_timan_staff(_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.app_users u
     where _uid is not null
       and (
         u.auth_user_id = _uid
         or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
       )
       and u.portal_role in (
         'timan_backend'::public.portal_role,
         'timan_seller'::public.portal_role,
         'timan_service'::public.portal_role
       )
       and coalesce(u.approved, false) = true
       and coalesce(u.is_active, false) = true
  )
$$;

revoke all on function public.is_backend(uuid)       from public, anon;
revoke all on function public.is_timan_staff(uuid)   from public, anon;
revoke all on function public.app_user_owns_row(uuid, text) from public, anon;
grant execute on function public.is_backend(uuid)     to authenticated, service_role;
grant execute on function public.is_timan_staff(uuid) to authenticated, service_role;
grant execute on function public.app_user_owns_row(uuid, text) to authenticated, service_role;

-- 4) Policies --------------------------------------------------------------
-- No anon policy at all → anon has zero access (grants revoked as well).
-- No INSERT and no DELETE policy → only the service role (Edge Function) may
-- create, link or delete rows.

create policy "app_users_select_self"
  on public.app_users
  for select
  to authenticated
  using (public.app_user_owns_row(auth_user_id, email));

create policy "app_users_select_staff"
  on public.app_users
  for select
  to authenticated
  using (public.is_timan_staff(auth.uid()));

-- Self-service profile update. Column-level protection is enforced by the
-- trigger below (a WITH CHECK clause cannot compare against OLD).
create policy "app_users_update_self_profile"
  on public.app_users
  for update
  to authenticated
  using (public.app_user_owns_row(auth_user_id, email))
  with check (public.app_user_owns_row(auth_user_id, email));

-- 5) Protected-column guard -------------------------------------------------
create or replace function public.app_users_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  protected text[] := array[
    'id','email','role','partner_type','portal_role','permissions',
    'allowed_modules','allowed_areas','backend_modules','module_access',
    'quick_actions','is_active','approved','status','auth_user_id','user_id',
    'dealer_id','dealer_number','company_dealer','seller_initials','seller_email',
    'can_view_prices','can_submit_order','can_edit_discount',
    'can_switch_customer_mode','start_step','max_step',
    'account_owner_user_id','account_owner_name','account_owner_initials',
    'account_owner_email','portal_variant','login_count','auth_status'
  ];
  oldj jsonb := to_jsonb(old);
  newj jsonb := to_jsonb(new);
  col  text;
  changed text[] := '{}';
begin
  -- service_role (Edge Function with the service key) bypasses this guard.
  if coalesce(current_setting('request.jwt.claim.role', true),
              current_setting('request.jwt.claims', true), '') ilike '%service_role%'
     or current_user = 'service_role' then
    return new;
  end if;

  foreach col in array protected loop
    if oldj ? col and newj ? col and oldj -> col is distinct from newj -> col then
      changed := changed || col;
    end if;
  end loop;

  if array_length(changed, 1) is not null then
    raise exception
      'app_users: protected column(s) % may only be changed by an administrator via admin-user-actions',
      array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end$$;

drop trigger if exists app_users_guard_protected_columns_trg on public.app_users;
create trigger app_users_guard_protected_columns_trg
  before update on public.app_users
  for each row execute function public.app_users_guard_protected_columns();

-- 6) Minimal seller/contact directory --------------------------------------
-- Exposes only display fields for Timan staff rows. No permissions, no
-- approval/active status, no dealer links, no PII beyond work identity and
-- work phone.
drop view if exists public.app_user_directory;
create view public.app_user_directory
with (security_invoker = off) as
  select
    u.id,
    lower(u.email)   as email,
    upper(u.initials) as initials,
    u.full_name,
    u.portal_role::text as portal_role,
    u.company,
    u.phone
  from public.app_users u
  where u.initials is not null
    and u.portal_role in (
      'timan_backend'::public.portal_role,
      'timan_seller'::public.portal_role,
      'timan_service'::public.portal_role,
      'timan_importer'::public.portal_role
    );

revoke all on public.app_user_directory from anon, public;
grant select on public.app_user_directory to authenticated, service_role;

-- 7) Verification (read the output of this final query) ---------------------
-- select policyname, cmd, roles, qual from pg_policies
--  where schemaname='public' and tablename='app_users';
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='app_users';

-- 8) Cleanup of security-probe rows ----------------------------------------
-- scripts/verify-app-users-rls.mjs proved the pre-migration hole by inserting
-- a row as an anonymous visitor. Remove any such rows (and anything else that
-- was created anonymously with an invalid domain).
delete from public.app_users
 where email like 'rls-probe-%@invalid.test';
