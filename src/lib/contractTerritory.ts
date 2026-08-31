import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { resolveContractPostalAreaMetadata } from '@/lib/contractPostalMetadata';

export type ContractTerritoryCountryCode = 'DK' | 'DE' | 'SE';

export type ContractTerritoryRegion = {
  id: string;
  name: string;
};

export type ContractTerritoryMunicipality = ContractTerritoryRegion;

export type ContractPostalRange = {
  from: string;
  to: string;
};

export type ContractPostalEntry = {
  input: string;
  postalCode?: string;
  postalRange?: ContractPostalRange;
};

export type ContractTerritoryArea = {
  country: ContractTerritoryCountryCode;
  wholeCountry: boolean;
  selectedRegions: ContractTerritoryRegion[];
  municipalities: ContractTerritoryMunicipality[];
  postalEntries: ContractPostalEntry[];
  postalCodes: string[];
  postalRanges: ContractPostalRange[];
};

export type ContractSecondaryTerritoryArea = ContractTerritoryArea & {
  enabled: boolean;
};

export type ContractTerritorySnapshot = {
  primaryTerritory: ContractTerritoryArea;
  secondaryTerritory: ContractSecondaryTerritoryArea;
  primaryDescription: string;
  secondaryDescription: string | null;
};

export const CONTRACT_TERRITORY_COUNTRIES: Array<{
  code: ContractTerritoryCountryCode;
  label: Record<PortalUiLanguage, string>;
  postalLabel: Record<PortalUiLanguage, string>;
  postalDigits: number;
}> = [
  {
    code: 'DK',
    label: {
      da: 'Danmark',
      en: 'Denmark',
      de: 'Dänemark',
      it: 'Danimarca',
      hu: 'Dánia',
      sv: 'Danmark',
      fr: 'Danemark',
      pl: 'Dania',
      cs: 'Dánsko',
    },
    postalLabel: {
      da: 'Postnumre',
      en: 'Postal codes',
      de: 'Postleitzahlen',
      it: 'Codici postali',
      hu: 'Irányítószámok',
      sv: 'Postnummer',
      fr: 'Codes postaux',
      pl: 'Kody pocztowe',
      cs: 'PSČ',
    },
    postalDigits: 4,
  },
  {
    code: 'DE',
    label: {
      da: 'Tyskland',
      en: 'Germany',
      de: 'Deutschland',
      it: 'Germania',
      hu: 'Németország',
      sv: 'Tyskland',
      fr: 'Allemagne',
      pl: 'Niemcy',
      cs: 'Německo',
    },
    postalLabel: {
      da: 'PLZ/postnumre',
      en: 'PLZ/postal codes',
      de: 'PLZ/Postleitzahlen',
      it: 'PLZ/codici postali',
      hu: 'PLZ/irányítószámok',
      sv: 'PLZ/postnummer',
      fr: 'PLZ/codes postaux',
      pl: 'PLZ/kody pocztowe',
      cs: 'PLZ/PSČ',
    },
    postalDigits: 5,
  },
  {
    code: 'SE',
    label: {
      da: 'Sverige',
      en: 'Sweden',
      de: 'Schweden',
      it: 'Svezia',
      hu: 'Svédország',
      sv: 'Sverige',
      fr: 'Suède',
      pl: 'Szwecja',
      cs: 'Švédsko',
    },
    postalLabel: {
      da: 'Postnumre',
      en: 'Postal codes',
      de: 'Postleitzahlen',
      it: 'Codici postali',
      hu: 'Irányítószámok',
      sv: 'Postnummer',
      fr: 'Codes postaux',
      pl: 'Kody pocztowe',
      cs: 'PSČ',
    },
    postalDigits: 5,
  },
];

const COUNTRY_BY_CODE = new Map(CONTRACT_TERRITORY_COUNTRIES.map((country) => [country.code, country]));

function isTerritoryCountryCode(value: unknown): value is ContractTerritoryCountryCode {
  return value === 'DK' || value === 'DE' || value === 'SE';
}

