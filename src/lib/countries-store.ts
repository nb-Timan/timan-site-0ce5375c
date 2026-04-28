/**
 * Countries store — grouped country list used by the Claim form.
 *
 * Mock implementation only (no backend yet). Persists user-added countries
 * to `localStorage` under `timan.countries.custom` so Timan Admin can add
 * new entries that survive page reloads in the preview.
 *
 * Two groups:
 *   1. Europe
 *   2. Outside Europe
 *
 * The dealer admin can only choose from this list — no free text input.
 */

export type CountryGroup = "europe" | "outside";

export interface Country {
  /** Standardized display name, e.g. "Denmark". */
  name: string;
  /** Group bucket. */
  group: CountryGroup;
}

export const COUNTRY_GROUP_LABEL: Record<CountryGroup, string> = {
  europe: "Europe",
  outside: "Outside Europe",
};

/** Default seed list — used until Timan Admin adds more. */
const DEFAULT_COUNTRIES: Country[] = [
  // Europe
  { name: "Denmark", group: "europe" },
  { name: "Sweden", group: "europe" },
  { name: "Norway", group: "europe" },
  { name: "Finland", group: "europe" },
  { name: "Germany", group: "europe" },
  { name: "Netherlands", group: "europe" },
  { name: "Belgium", group: "europe" },
  { name: "France", group: "europe" },
  { name: "Spain", group: "europe" },
  { name: "Italy", group: "europe" },
  { name: "Poland", group: "europe" },
  { name: "Czech Republic", group: "europe" },
  { name: "Austria", group: "europe" },
  { name: "Switzerland", group: "europe" },
  { name: "United Kingdom", group: "europe" },
  { name: "Ireland", group: "europe" },
  { name: "Portugal", group: "europe" },
  { name: "Estonia", group: "europe" },
  { name: "Latvia", group: "europe" },
  { name: "Lithuania", group: "europe" },
  { name: "Iceland", group: "europe" },
  { name: "Luxembourg", group: "europe" },
  { name: "Hungary", group: "europe" },
  { name: "Slovakia", group: "europe" },
  { name: "Slovenia", group: "europe" },
  { name: "Croatia", group: "europe" },
  { name: "Romania", group: "europe" },
  { name: "Bulgaria", group: "europe" },
  { name: "Greece", group: "europe" },
  // Outside Europe
  { name: "Japan", group: "outside" },
  { name: "Canada", group: "outside" },
  { name: "USA", group: "outside" },
  { name: "Australia", group: "outside" },
  { name: "Malaysia", group: "outside" },
];

const STORAGE_KEY = "timan.countries.custom";

function readCustom(): Country[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is Country =>
        !!c &&
        typeof c === "object" &&
        typeof (c as Country).name === "string" &&
        ((c as Country).group === "europe" || (c as Country).group === "outside"),
    );
  } catch {
    return [];
  }
}

function writeCustom(list: Country[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota / serialization errors in preview
  }
}

/** Returns the merged + de-duplicated country list, sorted alphabetically per group. */
export function getCountries(): Country[] {
  const custom = readCustom();
  const seen = new Set<string>();
  const merged: Country[] = [];
  for (const c of [...DEFAULT_COUNTRIES, ...custom]) {
    const key = c.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({ name: c.name.trim(), group: c.group });
  }
  return merged.sort((a, b) => {
    if (a.group !== b.group) return a.group === "europe" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Convenience helper — returns countries grouped for a select. */
export function getCountriesGrouped(): Record<CountryGroup, Country[]> {
  const all = getCountries();
  return {
    europe: all.filter((c) => c.group === "europe"),
    outside: all.filter((c) => c.group === "outside"),
  };
}

/** Add a new country (Timan Admin). No-op if name is empty or already exists. */
export function addCountry(name: string, group: CountryGroup): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const exists = getCountries().some(
    (c) => c.name.toLowerCase() === clean.toLowerCase(),
  );
  if (exists) return false;
  const custom = readCustom();
  custom.push({ name: clean, group });
  writeCustom(custom);
  return true;
}

/** Remove a custom country by name. Default countries cannot be removed. */
export function removeCustomCountry(name: string): boolean {
  const custom = readCustom();
  const next = custom.filter(
    (c) => c.name.toLowerCase() !== name.toLowerCase(),
  );
  if (next.length === custom.length) return false;
  writeCustom(next);
  return true;
}

/** True if the country was added by an admin (not part of the default seed list). */
export function isCustomCountry(name: string): boolean {
  return !DEFAULT_COUNTRIES.some(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
}
