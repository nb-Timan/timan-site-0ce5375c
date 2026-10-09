export type DealerGeocodingSnapshot = {
  latitude: number | null;
  longitude: number | null;
  geocoding_address_hash: string | null;
};

export function hasValidDealerCoordinates(latitude: number | null, longitude: number | null): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(Number(latitude)) <= 90
    && Math.abs(Number(longitude)) <= 180;
}

export function normalizedDealerAddressSignature(parts: {
  street: string;
  addressLine2?: string | null;
  postalCode: string;
  city: string;
  country: string;
}): string {
  return [parts.street, parts.addressLine2 ?? "", parts.postalCode, parts.city, parts.country]
    .map((value) => value
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase())
    .join("|");
}

export function dealerGeocodeAction(
  snapshot: DealerGeocodingSnapshot,
  currentAddressHash: string,
): "reuse" | "adopt" | "geocode" {
  if (!hasValidDealerCoordinates(snapshot.latitude, snapshot.longitude)) return "geocode";
  if (!snapshot.geocoding_address_hash) return "adopt";
  return snapshot.geocoding_address_hash === currentAddressHash ? "reuse" : "geocode";
}

export function retryAfterFromHeader(value: string | null, now = Date.now()): number {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1000);
  const date = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(date) && date > now ? date - now : 5 * 60_000;
}
