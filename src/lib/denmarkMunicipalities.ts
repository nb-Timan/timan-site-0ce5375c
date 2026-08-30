import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const DENMARK_MUNICIPALITIES_GEOJSON_URL = '/data/denmark-municipalities.geojson';
export const DENMARK_MUNICIPALITIES_EXPECTED_COUNT = 98;

export type DenmarkMunicipalityProperties = {
  kode: string;
  navn: string;
};

export type DenmarkMunicipalityFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  DenmarkMunicipalityProperties
>;

export const DENMARK_MUNICIPALITIES_LABELS: Record<
  'areaDenmarkMunicipalities' | 'municipality' | 'selectMunicipality',
  Record<PortalUiLanguage, string>
> = {
  areaDenmarkMunicipalities: {
    da: 'Danmark - Kommuner',
    en: 'Denmark - Municipalities',
    de: 'Dänemark - Kommunen',
    it: 'Danimarca - comuni',
    hu: 'Dánia - önkormányzatok',
    sv: 'Danmark - kommuner',
    fr: 'Danemark - communes',
    pl: 'Dania - gminy',
    cs: 'Dánsko - obce',
  },
  municipality: {
    da: 'Kommune',
    en: 'Municipality',
    de: 'Kommune',
    it: 'Comune',
    hu: 'Önkormányzat',
    sv: 'Kommun',
    fr: 'Commune',
    pl: 'Gmina',
    cs: 'Obec',
  },
  selectMunicipality: {
    da: 'Vælg kommune',
    en: 'Select municipality',
    de: 'Kommune auswählen',
    it: 'Seleziona comune',
    hu: 'Válassz önkormányzatot',
    sv: 'Välj kommun',
    fr: 'Choisir une commune',
    pl: 'Wybierz gminę',
    cs: 'Vybrat obec',
  },
};

function isPolygonGeometry(geometry: GeoJSON.Geometry | null | undefined): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon {
  return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

export function getDenmarkMunicipalityLabel(key: keyof typeof DENMARK_MUNICIPALITIES_LABELS, language: string | null | undefined) {
  return DENMARK_MUNICIPALITIES_LABELS[key][language as PortalUiLanguage] ?? DENMARK_MUNICIPALITIES_LABELS[key].da;
}

export function getDenmarkMunicipalityDisplayName(feature: Pick<DenmarkMunicipalityFeature, 'properties'> | null | undefined) {
  const name = String(feature?.properties?.navn ?? '').trim();
  if (!name) return '';
  return /\bkommune$/i.test(name) ? name : `${name} Kommune`;
}

export function normalizeDenmarkMunicipalityFeature(feature: GeoJSON.Feature): DenmarkMunicipalityFeature | null {
  const kode = String(feature.properties?.kode ?? '').trim();
  const navn = String(feature.properties?.navn ?? '').trim();
  if (!/^\d{4}$/.test(kode) || !navn || !isPolygonGeometry(feature.geometry)) return null;

  return {
    type: 'Feature',
    properties: { kode, navn },
    geometry: feature.geometry,
  };
}

export function parseDenmarkMunicipalitiesGeoJson(data: unknown): GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  DenmarkMunicipalityProperties
> {
  const collection = data as GeoJSON.FeatureCollection | null | undefined;
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Invalid Denmark municipalities GeoJSON.');
  }

  const features = collection.features
    .map((feature) => normalizeDenmarkMunicipalityFeature(feature))
    .filter((feature): feature is DenmarkMunicipalityFeature => Boolean(feature));

  if (features.length !== DENMARK_MUNICIPALITIES_EXPECTED_COUNT) {
    throw new Error(`Expected ${DENMARK_MUNICIPALITIES_EXPECTED_COUNT} Danish municipalities, found ${features.length}.`);
  }

  const ids = new Set(features.map((feature) => feature.properties.kode));
  if (ids.size !== features.length) {
    throw new Error('Danish municipality IDs must be unique.');
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
