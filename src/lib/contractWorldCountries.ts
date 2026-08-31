import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { ContractTerritoryCountryCode } from '@/lib/contractTerritory';

export const WORLD_COUNTRIES_GEOJSON_URL = '/data/world-countries-110m.geojson';

export type ContractCountryMapScope = 'europe' | 'world';

export type ContractWorldCountryFeatureMeta = {
  code: ContractTerritoryCountryCode;
  name: string;
  continent: string;
};

export const CONTRACT_COUNTRY_MAP_BOUNDS: Record<ContractCountryMapScope, [number, number, number, number]> = {
  europe: [34, -25, 72, 45],
  world: [-55, -170, 75, 180],
};

const COUNTRY_LABELS: Record<string, Record<PortalUiLanguage, string>> = {
  AT: { da: 'Østrig', en: 'Austria', de: 'Österreich', it: 'Austria', hu: 'Ausztria', sv: 'Österrike', fr: 'Autriche', pl: 'Austria', cs: 'Rakousko' },
  BE: { da: 'Belgien', en: 'Belgium', de: 'Belgien', it: 'Belgio', hu: 'Belgium', sv: 'Belgien', fr: 'Belgique', pl: 'Belgia', cs: 'Belgie' },
  CA: { da: 'Canada', en: 'Canada', de: 'Kanada', it: 'Canada', hu: 'Kanada', sv: 'Kanada', fr: 'Canada', pl: 'Kanada', cs: 'Kanada' },
  CH: { da: 'Schweiz', en: 'Switzerland', de: 'Schweiz', it: 'Svizzera', hu: 'Svájc', sv: 'Schweiz', fr: 'Suisse', pl: 'Szwajcaria', cs: 'Švýcarsko' },
  CZ: { da: 'Tjekkiet', en: 'Czechia', de: 'Tschechien', it: 'Cechia', hu: 'Csehország', sv: 'Tjeckien', fr: 'Tchéquie', pl: 'Czechy', cs: 'Česko' },
  DE: { da: 'Tyskland', en: 'Germany', de: 'Deutschland', it: 'Germania', hu: 'Németország', sv: 'Tyskland', fr: 'Allemagne', pl: 'Niemcy', cs: 'Německo' },
  DK: { da: 'Danmark', en: 'Denmark', de: 'Dänemark', it: 'Danimarca', hu: 'Dánia', sv: 'Danmark', fr: 'Danemark', pl: 'Dania', cs: 'Dánsko' },
  ES: { da: 'Spanien', en: 'Spain', de: 'Spanien', it: 'Spagna', hu: 'Spanyolország', sv: 'Spanien', fr: 'Espagne', pl: 'Hiszpania', cs: 'Španělsko' },
  FI: { da: 'Finland', en: 'Finland', de: 'Finnland', it: 'Finlandia', hu: 'Finnország', sv: 'Finland', fr: 'Finlande', pl: 'Finlandia', cs: 'Finsko' },
  FR: { da: 'Frankrig', en: 'France', de: 'Frankreich', it: 'Francia', hu: 'Franciaország', sv: 'Frankrike', fr: 'France', pl: 'Francja', cs: 'Francie' },
  GB: { da: 'Storbritannien', en: 'United Kingdom', de: 'Vereinigtes Königreich', it: 'Regno Unito', hu: 'Egyesült Királyság', sv: 'Storbritannien', fr: 'Royaume-Uni', pl: 'Wielka Brytania', cs: 'Spojené království' },
  HU: { da: 'Ungarn', en: 'Hungary', de: 'Ungarn', it: 'Ungheria', hu: 'Magyarország', sv: 'Ungern', fr: 'Hongrie', pl: 'Węgry', cs: 'Maďarsko' },
  IE: { da: 'Irland', en: 'Ireland', de: 'Irland', it: 'Irlanda', hu: 'Írország', sv: 'Irland', fr: 'Irlande', pl: 'Irlandia', cs: 'Irsko' },
  IT: { da: 'Italien', en: 'Italy', de: 'Italien', it: 'Italia', hu: 'Olaszország', sv: 'Italien', fr: 'Italie', pl: 'Włochy', cs: 'Itálie' },
  JP: { da: 'Japan', en: 'Japan', de: 'Japan', it: 'Giappone', hu: 'Japán', sv: 'Japan', fr: 'Japon', pl: 'Japonia', cs: 'Japonsko' },
  NL: { da: 'Holland', en: 'Netherlands', de: 'Niederlande', it: 'Paesi Bassi', hu: 'Hollandia', sv: 'Nederländerna', fr: 'Pays-Bas', pl: 'Holandia', cs: 'Nizozemsko' },
  NO: { da: 'Norge', en: 'Norway', de: 'Norwegen', it: 'Norvegia', hu: 'Norvégia', sv: 'Norge', fr: 'Norvège', pl: 'Norwegia', cs: 'Norsko' },
  PL: { da: 'Polen', en: 'Poland', de: 'Polen', it: 'Polonia', hu: 'Lengyelország', sv: 'Polen', fr: 'Pologne', pl: 'Polska', cs: 'Polsko' },
  PT: { da: 'Portugal', en: 'Portugal', de: 'Portugal', it: 'Portogallo', hu: 'Portugália', sv: 'Portugal', fr: 'Portugal', pl: 'Portugalia', cs: 'Portugalsko' },
  SE: { da: 'Sverige', en: 'Sweden', de: 'Schweden', it: 'Svezia', hu: 'Svédország', sv: 'Sverige', fr: 'Suède', pl: 'Szwecja', cs: 'Švédsko' },
  US: { da: 'USA', en: 'United States', de: 'USA', it: 'Stati Uniti', hu: 'Egyesült Államok', sv: 'USA', fr: 'États-Unis', pl: 'USA', cs: 'USA' },
};

export function getContractWholeCountryLabel(
  countryCode: ContractTerritoryCountryCode,
  language: PortalUiLanguage | string | null | undefined = 'da',
  fallbackName?: string,
) {
  const labels = COUNTRY_LABELS[String(countryCode).toUpperCase()];
  return labels?.[language as PortalUiLanguage] ?? labels?.da ?? fallbackName ?? String(countryCode).toUpperCase();
}

export function parseWorldCountriesGeoJson(data: unknown): GeoJSON.FeatureCollection {
  if (!data || typeof data !== 'object' || (data as GeoJSON.FeatureCollection).type !== 'FeatureCollection') {
    throw new Error('World country data must be a GeoJSON FeatureCollection');
  }
  return data as GeoJSON.FeatureCollection;
}

function firstIso2(properties: GeoJSON.GeoJsonProperties) {
  const candidates = [
    properties?.ISO_A2,
    properties?.ISO_A2_EH,
    properties?.WB_A2,
  ];
  return candidates
    .map((value) => String(value ?? '').trim().toUpperCase())
    .find((value) => /^[A-Z]{2}$/.test(value)) ?? '';
}

export function getWorldCountryFeatureMeta(feature: GeoJSON.Feature): ContractWorldCountryFeatureMeta | null {
  const properties = feature.properties ?? {};
  const code = firstIso2(properties);
  if (!code) return null;
  const name = String(properties.NAME_LONG ?? properties.NAME ?? properties.ADMIN ?? code).trim();
  const continent = String(properties.CONTINENT ?? '').trim();
  return { code, name, continent };
}

export function isFeatureInContractCountryMapScope(feature: GeoJSON.Feature, scope: ContractCountryMapScope) {
  if (scope === 'world') return true;
  const meta = getWorldCountryFeatureMeta(feature);
  return meta?.continent === 'Europe';
}
