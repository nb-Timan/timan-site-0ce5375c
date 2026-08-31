import type { PortalUiLanguage } from '@/lib/portalLanguages';
import {
  normalizeContractTerritoryArea,
  type ContractTerritoryCountryCode,
  type ContractTerritoryArea,
  type ContractTerritoryRegion,
} from '@/lib/contractTerritory';
import {
  DENMARK_MUNICIPALITIES_GEOJSON_URL,
  getDenmarkMunicipalityDisplayName,
  parseDenmarkMunicipalitiesGeoJson,
  type DenmarkMunicipalityFeature,
} from '@/lib/denmarkMunicipalities';
import {
  SWEDEN_MUNICIPALITIES_GEOJSON_URL,
  getSwedenMunicipalityDisplayName,
  parseSwedenMunicipalitiesGeoJson,
  type SwedenMunicipalityFeature,
} from '@/lib/swedenMunicipalities';

export type ContractTerritoryMapVariant = 'primary' | 'secondary';

export type ContractTerritoryMapBounds = [number, number, number, number];

export type ContractTerritoryMapFeatureMeta = {
  key: string;
  label: string;
};

export type ContractTerritoryMapCountryConfig = {
  country: ContractTerritoryCountryCode;
  datasetId: 'dk_municipalities' | 'de_plz2' | 'se_municipalities';
  datasetLabel: Record<PortalUiLanguage, string>;
  geoJsonUrl: string;
  bounds: ContractTerritoryMapBounds;
  postalDigits: number;
  regionDigits: number;
  parseGeoJson: (data: unknown) => GeoJSON.FeatureCollection;
  getFeatureMeta: (feature: GeoJSON.Feature) => ContractTerritoryMapFeatureMeta | null;
};

export const CONTRACT_TERRITORY_MAP_LABELS: Record<string, Record<PortalUiLanguage, string>> = {
  title: {
    da: 'Områdekort',
    en: 'Territory map',
    de: 'Gebietskarte',
    it: 'Mappa dell area',
    hu: 'Teruleti terkep',
    sv: 'Omradeskarta',
    fr: 'Carte du territoire',
    pl: 'Mapa obszaru',
    cs: 'Mapa uzemi',
  },
  primary: {
    da: 'Primært område',
    en: 'Primary territory',
    de: 'Primaeres Gebiet',
    it: 'Area primaria',
    hu: 'Elsodleges terulet',
    sv: 'Primart omrade',
    fr: 'Territoire principal',
    pl: 'Obszar glowny',
    cs: 'Primarni uzemi',
  },
  secondary: {
    da: 'Sekundært område',
    en: 'Secondary territory',
    de: 'Sekundaeres Gebiet',
    it: 'Area secondaria',
    hu: 'Masodlagos terulet',
    sv: 'Sekundart omrade',
    fr: 'Territoire secondaire',
    pl: 'Obszar dodatkowy',
    cs: 'Sekundarni uzemi',
  },
  loading: {
    da: 'Indlaeser områdekort...',
    en: 'Loading territory map...',
    de: 'Gebietskarte wird geladen...',
    it: 'Caricamento mappa area...',
    hu: 'Teruleti terkep betoltese...',
    sv: 'Laser omradeskarta...',
    fr: 'Chargement de la carte...',
    pl: 'Ladowanie mapy obszaru...',
    cs: 'Nacita se mapa uzemi...',
  },
  unavailable: {
    da: 'Områdekortet kunne ikke indlæses. Områdevalget er stadig gemt.',
    en: 'The territory map could not be loaded. The territory selection is still saved.',
    de: 'Die Gebietskarte konnte nicht geladen werden. Die Gebietsauswahl ist weiterhin gespeichert.',
    it: 'Impossibile caricare la mappa. La selezione dell area resta salvata.',
    hu: 'A teruleti terkep nem toltheto be. A teruletvalasztas tovabbra is mentve van.',
    sv: 'Omradeskartan kunde inte laddas. Omradesvalet sparas fortfarande.',
    fr: 'La carte du territoire n a pas pu etre chargee. La selection reste enregistree.',
    pl: 'Nie mozna zaladowac mapy obszaru. Wybor obszaru nadal jest zapisany.',
    cs: 'Mapu uzemi se nepodarilo nacist. Vyber uzemi zustava ulozen.',
  },
  noSelection: {
    da: 'Angiv et gyldigt primært område for at markere kortet.',
    en: 'Enter a valid primary territory to highlight the map.',
    de: 'Geben Sie ein gueltiges primaeres Gebiet ein, um die Karte zu markieren.',
    it: 'Inserisci un area primaria valida per evidenziare la mappa.',
    hu: 'Adjon meg ervenyes elsodleges teruletet a terkep kiemelesehez.',
    sv: 'Ange ett giltigt primart omrade for att markera kartan.',
    fr: 'Indiquez un territoire principal valide pour mettre la carte en evidence.',
    pl: 'Podaj prawidlowy obszar glowny, aby zaznaczyc mape.',
    cs: 'Zadejte platne primarni uzemi pro zvyrazneni mapy.',
  },
};

