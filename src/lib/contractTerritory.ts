import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { resolveContractPostalAreaMetadata } from '@/lib/contractPostalMetadata';
import {
  CONTRACT_WORLD_COUNTRY_CODES,
  CONTRACT_WORLD_COUNTRY_LABELS,
  getContractWholeCountryLabel,
} from '@/lib/contractWorldCountries';

export type ContractTerritoryCountryCode = string;
export type ContractTerritoryDetailedCountryCode = 'DK' | 'DE' | 'SE';

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

export type ContractTerritoryDisplayGroups = {
  countryLine: string;
  wholeCountry: boolean;
  regionLabel: string;
  regions: string[];
  postalLabel: string;
  postals: string[];
};

const CONTRACT_TERRITORY_POSTAL_COUNTRIES: Array<{
  code: ContractTerritoryDetailedCountryCode;
  postalLabel: Record<PortalUiLanguage, string>;
  postalDigits: number;
}> = [
  {
    code: 'DK',
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
      tr: 'PSČ',
    },
    postalDigits: 4,
  },
  {
    code: 'DE',
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
      tr: 'PLZ/PSČ',
    },
    postalDigits: 5,
  },
  {
    code: 'SE',
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
      tr: 'PSČ',
    },
    postalDigits: 5,
  },
];

export const CONTRACT_TERRITORY_COUNTRIES = CONTRACT_WORLD_COUNTRY_CODES.map((code) => ({ code }));

const COUNTRY_BY_CODE = new Map(CONTRACT_TERRITORY_POSTAL_COUNTRIES.map((country) => [country.code, country]));

const COUNTRY_ALIASES: Record<string, ContractTerritoryCountryCode> = {
  'czech republic': 'CZ',
  czechia: 'CZ',
  tjekkiet: 'CZ',
  england: 'GB',
  'united kingdom': 'GB',
  storbritannien: 'GB',
  holland: 'NL',
};

export function resolveContractTerritoryCountryCode(
  value: unknown,
  fallback: ContractTerritoryCountryCode = 'DK',
) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const code = raw.toUpperCase();
  if (CONTRACT_WORLD_COUNTRY_LABELS[code]) return code;

  const normalized = raw.toLocaleLowerCase('da').replace(/\s+/g, ' ');
  if (COUNTRY_ALIASES[normalized]) return COUNTRY_ALIASES[normalized];
  for (const [countryCode, labels] of Object.entries(CONTRACT_WORLD_COUNTRY_LABELS)) {
    if (Object.values(labels).some((label) => label.toLocaleLowerCase('da') === normalized)) return countryCode;
  }
  return fallback;
}

function isTerritoryCountryCode(value: unknown): value is ContractTerritoryCountryCode {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value.trim().toUpperCase());
}

