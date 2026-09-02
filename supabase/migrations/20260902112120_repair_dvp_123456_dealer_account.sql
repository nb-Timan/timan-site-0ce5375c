-- Repair a live orphan partner user:
--
-- app_users has an approved/active external user (DVP) with dealer_number
-- 123456, while dealer_accounts has no canonical row for that account number.
-- Partnerdata resolves strictly through dealer_accounts, so the user can see
-- a CRM fallback shell but cannot open "Virksomheds- og persondata".
--
-- This migration is forward-only and idempotent. It creates only the missing
-- canonical account shell from fields already stored on the DVP app_users row.
-- It does not create contacts because no dealer_contacts or onboarding payload
-- for this account exists live, and contact role/phone/address cannot be
-- inferred safely.

insert into public.dealer_accounts (
  account_number,
  dealer_number,
  company_name,
  display_name,
  customer_type,
  customer_type_label,
  dealer_type,
  country,
  postal_code,
  city,
  address,
  address_line_1,
  email,
  phone,
  status,
  is_active,
  is_blocked,
  is_deleted,
  is_main_account,
  source,
  created_at,
  updated_at
)
select
  au.dealer_number,
  au.dealer_number,
  coalesce(nullif(trim(au.company_dealer), ''), nullif(trim(au.company), ''), nullif(trim(au.full_name), ''), au.dealer_number),
  coalesce(nullif(trim(au.company_dealer), ''), nullif(trim(au.company), ''), nullif(trim(au.full_name), ''), au.dealer_number),
  'Forhandler',
  'Forhandler',
  'dealer',
  nullif(trim(au.country), ''),
  nullif(trim(au.postal_code), ''),
  nullif(trim(au.city), ''),
  nullif(trim(au.address), ''),
  nullif(trim(au.address), ''),
  nullif(trim(au.email), ''),
  nullif(trim(au.phone), ''),
  'active',
  true,
  false,
  false,
  true,
  'app_user_repair',
  now(),
  now()
from public.app_users au
where au.id = 'e8621b25-9386-4c6e-835c-9bc8ca1eb654'
  and au.dealer_number = '123456'
  and au.approved is true
  and au.is_active is true
  and au.portal_role in ('timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_user', 'dealer_customer')
  and not exists (
    select 1
    from public.dealer_accounts da
    where da.account_number = au.dealer_number
  );