function formatPostalCode(country: ContractTerritoryCountryCode, digitsOnly: string) {
  if (country === 'SE' && /^\d{5}$/.test(digitsOnly)) return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3)}`;
  return digitsOnly;
}

function postalComparable(value: string) {
  return Number(value.replace(/\s+/g, ''));
}

function normalizePostalCode(value: unknown, country: ContractTerritoryCountryCode) {
  const digits = COUNTRY_BY_CODE.get(country)?.postalDigits ?? 4;
  const raw = String(value ?? '').trim();
  const code = country === 'SE' ? raw.replace(/\s+/g, '') : raw;
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return '';
  return formatPostalCode(country, code);
}

function normalizePostalRange(value: unknown, country: ContractTerritoryCountryCode): ContractPostalRange | null {
  const item = value as Partial<ContractPostalRange> | null | undefined;
  const from = normalizePostalCode(item?.from, country);
  const to = normalizePostalCode(item?.to, country);
  if (!from || !to) return null;
  return postalComparable(from) <= postalComparable(to) ? { from, to } : { from: to, to: from };
}

function normalizePostalEntryInput(input: unknown, country: ContractTerritoryCountryCode): ContractPostalEntry {
  const digits = COUNTRY_BY_CODE.get(country)?.postalDigits ?? 4;
  const value = String(input ?? '').trim();
  const codePattern = country === 'SE' ? '(\\d{3}\\s?\\d{2})' : `(\\d{${digits}})`;
  const range = value.match(new RegExp(`^${codePattern}\\s*-\\s*${codePattern}$`));
  if (range) {
    const normalizedRange = normalizePostalRange({ from: range[1], to: range[2] }, country);
    return normalizedRange
      ? { input: `${normalizedRange.from}-${normalizedRange.to}`, postalRange: normalizedRange }
      : { input: value };
  }

  const code = normalizePostalCode(value, country);
  return code ? { input: code, postalCode: code } : { input: value };
}

function normalizePostalEntry(value: unknown, country: ContractTerritoryCountryCode): ContractPostalEntry {
  if (typeof value === 'string') return normalizePostalEntryInput(value, country);
  const entry = value as Partial<ContractPostalEntry> | null | undefined;
  if (typeof entry?.input === 'string') return normalizePostalEntryInput(entry.input, country);
  if (entry?.postalRange) return normalizePostalEntryInput(`${entry.postalRange.from}-${entry.postalRange.to}`, country);
  if (entry?.postalCode) return normalizePostalEntryInput(entry.postalCode, country);
  return { input: '' };
}

function postalEntryFromRange(range: ContractPostalRange): ContractPostalEntry {
  return { input: `${range.from}-${range.to}`, postalRange: range };
}

function postalEntryFromCode(code: string): ContractPostalEntry {
  return { input: code, postalCode: code };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function normalizeContractTerritoryRegion(value: unknown): ContractTerritoryRegion | null {
  const raw = value as Partial<ContractTerritoryRegion> | null | undefined;
  const id = String(raw?.id ?? '').trim();
  const name = String(raw?.name ?? '').trim();
  if (!/^\d{2,4}$/.test(id) || !name) return null;
  return { id, name };
}

export function normalizeContractTerritoryRegions(value: unknown): ContractTerritoryRegion[] {
  const items = Array.isArray(value) ? value : [];
  const byId = new Map<string, ContractTerritoryRegion>();

  for (const item of items) {
    const region = normalizeContractTerritoryRegion(item);
    if (region && !byId.has(region.id)) byId.set(region.id, region);
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'da'));
}

export const normalizeContractTerritoryMunicipalities = normalizeContractTerritoryRegions;

export function createEmptyContractTerritoryArea(country: ContractTerritoryCountryCode = 'DK'): ContractTerritoryArea {
  return {
    country,
    wholeCountry: false,
    selectedRegions: [],
    municipalities: [],
    postalEntries: [],
    postalCodes: [],
    postalRanges: [],
  };
}

export function createEmptySecondaryContractTerritoryArea(country: ContractTerritoryCountryCode = 'DK'): ContractSecondaryTerritoryArea {
  return {
    ...createEmptyContractTerritoryArea(country),
    enabled: false,
  };
}

export function normalizeContractTerritoryArea(
  value: unknown,
  fallbackCountry: ContractTerritoryCountryCode = 'DK',
): ContractTerritoryArea {
  const raw = value as Partial<ContractTerritoryArea> | null | undefined;
  const country = isTerritoryCountryCode(raw?.country) ? raw.country : fallbackCountry;
  const legacyCodes = unique((Array.isArray(raw?.postalCodes) ? raw.postalCodes : [])
    .map((code) => normalizePostalCode(code, country))
    .filter(Boolean));
  const legacyRanges = (Array.isArray(raw?.postalRanges) ? raw.postalRanges : [])
    .map((range) => normalizePostalRange(range, country))
    .filter((range): range is ContractPostalRange => Boolean(range));
  const rawPostalEntries = Array.isArray(raw?.postalEntries) ? raw.postalEntries : [];
  const selectedRegions = raw?.wholeCountry
    ? []
    : normalizeContractTerritoryRegions(
        Array.isArray(raw?.selectedRegions)
          ? raw.selectedRegions
          : raw?.municipalities,
      );
  const postalEntries = rawPostalEntries.length > 0
    ? rawPostalEntries.map((entry) => normalizePostalEntry(entry, country))
    : [
        ...legacyRanges.map(postalEntryFromRange),
        ...legacyCodes.map(postalEntryFromCode),
      ];
  const validEntries = postalEntries.filter((entry) => entry.postalCode || entry.postalRange);

  return {
    country,
    wholeCountry: Boolean(raw?.wholeCountry),
    selectedRegions,
    municipalities: country === 'DK' || country === 'SE' ? selectedRegions : [],
    postalEntries,
    postalCodes: unique(validEntries.map((entry) => entry.postalCode).filter((code): code is string => Boolean(code))),
    postalRanges: validEntries.map((entry) => entry.postalRange).filter((range): range is ContractPostalRange => Boolean(range)),
  };
}

export function normalizeContractSecondaryTerritoryArea(
  value: unknown,
  fallbackCountry: ContractTerritoryCountryCode = 'DK',
): ContractSecondaryTerritoryArea {
  const raw = value as Partial<ContractSecondaryTerritoryArea> | null | undefined;
  return {
    ...normalizeContractTerritoryArea(raw, fallbackCountry),
    enabled: Boolean(raw?.enabled),
  };
}

export function parseContractPostalInput(input: string, countryCode: ContractTerritoryCountryCode) {
  const postalCodes: string[] = [];
  const postalRanges: ContractPostalRange[] = [];
  const postalEntries: ContractPostalEntry[] = [];
  const invalidTokens: string[] = [];

  const tokens = countryCode === 'SE'
    ? input.split(/[,;\n]+/)
    : input.split(/[\s,;]+/);

  tokens
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const entry = normalizePostalEntryInput(token, countryCode);
      if (entry.postalRange) {
        postalRanges.push(entry.postalRange);
        postalEntries.push(entry);
        return;
      }
      if (entry.postalCode) {
        postalCodes.push(entry.postalCode);
        postalEntries.push(entry);
        return;
      }

      invalidTokens.push(token);
    });

  return {
    postalEntries,
    postalCodes: unique(postalCodes),
    postalRanges,
    invalidTokens,
  };
}

export function parseContractPostalFieldValue(input: string, countryCode: ContractTerritoryCountryCode) {
  return normalizePostalEntryInput(input, countryCode);
}

export function buildContractTerritoryAreaFromPostalFields(
  area: ContractTerritoryArea,
  fieldValues: string[],
): ContractTerritoryArea {
  return normalizeContractTerritoryArea({
    ...area,
    wholeCountry: false,
    postalEntries: fieldValues.map((value) => normalizePostalEntryInput(value, area.country)),
  }, area.country);
}

export function serializeContractPostalInput(area: ContractTerritoryArea) {
  const normalized = normalizeContractTerritoryArea(area);
  return normalized.postalEntries
    .filter((entry) => entry.postalCode || entry.postalRange)
    .map((entry) => entry.postalRange ? `${entry.postalRange.from}-${entry.postalRange.to}` : entry.postalCode!)
    .join(', ');
}

function formatContractTerritoryPostalEntry(
  area: ContractTerritoryArea,
  entry: ContractPostalEntry,
) {
  if (entry.postalRange) return `${entry.postalRange.from}–${entry.postalRange.to}`;
  if (!entry.postalCode) return '';

  const metadata = resolveContractPostalAreaMetadata(area.country, entry.postalCode);
  return metadata?.locality
    ? `${entry.postalCode} ${metadata.locality}`
    : entry.postalCode;
}

function formatContractTerritoryRegionName(area: ContractTerritoryArea, region: ContractTerritoryRegion) {
  if (area.country === 'DK' && !/\bkommune$/i.test(region.name)) return `${region.name} Kommune`;
  return region.name;
}

export function isValidContractTerritoryArea(area: ContractTerritoryArea) {
  if (area.wholeCountry) return true;
  const normalized = normalizeContractTerritoryArea(area);
  const firstEntry = normalized.postalEntries[0];
  return normalized.selectedRegions.length > 0 || Boolean(firstEntry?.postalCode || firstEntry?.postalRange);
}

export function hasValidContractTerritory(form: {
  primaryTerritory?: unknown;
  secondaryTerritory?: unknown;
}) {
  const primary = normalizeContractTerritoryArea(form.primaryTerritory);
  return isValidContractTerritoryArea(primary);
}

export function getContractTerritoryCountryLabel(
  countryCode: ContractTerritoryCountryCode,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const country = COUNTRY_BY_CODE.get(countryCode) ?? COUNTRY_BY_CODE.get('DK')!;
  return country.label[language as PortalUiLanguage] ?? country.label.da;
}

export function getContractTerritoryPostalLabel(
  countryCode: ContractTerritoryCountryCode,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const country = COUNTRY_BY_CODE.get(countryCode) ?? COUNTRY_BY_CODE.get('DK')!;
  return country.postalLabel[language as PortalUiLanguage] ?? country.postalLabel.da;
}

export function describeContractTerritoryArea(
  areaInput: unknown,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  return getContractTerritoryDisplayItems(areaInput, language).join(', ');
}

export function getContractTerritoryDisplayItems(
  areaInput: unknown,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const area = normalizeContractTerritoryArea(areaInput);
  const country = getContractTerritoryCountryLabel(area.country, language);
  if (area.wholeCountry) {
    return [language === 'en' ? `${country} - Whole country` : `${country} - Hele landet`];
  }
  const regionLabel = area.country === 'DK' || area.country === 'SE'
    ? (language === 'en' ? 'Municipality' : 'Kommune')
    : (language === 'en' ? 'Selected area' : 'Valgt område');
  const regionItems = area.selectedRegions.map((region) => `${regionLabel}: ${formatContractTerritoryRegionName(area, region)}`);
  const postalItems = area.postalEntries
    .filter((entry) => entry.postalCode || entry.postalRange)
    .map((entry) => formatContractTerritoryPostalEntry(area, entry))
    .filter(Boolean);
  return [
    `${language === 'en' ? 'Country' : 'Land'}: ${country}`,
    ...regionItems,
    ...postalItems.map((item) => `${language === 'en' ? 'Postal code' : 'Postnummer'}: ${item}`),
  ];
}

export function describeContractSecondaryTerritoryArea(
  areaInput: unknown,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const area = normalizeContractSecondaryTerritoryArea(areaInput);
  if (!area.enabled || !isValidContractTerritoryArea(area)) return '';
  return describeContractTerritoryArea(area, language);
}

export function buildContractTerritorySnapshot(form: {
  primaryTerritory?: unknown;
  secondaryTerritory?: unknown;
}): ContractTerritorySnapshot {
  const primaryTerritory = normalizeContractTerritoryArea(form.primaryTerritory);
  const secondaryTerritory = normalizeContractSecondaryTerritoryArea(form.secondaryTerritory, primaryTerritory.country);
  const secondaryDescription = describeContractSecondaryTerritoryArea(secondaryTerritory, 'da') || null;

  return {
    primaryTerritory,
    secondaryTerritory,
    primaryDescription: describeContractTerritoryArea(primaryTerritory, 'da'),
    secondaryDescription,
  };
}

export type ContractTerritoryMapBand = {
  key: string;
  label: string;
  top: number;
  height: number;
  variant: 'primary' | 'secondary';
};

export function getContractTerritoryMapBands(
  areaInput: unknown,
  variant: ContractTerritoryMapBand['variant'],
): ContractTerritoryMapBand[] {
  const area = normalizeContractTerritoryArea(areaInput);
  const digits = COUNTRY_BY_CODE.get(area.country)?.postalDigits ?? 4;
  const max = 10 ** digits - 1;

  if (area.wholeCountry) {
    return [{ key: `${variant}-whole-${area.country}`, label: getContractTerritoryCountryLabel(area.country), top: 5, height: 90, variant }];
  }

  const ranges = [
    ...area.postalRanges,
    ...area.postalCodes.map((code) => ({ from: code, to: code })),
  ];

  return ranges.map((range, index) => {
    const start = postalComparable(range.from);
    const end = postalComparable(range.to);
    const low = Math.max(0, Math.min(start, end));
    const high = Math.min(max, Math.max(start, end));
    const top = 5 + (low / max) * 86;
    const height = Math.max(7, ((high - low + 1) / max) * 86);
    const label = range.from === range.to ? range.from : `${range.from}-${range.to}`;
    return {
      key: `${variant}-${area.country}-${range.from}-${range.to}-${index}`,
      label,
      top: Math.min(91, top),
      height: Math.min(90 - top + 5, height),
      variant,
    };
  });
}
