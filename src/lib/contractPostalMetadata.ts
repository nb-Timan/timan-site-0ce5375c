import denmarkPostalCodeMetadata from '@/data/denmark-postal-code-metadata.json';
import type { ContractTerritoryCountryCode } from '@/lib/contractTerritory';

export type ContractPostalAreaMetadata = {
  country: ContractTerritoryCountryCode;
  postalCode: string;
  locality: string;
};

const POSTAL_METADATA_BY_COUNTRY: Partial<Record<ContractTerritoryCountryCode, Record<string, string>>> = {
  DK: denmarkPostalCodeMetadata as Record<string, string>,
};

export function resolveContractPostalAreaMetadata(
  country: ContractTerritoryCountryCode,
  postalCode: string,
): ContractPostalAreaMetadata | null {
  const normalizedPostalCode = String(postalCode ?? '').trim();
  const locality = POSTAL_METADATA_BY_COUNTRY[country]?.[normalizedPostalCode];
  if (!locality) return null;

  return {
    country,
    postalCode: normalizedPostalCode,
    locality,
  };
}
