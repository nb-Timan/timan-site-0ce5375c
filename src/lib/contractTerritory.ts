import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractTerritoryCountryCode = 'DK' | 'DE';

export type ContractPostalRange = {
  from: string;
  to: string;
};

export type ContractTerritoryArea = {
  country: ContractTerritoryCountryCode;
  wholeCountry: boolean;
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
];

const COUNTRY_BY_CODE = new Map(CONTRACT_TERRITORY_COUNTRIES.map((country) => [country.code, country]));

function isTerritoryCountryCode(value: unknown): value is ContractTerritoryCountryCode {
  return value === 'DK' || value === 'DE';
}

function normalizePostalCode(value: unknown, digits: number) {
  const code = String(value ?? '').trim();
  if (!new RegExp(`^\\d{${digits}}$`).test(code)) return '';
  return code;
}

function normalizePostalRange(value: unknown, digits: number): ContractPostalRange | null {
  const item = value as Partial<ContractPostalRange> | null | undefined;
  const from = normalizePostalCode(item?.from, digits);
  const to = normalizePostalCode(item?.to, digits);
  if (!from || !to) return null;
  return Number(from) <= Number(to) ? { from, to } : { from: to, to: from };
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function createEmptyContractTerritoryArea(country: ContractTerritoryCountryCode = 'DK'): ContractTerritoryArea {
  return {
    country,
    wholeCountry: false,
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
  const digits = COUNTRY_BY_CODE.get(country)?.postalDigits ?? 4;

  return {
    country,
    wholeCountry: Boolean(raw?.wholeCountry),
    postalCodes: unique((Array.isArray(raw?.postalCodes) ? raw.postalCodes : [])
      .map((code) => normalizePostalCode(code, digits))
      .filter(Boolean)),
    postalRanges: (Array.isArray(raw?.postalRanges) ? raw.postalRanges : [])
      .map((range) => normalizePostalRange(range, digits))
      .filter((range): range is ContractPostalRange => Boolean(range)),
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
  const digits = COUNTRY_BY_CODE.get(countryCode)?.postalDigits ?? 4;
  const postalCodes: string[] = [];
  const postalRanges: ContractPostalRange[] = [];
  const invalidTokens: string[] = [];

  input
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const from = normalizePostalCode(range[1], digits);
        const to = normalizePostalCode(range[2], digits);
        if (from && to) {
          postalRanges.push(Number(from) <= Number(to) ? { from, to } : { from: to, to: from });
          return;
        }
      }

      const code = normalizePostalCode(token, digits);
      if (code) {
        postalCodes.push(code);
        return;
      }

      invalidTokens.push(token);
    });

  return {
    postalCodes: unique(postalCodes),
    postalRanges,
    invalidTokens,
  };
}

export function serializeContractPostalInput(area: ContractTerritoryArea) {
  return [
    ...area.postalRanges.map((range) => `${range.from}-${range.to}`),
    ...area.postalCodes,
  ].join(', ');
}

export function isValidContractTerritoryArea(area: ContractTerritoryArea) {
  return area.wholeCountry || area.postalCodes.length > 0 || area.postalRanges.length > 0;
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
  const area = normalizeContractTerritoryArea(areaInput);
  const country = getContractTerritoryCountryLabel(area.country, language);
  if (area.wholeCountry) {
    return language === 'en' ? `${country} - Whole country` : `${country} - Hele landet`;
  }
  const postalItems = serializeContractPostalInput(area);
  return postalItems ? `${country} - ${postalItems}` : '';
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
    const start = Number(range.from);
    const end = Number(range.to);
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