export const CONTRACT_TERRITORY_MAP_COUNTRIES: Record<ContractTerritoryCountryCode, ContractTerritoryMapCountryConfig> = {
  DK: {
    country: 'DK',
    datasetId: 'dk_municipalities',
    datasetLabel: {
      da: 'Danmark - kommuner',
      en: 'Denmark - municipalities',
      de: 'Daenemark - Kommunen',
      it: 'Danimarca - comuni',
      hu: 'Dania - onkormanyzatok',
      sv: 'Danmark - kommuner',
      fr: 'Danemark - communes',
      pl: 'Dania - gminy',
      cs: 'Dansko - obce',
    },
    geoJsonUrl: DENMARK_MUNICIPALITIES_GEOJSON_URL,
    bounds: [54.5, 8.0, 57.8, 15.2],
    postalDigits: 4,
    regionDigits: 4,
    parseGeoJson: parseDenmarkMunicipalitiesGeoJson,
    getFeatureMeta: (feature) => {
      const code = String(feature?.properties?.kode ?? '').trim();
      if (!/^\d{4}$/.test(code)) return null;
      return { key: code, label: getDenmarkMunicipalityDisplayName(feature as DenmarkMunicipalityFeature) };
    },
  },
  DE: {
    country: 'DE',
    datasetId: 'de_plz2',
    datasetLabel: {
      da: 'Germany - Postleitzahl-Leitregionen (PLZ2)',
      en: 'Germany - postal-code regions (PLZ2)',
      de: 'Deutschland - Postleitzahl-Leitregionen (PLZ2)',
      it: 'Germania - regioni CAP (PLZ2)',
      hu: 'Nemetorszag - iranyitoszam-regiok (PLZ2)',
      sv: 'Tyskland - postnummerregioner (PLZ2)',
      fr: 'Allemagne - regions de codes postaux (PLZ2)',
      pl: 'Niemcy - regiony kodow pocztowych (PLZ2)',
      cs: 'Nemecko - oblasti PSC (PLZ2)',
    },
    geoJsonUrl: '/data/germany-plz2.geojson',
    bounds: [47.3, 5.9, 55.1, 15.0],
    postalDigits: 5,
    regionDigits: 2,
    parseGeoJson: (data) => data as GeoJSON.FeatureCollection,
    getFeatureMeta: (feature) => {
      const plz = String(feature?.properties?.plz ?? '').padStart(2, '0');
      if (!/^\d{2}$/.test(plz)) return null;
      return { key: plz, label: `PLZ2 ${plz}` };
    },
  },
  SE: {
    country: 'SE',
    datasetId: 'se_municipalities',
    datasetLabel: {
      da: 'Sverige - kommuner',
      en: 'Sweden - municipalities',
      de: 'Schweden - Kommunen',
      it: 'Svezia - comuni',
      hu: 'Svédország - önkormányzatok',
      sv: 'Sverige - kommuner',
      fr: 'Suède - communes',
      pl: 'Szwecja - gminy',
      cs: 'Švédsko - obce',
    },
    geoJsonUrl: SWEDEN_MUNICIPALITIES_GEOJSON_URL,
    bounds: [55.0, 10.8, 69.2, 24.2],
    postalDigits: 5,
    regionDigits: 4,
    parseGeoJson: parseSwedenMunicipalitiesGeoJson,
    getFeatureMeta: (feature) => {
      const code = String(feature?.properties?.kode ?? '').trim();
      if (!/^\d{4}$/.test(code)) return null;
      return { key: code, label: getSwedenMunicipalityDisplayName(feature as SwedenMunicipalityFeature) };
    },
  },
};

export function getContractTerritoryMapCountryConfig(country: ContractTerritoryCountryCode) {
  return CONTRACT_TERRITORY_MAP_COUNTRIES[country];
}

export function getContractTerritoryMapLabel(
  key: keyof typeof CONTRACT_TERRITORY_MAP_LABELS,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  const labels = CONTRACT_TERRITORY_MAP_LABELS[key];
  return labels[language as PortalUiLanguage] ?? labels.da;
}

export function getContractTerritoryMapRegionKeys(areaInput: unknown) {
  const area = normalizeContractTerritoryArea(areaInput);
  return area.selectedRegions.map((region) => region.id).sort();
}

export function hasContractTerritoryMapSelection(areaInput: unknown) {
  const area = normalizeContractTerritoryArea(areaInput);
  return area.wholeCountry || getContractTerritoryMapRegionKeys(area).length > 0;
}

export function getContractTerritoryMapStateKey(areaInput: unknown) {
  const area = normalizeContractTerritoryArea(areaInput);
  return [
    area.country,
    area.wholeCountry ? 'whole' : 'bounded',
    getContractTerritoryMapRegionKeys(area).join('|'),
  ].join(':');
}

export function toggleContractTerritoryRegionSelection(
  area: ContractTerritoryArea,
  region: ContractTerritoryRegion,
): ContractTerritoryArea {
  if (area.wholeCountry) return area;
  const exists = area.selectedRegions.some((item) => item.id === region.id);
  const selectedRegions = exists
    ? area.selectedRegions.filter((item) => item.id !== region.id)
    : [...area.selectedRegions, region].sort((a, b) => a.name.localeCompare(b.name, area.country === 'SE' ? 'sv' : 'da'));

  return {
    ...area,
    selectedRegions,
    municipalities: area.country === 'DK' || area.country === 'SE' ? selectedRegions : [],
  };
}
