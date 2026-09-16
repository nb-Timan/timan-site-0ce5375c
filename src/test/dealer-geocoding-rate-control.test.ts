import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dealerGeocodeAction,
  hasValidDealerCoordinates,
  normalizedDealerAddressSignature,
  retryAfterFromHeader,
} from "../../supabase/functions/geocode-dealers/geocodingRules";

const root = process.cwd();
const edgeSource = readFileSync(resolve(root, "supabase/functions/geocode-dealers/index.ts"), "utf8");
const migrationSource = readFileSync(resolve(root, "supabase/migrations/20260916092453_dealer_geocoding_rate_control.sql"), "utf8");
const mapSource = readFileSync(resolve(root, "src/pages/misc/PartnerMapPage.tsx"), "utf8");

describe("dealer geocoding rate control", () => {
  it("reuses valid stored coordinates and only geocodes missing or changed addresses", () => {
    const addressHash = "same-address";
    expect(hasValidDealerCoordinates(48.978865, 14.496171)).toBe(true);
    expect(dealerGeocodeAction({ latitude: 48.978865, longitude: 14.496171, geocoding_address_hash: addressHash }, addressHash)).toBe("reuse");
    expect(dealerGeocodeAction({ latitude: null, longitude: null, geocoding_address_hash: null }, addressHash)).toBe("geocode");
    expect(dealerGeocodeAction({ latitude: 48.978865, longitude: 14.496171, geocoding_address_hash: "old-address" }, addressHash)).toBe("geocode");
    expect(dealerGeocodeAction({ latitude: 48.978865, longitude: 14.496171, geocoding_address_hash: null }, addressHash)).toBe("adopt");
  });

  it("normalizes international address signatures without changing address content", () => {
    expect(normalizedDealerAddressSignature({
      street: "Rudolfovská 200/90", postalCode: "370 01", city: "České Budějovice", country: "Czechia",
    })).toBe("rudolfovska 200/90||370 01|ceske budejovice|czechia");
  });

  it("uses a bounded five-minute fallback for missing or invalid Retry-After", () => {
    expect(retryAfterFromHeader(null, 0)).toBe(5 * 60_000);
    expect(retryAfterFromHeader("12", 0)).toBe(12_000);
  });

  it("keeps map rendering on stored dealer coordinates and never invokes the geocoder", () => {
    expect(mapSource).toContain("coords: hasCoords ? [d.latitude as number, d.longitude as number] : null");
    expect(mapSource).not.toMatch(/requestDealerGeocoding|geocode-dealers|nominatim/i);
  });

  it("serializes all Nominatim calls and stops the batch after a 429", () => {
    expect(edgeSource).toContain('admin.rpc("acquire_dealer_geocoding_run"');
    expect(edgeSource).toContain('admin.rpc("reserve_dealer_nominatim_slot"');
    expect(edgeSource).toContain('geocoding_status: "rate_limited"');
    expect(edgeSource).toContain("if (error instanceof NominatimHttpError && error.status === 429) throw error;");
    expect(edgeSource).toMatch(/Nominatim er midlertidigt rate limited"\s*}\);\s*break;/);
  });

  it("persists the address signature and invalidates coordinates when canonical address fields change", () => {
    expect(migrationSource).toContain("add column if not exists geocoding_address_hash text");
    expect(migrationSource).toContain("invalidate_dealer_geocode_on_address_change");
    expect(migrationSource).toContain("new.latitude := null;");
    expect(migrationSource).toContain("create or replace function public.reserve_dealer_nominatim_slot");
  });
});
