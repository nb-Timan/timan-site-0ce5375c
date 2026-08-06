-- Dealer geocoding support for Partnerkort.
-- Additive only: does not delete or modify existing dealer data.

alter table public.dealer_accounts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocoding_status text,
  add column if not exists geocoding_error text;

create index if not exists dealer_accounts_geocoded_idx
  on public.dealer_accounts (latitude, longitude)
  where latitude is not null and longitude is not null;
