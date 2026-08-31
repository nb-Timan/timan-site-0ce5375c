import { toCountryCode } from "@/lib/formatCountry";

export const DEFAULT_ADDRESS_AUTOCOMPLETE_COUNTRIES = [
  "dk",
  "de",
  "se",
  "fr",
  "it",
  "hu",
  "pl",
  "cz",
  "ch",
  "at",
  "gb",
] as const;

export interface ResolvedAddress {
  formatted: string;
  street: string | null;
  house_number: string | null;
  address_line_1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  country_name: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface GooglePlaceResult {
  formatted_address?: string;
  name?: string;
  place_id?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat: () => number; lng: () => number } };
}

function pick(components: GoogleAddressComponent[] | undefined, type: string, useShort = false): string | null {
  if (!components) return null;
  const component = components.find((item) => item.types.includes(type));
  if (!component) return null;
  return useShort ? component.short_name : component.long_name;
}

export function resolveAddressFromGooglePlace(place: GooglePlaceResult): ResolvedAddress {
  const components = place.address_components;
  const street = pick(components, "route");
  const houseNumber = pick(components, "street_number");
  const line1 = [street, houseNumber].filter(Boolean).join(" ").trim() || null;
  const postal = pick(components, "postal_code");
  const city =
    pick(components, "postal_town") ||
    pick(components, "locality") ||
    pick(components, "sublocality") ||
    pick(components, "administrative_area_level_3") ||
    pick(components, "administrative_area_level_2") ||
    pick(components, "administrative_area_level_1");
  const countryShort = pick(components, "country", true);
  const countryLong = pick(components, "country");
  const lat = place.geometry?.location?.lat?.();
  const lng = place.geometry?.location?.lng?.();
  return {
    formatted: place.formatted_address || place.name || "",
    street,
    house_number: houseNumber,
    address_line_1: line1,
    postal_code: postal,
    city,
    country: toCountryCode(countryShort) ?? toCountryCode(countryLong) ?? (countryShort ? countryShort.toUpperCase() : null),
    country_name: countryLong,
    latitude: typeof lat === "number" ? lat : null,
    longitude: typeof lng === "number" ? lng : null,
    google_place_id: place.place_id || null,
  };
}

