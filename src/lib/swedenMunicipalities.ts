import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const SWEDEN_MUNICIPALITIES_GEOJSON_URL = '/data/sweden-municipalities.geojson';
export const SWEDEN_MUNICIPALITIES_EXPECTED_COUNT = 290;

export type SwedenMunicipalityProperties = {
  kode: string;
  navn: string;
};

export type SwedenMunicipalityFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  SwedenMunicipalityProperties
>;

export const SWEDEN_MUNICIPALITIES_LABELS: Record<
  'areaSwedenMunicipalities' | 'municipality' | 'selectMunicipality',
  Record<PortalUiLanguage, string>
> = {
  areaSwedenMunicipalities: {
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

export function getSwedenMunicipalityLabel(key: keyof typeof SWEDEN_MUNICIPALITIES_LABELS, language: string | null | undefined) {
  return SWEDEN_MUNICIPALITIES_LABELS[key][language as PortalUiLanguage] ?? SWEDEN_MUNICIPALITIES_LABELS[key].da;
}

export function getSwedenMunicipalityDisplayName(feature: Pick<SwedenMunicipalityFeature, 'properties'> | null | undefined) {
  return String(feature?.properties?.navn ?? '').trim();
}

export function normalizeSwedenMunicipalityFeature(feature: GeoJSON.Feature): SwedenMunicipalityFeature | null {
  const kode = String(feature.properties?.kode ?? '').trim();
  const navn = String(feature.properties?.navn ?? '').trim();
  if (!/^\d{4}$/.test(kode) || !navn || !isPolygonGeometry(feature.geometry)) return null;

  return {
    type: 'Feature',
    properties: { kode, navn },
    geometry: feature.geometry,
  };
}

export function parseSwedenMunicipalitiesGeoJson(data: unknown): GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  SwedenMunicipalityProperties
> {
  const collection = data as GeoJSON.FeatureCollection | null | undefined;
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Invalid Sweden municipalities GeoJSON.');
  }

  const features = collection.features
    .map((feature) => normalizeSwedenMunicipalityFeature(feature))
    .filter((feature): feature is SwedenMunicipalityFeature => Boolean(feature));

  if (features.length !== SWEDEN_MUNICIPALITIES_EXPECTED_COUNT) {
    throw new Error(`Expected ${SWEDEN_MUNICIPALITIES_EXPECTED_COUNT} Swedish municipalities, found ${features.length}.`);
  }

  const ids = new Set(features.map((feature) => feature.properties.kode));
  if (ids.size !== features.length) {
    throw new Error('Swedish municipality IDs must be unique.');
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
