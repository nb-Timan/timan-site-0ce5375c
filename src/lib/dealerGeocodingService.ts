import { supabase } from "@/lib/supabase";
import { updateDealerAccount, type UpdateDealerAccountPatch } from "@/lib/dealerAccountsService";

export type DealerGeoInput = {
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
};

export type DealerAddressParts = {
  address?: string | null;
  address_line_1?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
};

type GeocodeSummary = {
  geocoded?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ reason?: string }>;
  error?: string;
};

const filled = (value: string | null | undefined) => Boolean(value?.trim());

export function hasUsableDealerAddress(parts: DealerAddressParts): boolean {
  return Boolean(
    filled(parts.address_line_1 ?? parts.address) &&
    (filled(parts.postal_code) || filled(parts.city)) &&
    filled(parts.country),
  );
}

export function buildResolvedGeocodingPatch(geo: DealerGeoInput | null): UpdateDealerAccountPatch | null {
  if (typeof geo?.latitude !== "number" || typeof geo.longitude !== "number") return null;
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    google_place_id: geo.google_place_id ?? null,
    geocoded_at: new Date().toISOString(),
    geocoding_status: "ok",
    geocoding_error: null,
  };
}

export function buildPendingGeocodingPatch(hasAddress: boolean): UpdateDealerAccountPatch {
  return {
    latitude: null,
    longitude: null,
    google_place_id: null,
    geocoded_at: hasAddress ? null : new Date().toISOString(),
    geocoding_status: hasAddress ? "pending" : "skipped",
    geocoding_error: hasAddress ? null : "Ingen komplet adresse til geokodning.",
  };
}

export async function requestDealerGeocoding(dealerId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke<GeocodeSummary>("geocode-dealers", {
    body: { dealerId, limit: 1, retryFailed: true },
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  if ((data?.geocoded ?? 0) > 0) return { ok: true };
  const firstError = data?.errors?.find((item) => item.reason)?.reason;
  if ((data?.failed ?? 0) > 0 || (data?.skipped ?? 0) > 0) {
    return { ok: false, error: firstError ?? "Geokodning fandt ikke koordinater for adressen." };
  }
  return { ok: true };
}

export async function saveDealerGeocodingForAddress(args: {
  dealerId: string;
  address: DealerAddressParts;
  geo: DealerGeoInput | null;
}): Promise<{ ok: boolean; error?: string }> {
  const resolvedPatch = buildResolvedGeocodingPatch(args.geo);
  if (resolvedPatch) {
    const saved = await updateDealerAccount(args.dealerId, resolvedPatch);
    return saved.ok ? { ok: true } : { ok: false, error: saved.error };
  }

  const hasAddress = hasUsableDealerAddress(args.address);
  const pending = await updateDealerAccount(args.dealerId, buildPendingGeocodingPatch(hasAddress));
  if (!pending.ok) return { ok: false, error: pending.error };
  if (!hasAddress) return { ok: true };

  return requestDealerGeocoding(args.dealerId);
}
