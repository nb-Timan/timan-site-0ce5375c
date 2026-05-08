/**
 * Shared helpers for matching seller initials across the app.
 *
 * Historical mismatch: dealer_accounts use "AK" for Alexander Kirschner,
 * while budget/forecast/order data and BUDGET_SELLERS use "AKR".
 * Both must resolve to the same seller.
 */

const ALIASES: Record<string, string> = {
  AKR: "AK",
  AK: "AK",
};

/** Canonicalises seller initials so AK and AKR collapse to "AK". */
export function normalizeSellerInitials(input: string | null | undefined): string {
  const v = (input || "").trim().toUpperCase();
  if (!v) return "";
  return ALIASES[v] || v;
}

/** True when two initials values refer to the same seller. */
export function sellerInitialsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeSellerInitials(a);
  const nb = normalizeSellerInitials(b);
  return !!na && na === nb;
}

/** Map free-text country names (DA/EN) to ISO-3166 alpha-2 codes. */
const COUNTRY_TO_ISO: Record<string, string> = {
  // Already ISO
  dk: "DK", de: "DE", se: "SE", no: "NO", ch: "CH", fi: "FI", cz: "CZ",
  si: "SI", es: "ES", fr: "FR", gb: "GB", uk: "GB", at: "AT", nl: "NL",
  be: "BE", pl: "PL", it: "IT", ie: "IE", pt: "PT", hu: "HU", sk: "SK",
  // Danish names
  danmark: "DK", tyskland: "DE", sverige: "SE", norge: "NO", schweiz: "CH",
  finland: "FI", tjekkiet: "CZ", slovenien: "SI", spanien: "ES",
  frankrig: "FR", england: "GB", storbritannien: "GB", østrig: "AT",
  oestrig: "AT", holland: "NL", nederlandene: "NL", belgien: "BE",
  polen: "PL", italien: "IT", irland: "IE", portugal: "PT", ungarn: "HU",
  slovakiet: "SK",
  // English names
  denmark: "DK", germany: "DE", sweden: "SE", norway: "NO", switzerland: "CH",
  "czech republic": "CZ", czechia: "CZ", slovenia: "SI", spain: "ES",
  france: "FR", "united kingdom": "GB", "great britain": "GB", austria: "AT",
  netherlands: "NL", belgium: "BE", poland: "PL", italy: "IT", ireland: "IE",
  hungary: "HU", slovakia: "SK",
};

export function countryToIso(input: string | null | undefined): string | null {
  const v = (input || "").trim().toLowerCase();
  if (!v) return null;
  return COUNTRY_TO_ISO[v] || (v.length === 2 ? v.toUpperCase() : null);
}

/** Compact display for a set of countries: "DK", "DE +2", or "Land ukendt". */
export function formatCountryBadge(countries: Array<string | null | undefined>): {
  label: string;
  tooltip: string | null;
} {
  const isos = Array.from(
    new Set(
      countries
        .map((c) => countryToIso(c))
        .filter((c): c is string => !!c),
    ),
  ).sort();
  if (isos.length === 0) return { label: "Land ukendt", tooltip: null };
  if (isos.length === 1) return { label: isos[0], tooltip: null };
  return { label: `${isos[0]} +${isos.length - 1}`, tooltip: isos.join(", ") };
}
