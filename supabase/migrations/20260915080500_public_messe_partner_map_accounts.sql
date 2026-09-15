-- The Messe "Find dealer" map is public, while dealer_accounts itself stays
-- RLS-scoped for portal users. Expose only active canonical public partners
-- and only the fields rendered by the existing public map popup.
create or replace function public.list_public_partner_map_accounts()
returns table (
  id uuid,
  account_number text,
  company_name text,
  customer_type text,
  customer_type_label text,
  dealer_type text,
  country text,
  postal_code text,
  city text,
  address text,
  address_line_1 text,
  address_line_2 text,
  zip_city_raw text,
  email text,
  phone text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  website text,
  social_facebook text,
  latitude double precision,
  longitude double precision,
  geocoding_status text,
  is_blocked boolean,
  is_deleted boolean
)
language sql
stable
security definer
set search_path = public
as $public_partner_map$
  select
    da.id,
    da.account_number,
    da.company_name,
    da.customer_type,
    da.customer_type_label,
    da.dealer_type,
    da.country,
    da.postal_code,
    da.city,
    da.address,
    da.address_line_1,
    da.address_line_2,
    da.zip_city_raw,
    da.email,
    da.phone,
    da.primary_contact_name,
    da.primary_contact_email,
    da.primary_contact_phone,
    da.website,
    da.social_facebook,
    da.latitude,
    da.longitude,
    da.geocoding_status,
    da.is_blocked,
    da.is_deleted
  from public.dealer_accounts da
  where public.partner_account_kind(da.id) in ('dealer', 'service_partner', 'importer')
    and not coalesce(da.is_blocked, false)
    and not coalesce(da.is_deleted, false)
  order by da.company_name;
$public_partner_map$;

revoke all on function public.list_public_partner_map_accounts() from public;
grant execute on function public.list_public_partner_map_accounts() to anon, authenticated;
