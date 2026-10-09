-- Keep dealer geocoding deterministic and provider-safe. Coordinates remain the
-- canonical map source; this metadata only controls when an external lookup is
-- allowed after an address change.
alter table public.dealer_accounts
  add column if not exists geocoding_address_hash text,
  add column if not exists geocoding_retry_after timestamptz;

create index if not exists dealer_accounts_geocoding_address_hash_idx
  on public.dealer_accounts (geocoding_address_hash)
  where latitude is not null and longitude is not null;

create table if not exists public.geocoding_provider_state (
  provider text primary key,
  next_request_at timestamptz not null default now(),
  run_locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.geocoding_provider_state enable row level security;

insert into public.geocoding_provider_state (provider)
values ('dealer_nominatim')
on conflict (provider) do nothing;

create or replace function public.invalidate_dealer_geocode_on_address_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.address is distinct from old.address
    or new.address_line_1 is distinct from old.address_line_1
    or new.address_line_2 is distinct from old.address_line_2
    or new.postal_code is distinct from old.postal_code
    or new.city is distinct from old.city
    or new.zip_city_raw is distinct from old.zip_city_raw
    or new.country is distinct from old.country
  then
    -- A fresh Google Places result is allowed to keep its explicitly changed
    -- coordinates. Unchanged old coordinates must never follow a new address.
    if new.latitude is not distinct from old.latitude
      and new.longitude is not distinct from old.longitude
    then
      new.latitude := null;
      new.longitude := null;
      new.geocoded_at := null;
      new.geocoding_status := 'pending';
      new.geocoding_error := null;
      new.google_place_id := null;
    end if;

    new.geocoding_address_hash := null;
    new.geocoding_retry_after := null;
  end if;

  return new;
end;
$$;

drop trigger if exists dealer_accounts_invalidate_geocode_on_address_change on public.dealer_accounts;
create trigger dealer_accounts_invalidate_geocode_on_address_change
before update on public.dealer_accounts
for each row execute function public.invalidate_dealer_geocode_on_address_change();

create or replace function public.acquire_dealer_geocoding_run(p_lease_seconds integer default 900)
returns table (acquired boolean, retry_after_ms bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_locked_until timestamptz;
begin
  insert into public.geocoding_provider_state (provider)
  values ('dealer_nominatim')
  on conflict (provider) do nothing;

  select run_locked_until
    into v_locked_until
  from public.geocoding_provider_state
  where provider = 'dealer_nominatim'
  for update;

  if v_locked_until is not null and v_locked_until > v_now then
    return query select false, greatest(0, floor(extract(epoch from (v_locked_until - v_now)) * 1000)::bigint);
    return;
  end if;

  update public.geocoding_provider_state
  set run_locked_until = v_now + greatest(1, p_lease_seconds) * interval '1 second',
      updated_at = v_now
  where provider = 'dealer_nominatim';

  return query select true, 0::bigint;
end;
$$;

create or replace function public.release_dealer_geocoding_run()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.geocoding_provider_state
  set run_locked_until = null,
      updated_at = clock_timestamp()
  where provider = 'dealer_nominatim';
$$;

create or replace function public.reserve_dealer_nominatim_slot(p_min_interval_ms integer default 1100)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_scheduled timestamptz;
begin
  insert into public.geocoding_provider_state (provider)
  values ('dealer_nominatim')
  on conflict (provider) do nothing;

  select greatest(next_request_at, v_now)
    into v_scheduled
  from public.geocoding_provider_state
  where provider = 'dealer_nominatim'
  for update;

  update public.geocoding_provider_state
  set next_request_at = v_scheduled + greatest(1000, p_min_interval_ms) * interval '1 millisecond',
      updated_at = v_now
  where provider = 'dealer_nominatim';

  return v_scheduled;
end;
$$;

create or replace function public.defer_dealer_nominatim_requests(p_retry_after timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.geocoding_provider_state
  set next_request_at = greatest(next_request_at, p_retry_after),
      updated_at = clock_timestamp()
  where provider = 'dealer_nominatim';
$$;

revoke all on public.geocoding_provider_state from anon, authenticated;
revoke all on function public.acquire_dealer_geocoding_run(integer) from public, anon, authenticated;
revoke all on function public.release_dealer_geocoding_run() from public, anon, authenticated;
revoke all on function public.reserve_dealer_nominatim_slot(integer) from public, anon, authenticated;
revoke all on function public.defer_dealer_nominatim_requests(timestamptz) from public, anon, authenticated;
grant execute on function public.acquire_dealer_geocoding_run(integer) to service_role;
grant execute on function public.release_dealer_geocoding_run() to service_role;
grant execute on function public.reserve_dealer_nominatim_slot(integer) to service_role;
grant execute on function public.defer_dealer_nominatim_requests(timestamptz) to service_role;
