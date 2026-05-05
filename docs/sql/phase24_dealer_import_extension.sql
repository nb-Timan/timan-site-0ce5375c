-- =====================================================================
-- Phase 24 — Dealer CSV import extension
--
-- 1) Extends public.upsert_dealer_accounts to also coalesce-update:
--      address, postal_code, city, email, phone
--    Existing behaviour preserved:
--      - Backend-only (errcode 42501 otherwise)
--      - Match by account_number (primary key for upsert)
--      - dealer_accounts.id is preserved on update
--      - empty / null new values NEVER overwrite existing non-empty values
--      - DOES NOT touch quotes, orders, leads, activities, budget,
--        notes, linked users, permissions, audit log, or any other CRM data
--
-- 2) Adds a backend-only audit table public.dealer_import_logs to record
--    every CSV import (who, when, file, counts, errors).
--
-- Safe to run multiple times.
-- =====================================================================

-- 1) Extend upsert_dealer_accounts -----------------------------------
create or replace function public.upsert_dealer_accounts(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     jsonb;
  v_acct    text;
  v_exists  boolean;
  v_created int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors  jsonb := '[]'::jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user' using errcode = '42501';
  end if;

  if jsonb_typeof(payload -> 'rows') <> 'array' then
    raise exception 'payload.rows must be an array' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(payload -> 'rows')
  loop
    begin
      v_acct := nullif(trim(v_row ->> 'account_number'), '');
      if v_acct is null then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object('account_number', null, 'error', 'missing account_number')
        );
        continue;
      end if;

      select exists(select 1 from public.dealer_accounts where account_number = v_acct)
        into v_exists;

      if v_exists then
        update public.dealer_accounts set
          company_name              = coalesce(nullif(trim(v_row ->> 'company_name'), ''), company_name),
          customer_type             = coalesce(nullif(trim(v_row ->> 'customer_type'), ''), customer_type),
          customer_type_label       = coalesce(nullif(trim(v_row ->> 'customer_type_label'), ''), customer_type_label),
          country                   = coalesce(nullif(trim(v_row ->> 'country'), ''), country),
          address                   = coalesce(nullif(trim(v_row ->> 'address'), ''), address),
          postal_code               = coalesce(nullif(trim(v_row ->> 'postal_code'), ''), postal_code),
          city                      = coalesce(nullif(trim(v_row ->> 'city'), ''), city),
          email                     = coalesce(nullif(trim(v_row ->> 'email'), ''), email),
          phone                     = coalesce(nullif(trim(v_row ->> 'phone'), ''), phone),
          assigned_seller_initials  = coalesce(nullif(trim(v_row ->> 'assigned_seller_initials'), ''), assigned_seller_initials),
          assigned_seller_name      = coalesce(nullif(trim(v_row ->> 'assigned_seller_name'), ''), assigned_seller_name),
          assigned_seller_email     = coalesce(nullif(trim(v_row ->> 'assigned_seller_email'), ''), assigned_seller_email),
          updated_at                = now()
        where account_number = v_acct;
        v_updated := v_updated + 1;
      else
        insert into public.dealer_accounts (
          account_number, company_name, customer_type, customer_type_label, country,
          address, postal_code, city, email, phone,
          assigned_seller_initials, assigned_seller_name, assigned_seller_email
        ) values (
          v_acct,
          nullif(trim(v_row ->> 'company_name'), ''),
          nullif(trim(v_row ->> 'customer_type'), ''),
          nullif(trim(v_row ->> 'customer_type_label'), ''),
          nullif(trim(v_row ->> 'country'), ''),
          nullif(trim(v_row ->> 'address'), ''),
          nullif(trim(v_row ->> 'postal_code'), ''),
          nullif(trim(v_row ->> 'city'), ''),
          nullif(trim(v_row ->> 'email'), ''),
          nullif(trim(v_row ->> 'phone'), ''),
          nullif(trim(v_row ->> 'assigned_seller_initials'), ''),
          nullif(trim(v_row ->> 'assigned_seller_name'), ''),
          nullif(trim(v_row ->> 'assigned_seller_email'), '')
        );
        v_created := v_created + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('account_number', v_acct, 'error', SQLERRM)
      );
    end;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors',  v_errors
  );
end;
$$;

revoke all on function public.upsert_dealer_accounts(jsonb) from public;
grant execute on function public.upsert_dealer_accounts(jsonb) to authenticated;


-- 2) dealer_import_logs ----------------------------------------------
create table if not exists public.dealer_import_logs (
  id              uuid primary key default gen_random_uuid(),
  imported_by     uuid references auth.users(id) on delete set null,
  imported_by_email text,
  imported_at     timestamptz not null default now(),
  file_name       text,
  created_count   int not null default 0,
  updated_count   int not null default 0,
  skipped_count   int not null default 0,
  error_count     int not null default 0,
  errors          jsonb not null default '[]'::jsonb
);

alter table public.dealer_import_logs enable row level security;

drop policy if exists "dealer_import_logs_backend_select" on public.dealer_import_logs;
create policy "dealer_import_logs_backend_select"
  on public.dealer_import_logs
  for select
  to authenticated
  using (public.is_timan_backend());

drop policy if exists "dealer_import_logs_backend_insert" on public.dealer_import_logs;
create policy "dealer_import_logs_backend_insert"
  on public.dealer_import_logs
  for insert
  to authenticated
  with check (public.is_timan_backend());

-- No update / delete policy on purpose: import history is append-only.

-- =====================================================================
-- TO RUN IN SUPABASE:
--   Open Supabase → SQL Editor → paste this entire file → Run.
--   Safe to run repeatedly. Does not delete or alter any existing data.
-- =====================================================================
