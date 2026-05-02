-- =====================================================================
-- Phase 14 — Dealer creation + CSV import RPCs
--
-- Adds two SECURITY DEFINER RPCs callable by Timan Backend users only:
--   • create_dealer_account(payload jsonb)
--       Inserts ONE dealer_accounts row. account_number must be unique.
--   • upsert_dealer_accounts(payload jsonb)
--       Bulk upsert by account_number. Used by the CSV import.
--       Returns a summary: { created, updated, skipped, errors }.
--
-- Both reject non-backend callers with errcode 42501.
-- They never touch quotes, orders, configurator pricing or n8n logic.
-- Safe to run multiple times.
-- =====================================================================

-- ---------- create_dealer_account ------------------------------------
create or replace function public.create_dealer_account(payload jsonb)
returns public.dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct text;
  v_row  public.dealer_accounts;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user' using errcode = '42501';
  end if;

  v_acct := nullif(trim(payload ->> 'account_number'), '');
  if v_acct is null then
    raise exception 'account_number is required' using errcode = '22023';
  end if;

  if exists (select 1 from public.dealer_accounts where account_number = v_acct) then
    raise exception 'dealer with account_number % already exists', v_acct using errcode = '23505';
  end if;

  insert into public.dealer_accounts (
    account_number, company_name, customer_type, customer_type_label,
    country, postal_code, city, address, email, phone,
    assigned_seller_initials, assigned_seller_name, assigned_seller_email
  )
  values (
    v_acct,
    nullif(trim(payload ->> 'company_name'), ''),
    nullif(trim(payload ->> 'customer_type'), ''),
    nullif(trim(payload ->> 'customer_type_label'), ''),
    nullif(trim(payload ->> 'country'), ''),
    nullif(trim(payload ->> 'postal_code'), ''),
    nullif(trim(payload ->> 'city'), ''),
    nullif(trim(payload ->> 'address'), ''),
    nullif(trim(payload ->> 'email'), ''),
    nullif(trim(payload ->> 'phone'), ''),
    nullif(trim(payload ->> 'assigned_seller_initials'), ''),
    nullif(trim(payload ->> 'assigned_seller_name'), ''),
    nullif(trim(payload ->> 'assigned_seller_email'), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_dealer_account(jsonb) from public;
grant execute on function public.create_dealer_account(jsonb) to authenticated;

-- ---------- upsert_dealer_accounts (bulk) ----------------------------
-- payload = { rows: [ { account_number, company_name, customer_type,
--                       customer_type_label, country,
--                       assigned_seller_initials, assigned_seller_name,
--                       assigned_seller_email }, ... ] }
-- Returns: { created, updated, skipped, errors: [{ account_number, error }] }
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
          assigned_seller_initials  = coalesce(nullif(trim(v_row ->> 'assigned_seller_initials'), ''), assigned_seller_initials),
          assigned_seller_name      = coalesce(nullif(trim(v_row ->> 'assigned_seller_name'), ''), assigned_seller_name),
          assigned_seller_email     = coalesce(nullif(trim(v_row ->> 'assigned_seller_email'), ''), assigned_seller_email),
          updated_at                = now()
        where account_number = v_acct;
        v_updated := v_updated + 1;
      else
        insert into public.dealer_accounts (
          account_number, company_name, customer_type, customer_type_label, country,
          assigned_seller_initials, assigned_seller_name, assigned_seller_email
        ) values (
          v_acct,
          nullif(trim(v_row ->> 'company_name'), ''),
          nullif(trim(v_row ->> 'customer_type'), ''),
          nullif(trim(v_row ->> 'customer_type_label'), ''),
          nullif(trim(v_row ->> 'country'), ''),
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

-- =====================================================================
-- Verify (signed-in as nb@timan.dk):
--   select public.create_dealer_account(
--     jsonb_build_object(
--       'account_number','TEST-9999','company_name','Test ApS',
--       'customer_type','Forhandler','country','DK',
--       'assigned_seller_initials','EM','assigned_seller_name','Esben Madsen',
--       'assigned_seller_email','em@timan.dk'
--     )
--   );
--   select public.upsert_dealer_accounts(
--     jsonb_build_object('rows', jsonb_build_array(
--       jsonb_build_object('account_number','TEST-9999','company_name','Test ApS 2')
--     ))
--   );
-- =====================================================================
