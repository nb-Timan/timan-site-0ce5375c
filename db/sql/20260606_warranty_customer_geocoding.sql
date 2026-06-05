-- Phase 61 — Warranty customer geocoding
--
-- Adds customer geocoding columns to public.warranty_registrations so the
-- partner map can render a separate machine/warranty layer (machine pins
-- placed at the customer's location, not at the dealer's).
--
-- Safe / idempotent: only ADD COLUMN IF NOT EXISTS. No data is deleted or
-- moved, and customer PII columns (name, phone, e-mail, full address) are
-- untouched. Lat/lng are derived server-side by the
-- `geocode-warranty-customers` edge function from the existing
-- customer_address / customer_postal_code / customer_city / customer_country
-- fields — no new PII is collected here.

ALTER TABLE public.warranty_registrations
  ADD COLUMN IF NOT EXISTS customer_latitude         double precision,
  ADD COLUMN IF NOT EXISTS customer_longitude        double precision,
  ADD COLUMN IF NOT EXISTS customer_geocoded_at      timestamptz,
  ADD COLUMN IF NOT EXISTS customer_geocoding_status text,
  ADD COLUMN IF NOT EXISTS customer_geocoding_error  text;

COMMENT ON COLUMN public.warranty_registrations.customer_latitude IS
  'Geocoded latitude for the customer address (machine pin on partner map).';
COMMENT ON COLUMN public.warranty_registrations.customer_longitude IS
  'Geocoded longitude for the customer address (machine pin on partner map).';
COMMENT ON COLUMN public.warranty_registrations.customer_geocoding_status IS
  'ok | not_found | skipped | error — set by geocode-warranty-customers.';

-- Helpful indexes for the partner-map machine layer (skip rows without coords).
CREATE INDEX IF NOT EXISTS warranty_registrations_customer_coords_idx
  ON public.warranty_registrations (customer_latitude, customer_longitude)
  WHERE customer_latitude IS NOT NULL AND customer_longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS warranty_registrations_customer_geocoding_status_idx
  ON public.warranty_registrations (customer_geocoding_status);