function formatPostalCode(country: ContractTerritoryCountryCode, digitsOnly: string) {
  if (country === 'SE' && /^\d{5}$/.test(digitsOnly)) return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3)}`;
  return digitsOnly;
}

function postalComparable(value: string) {
  return Number(value.replace(/\s+/g, ''));
}

function comparePostalCodes(left: string, right: string) {
  const leftNumeric = postalComparable(left);
  const rightNumeric = postalComparable(right);
  if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric)) return leftNumeric - rightNumeric;
  return left.localeCompare(right, 'da', { numeric: true });
}

function normalizePostalCode(value: unknown, country: ContractTerritoryCountryCode) {
  const raw = String(value ?? '').trim();
  const config = COUNTRY_BY_CODE.get(country as ContractTerritoryDetailedCountryCode);
  if (!config) return /^[\p{L}\d][\p{L}\d -]{1,11}$/u.test(raw) ? raw.toLocaleUpperCase('da') : '';
  const digits = config.postalDigits;
  const code = country === 'SE' ? raw.replace(/\s+/g, '') : raw;
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return '';
  return formatPostalCode(country, code);
}

function normalizePostalRange(value: unknown, country: ContractTerritoryCountryCode): ContractPostalRange | null {
  const item = value as Partial<ContractPostalRange> | null | undefined;
  const from = normalizePostalCode(item?.from, country);
  const to = normalizePostalCode(item?.to, country);
  if (!from || !to) return null;
  return comparePostalCodes(from, to) <= 0
    ? { from, to }
    : { from: to, to: from };
}

function normalizePostalEntryInput(input: unknown, country: ContractTerritoryCountryCode): ContractPostalEntry {
  const value = String(input ?? '').trim();
  const config = COUNTRY_BY_CODE.get(country as ContractTerritoryDetailedCountryCode);
  const digits = config?.postalDigits ?? 4;
  const codePattern = country === 'SE' ? '(\\d{3}\\s?\\d{2})' : `(\\d{${digits}})`;
  const range = config
    ? value.match(new RegExp(`^${codePattern}\\s*-\\s*${codePattern}$`))
    : value.match(/^(.+?)\s+-\s+(.+)$/);
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
  const country = isTerritoryCountryCode(raw?.country)
    ? raw.country.trim().toUpperCase()
    : fallbackCountry;
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

  const tokens = !COUNTRY_BY_CODE.has(countryCode as ContractTerritoryDetailedCountryCode)
    ? input.split(/[,;\n]+/)
    : countryCode === 'SE'
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
  const code = String(countryCode).trim().toUpperCase();
  return getContractWholeCountryLabel(code, language);
}

export function getContractTerritoryPostalLabel(
  countryCode: ContractTerritoryCountryCode,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const country = COUNTRY_BY_CODE.get(countryCode as ContractTerritoryDetailedCountryCode);
  if (!country) return language === 'en' ? 'Postal codes' : 'Postnumre';
  return country.postalLabel[language as PortalUiLanguage] ?? country.postalLabel.da;
}

function getContractTerritoryPostalEntryLabel(language: PortalUiLanguage | string | null | undefined) {
  const labels: Record<PortalUiLanguage, string> = {
    da: 'Postnummer',
    en: 'Postal code',
    de: 'Postleitzahl',
    it: 'Codice postale',
    hu: 'Irányítószám',
    sv: 'Postnummer',
    fr: 'Code postal',
    pl: 'Kod pocztowy',
    cs: 'PSČ',
    tr: 'PSČ',
  };
  return labels[language as PortalUiLanguage] ?? labels.da;
}

export function getContractTerritoryRegionLabel(
  countryCode: ContractTerritoryCountryCode,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  if (countryCode === 'DK' || countryCode === 'SE') {
    const labels: Record<PortalUiLanguage, string> = {
      da: 'Kommuner',
      en: 'Municipalities',
      de: 'Kommunen',
      it: 'Comuni',
      hu: 'Onkormanyzatok',
      sv: 'Kommuner',
      fr: 'Communes',
      pl: 'Gminy',
      cs: 'Obce',
      tr: 'Obce',
    };
    return labels[language as PortalUiLanguage] ?? labels.da;
  }

  const labels: Record<PortalUiLanguage, string> = {
    da: 'Valgte områder',
    en: 'Selected areas',
    de: 'Ausgewaehlte Gebiete',
    it: 'Aree selezionate',
    hu: 'Kivalasztott teruletek',
    sv: 'Valda omraden',
    fr: 'Zones selectionnees',
    pl: 'Wybrane obszary',
    cs: 'Vybrane oblasti',
    tr: 'Vybrane oblasti',
  };
  return labels[language as PortalUiLanguage] ?? labels.da;
}

export function getContractTerritoryDisplayGroups(
  areaInput: unknown,
  language: PortalUiLanguage | string | null | undefined = 'da',
): ContractTerritoryDisplayGroups {
  const area = normalizeContractTerritoryArea(areaInput);
  const country = getContractTerritoryCountryLabel(area.country, language);
  const displayLabels: Record<PortalUiLanguage, { wholeCountry: string; country: string; municipality: string; selectedArea: string }> = {
    da: { wholeCountry: 'Hele landet', country: 'Land', municipality: 'Kommune', selectedArea: 'Valgt område' },
    en: { wholeCountry: 'Whole country', country: 'Country', municipality: 'Municipality', selectedArea: 'Selected area' },
    de: { wholeCountry: 'Ganzes Land', country: 'Land', municipality: 'Gemeinde', selectedArea: 'Ausgewähltes Gebiet' },
    it: { wholeCountry: 'Intero Paese', country: 'Paese', municipality: 'Comune', selectedArea: 'Area selezionata' },
    hu: { wholeCountry: 'Teljes ország', country: 'Ország', municipality: 'Önkormányzat', selectedArea: 'Kiválasztott terület' },
    sv: { wholeCountry: 'Hela landet', country: 'Land', municipality: 'Kommun', selectedArea: 'Valt område' },
    fr: { wholeCountry: 'Tout le pays', country: 'Pays', municipality: 'Commune', selectedArea: 'Zone sélectionnée' },
    pl: { wholeCountry: 'Cały kraj', country: 'Kraj', municipality: 'Gmina', selectedArea: 'Wybrany obszar' },
    cs: { wholeCountry: 'Celá země', country: 'Země', municipality: 'Obec', selectedArea: 'Vybraná oblast' },
    tr: { wholeCountry: 'Celá země', country: 'Země', municipality: 'Obec', selectedArea: 'Vybraná oblast' },
  };
  const labels = displayLabels[language as PortalUiLanguage] ?? displayLabels.da;

  if (area.wholeCountry) {
    return {
      countryLine: `${country} - ${labels.wholeCountry}`,
      wholeCountry: true,
      regionLabel: getContractTerritoryRegionLabel(area.country, language),
      regions: [],
      postalLabel: getContractTerritoryPostalLabel(area.country, language),
      postals: [],
    };
  }

  return {
    countryLine: `${labels.country}: ${country}`,
    wholeCountry: false,
    regionLabel: getContractTerritoryRegionLabel(area.country, language),
    regions: area.selectedRegions.map((region) => formatContractTerritoryRegionName(area, region)),
    postalLabel: getContractTerritoryPostalLabel(area.country, language),
    postals: area.postalEntries
      .filter((entry) => entry.postalCode || entry.postalRange)
      .map((entry) => formatContractTerritoryPostalEntry(area, entry))
      .filter(Boolean),
  };
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
  const displayLabels: Record<PortalUiLanguage, { wholeCountry: string; country: string; municipality: string; selectedArea: string }> = {
    da: { wholeCountry: 'Hele landet', country: 'Land', municipality: 'Kommune', selectedArea: 'Valgt område' },
    en: { wholeCountry: 'Whole country', country: 'Country', municipality: 'Municipality', selectedArea: 'Selected area' },
    de: { wholeCountry: 'Ganzes Land', country: 'Land', municipality: 'Gemeinde', selectedArea: 'Ausgewähltes Gebiet' },
    it: { wholeCountry: 'Intero Paese', country: 'Paese', municipality: 'Comune', selectedArea: 'Area selezionata' },
    hu: { wholeCountry: 'Teljes ország', country: 'Ország', municipality: 'Önkormányzat', selectedArea: 'Kiválasztott terület' },
    sv: { wholeCountry: 'Hela landet', country: 'Land', municipality: 'Kommun', selectedArea: 'Valt område' },
    fr: { wholeCountry: 'Tout le pays', country: 'Pays', municipality: 'Commune', selectedArea: 'Zone sélectionnée' },
    pl: { wholeCountry: 'Cały kraj', country: 'Kraj', municipality: 'Gmina', selectedArea: 'Wybrany obszar' },
    cs: { wholeCountry: 'Celá země', country: 'Země', municipality: 'Obec', selectedArea: 'Vybraná oblast' },
    tr: { wholeCountry: 'Celá země', country: 'Země', municipality: 'Obec', selectedArea: 'Vybraná oblast' },
  };
  const labels = displayLabels[language as PortalUiLanguage] ?? displayLabels.da;
  if (area.wholeCountry) {
    return [`${country} - ${labels.wholeCountry}`];
  }
  const regionLabel = area.country === 'DK' || area.country === 'SE'
    ? labels.municipality
    : labels.selectedArea;
  const regionItems = area.selectedRegions.map((region) => `${regionLabel}: ${formatContractTerritoryRegionName(area, region)}`);
  const postalItems = area.postalEntries
    .filter((entry) => entry.postalCode || entry.postalRange)
    .map((entry) => formatContractTerritoryPostalEntry(area, entry))
    .filter(Boolean);
  return [
    `${labels.country}: ${country}`,
    ...regionItems,
    ...postalItems.map((item) => `${getContractTerritoryPostalEntryLabel(language)}: ${item}`),
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
  const digits = COUNTRY_BY_CODE.get(area.country as ContractTerritoryDetailedCountryCode)?.postalDigits ?? 4;
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
