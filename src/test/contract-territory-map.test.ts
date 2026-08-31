import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  CONTRACT_TERRITORY_BASEMAP,
  CONTRACT_TERRITORY_MAP_COUNTRIES,
  getContractTerritoryMapCountryConfig,
  getContractTerritoryMapLabel,
  getContractTerritoryMapRegionKeys,
  hasContractTerritoryMapSelection,
  toggleContractTerritoryRegionSelection,
} from '@/lib/contractTerritoryMap';
import { DENMARK_MUNICIPALITIES_EXPECTED_COUNT, DENMARK_MUNICIPALITIES_GEOJSON_URL, parseDenmarkMunicipalitiesGeoJson } from '@/lib/denmarkMunicipalities';
import { SWEDEN_MUNICIPALITIES_EXPECTED_COUNT, SWEDEN_MUNICIPALITIES_GEOJSON_URL, parseSwedenMunicipalitiesGeoJson } from '@/lib/swedenMunicipalities';
import type { ContractTerritoryArea } from '@/lib/contractTerritory';

describe('contract territory map config', () => {
  it('uses municipalities for Denmark and Sweden and PLZ2 for Germany', () => {
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.datasetId).toBe('dk_municipalities');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.geoJsonUrl).toBe(DENMARK_MUNICIPALITIES_GEOJSON_URL);
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.datasetId).toBe('de_plz2');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.geoJsonUrl).toBe('/data/germany-plz2.geojson');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.SE.datasetId).toBe('se_municipalities');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.SE.geoJsonUrl).toBe(SWEDEN_MUNICIPALITIES_GEOJSON_URL);
  });

  it('uses the shared CARTO/OpenStreetMap light basemap without a frontend API key', () => {
    expect(CONTRACT_TERRITORY_BASEMAP.url).toBe('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png');
    expect(CONTRACT_TERRITORY_BASEMAP.url.toLowerCase()).not.toContain('api');
    expect(CONTRACT_TERRITORY_BASEMAP.url.toLowerCase()).not.toContain('key');
    expect(CONTRACT_TERRITORY_BASEMAP.attribution).toContain('OpenStreetMap');
    expect(CONTRACT_TERRITORY_BASEMAP.attribution).toContain('CARTO');
  });

  it('uses selected German PLZ2 regions and keeps postal fields separate', () => {
    const area: ContractTerritoryArea = {
      country: 'DE',
      wholeCountry: false,
      selectedRegions: [
        { id: '20', name: 'PLZ2 20' },
        { id: '34', name: 'PLZ2 34' },
      ],
      municipalities: [],
      postalEntries: [
        { input: '10115', postalCode: '10115' },
        { input: '34117', postalCode: '34117' },
      ],
      postalCodes: ['10115', '34117'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual(['20', '34']);
    expect(hasContractTerritoryMapSelection(area)).toBe(true);
  });

  it('does not use German postal entries as map region keys', () => {
    const area: ContractTerritoryArea = {
      country: 'DE',
      wholeCountry: false,
      selectedRegions: [],
      municipalities: [],
      postalEntries: [{ input: '10115', postalCode: '10115' }],
      postalCodes: ['10115'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual([]);
    expect(hasContractTerritoryMapSelection(area)).toBe(false);
  });

  it('resolves Danish map regions from municipalities and keeps postal fields separate', () => {
    const area: ContractTerritoryArea = {
      country: 'DK',
      wholeCountry: false,
      selectedRegions: [
        { id: '0657', name: 'Herning' },
        { id: '0760', name: 'Ringkøbing-Skjern' },
      ],
      municipalities: [
        { id: '0657', name: 'Herning' },
        { id: '0760', name: 'Ringkøbing-Skjern' },
      ],
      postalEntries: [
        { input: '6950', postalCode: '6950' },
        { input: '6900', postalCode: '6900' },
      ],
      postalCodes: ['6950', '6900'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual(['0657', '0760']);
  });

  it('does not use Danish postal entries as map region keys', () => {
    const area: ContractTerritoryArea = {
      country: 'DK',
      wholeCountry: false,
      selectedRegions: [],
      municipalities: [],
      postalEntries: [{ input: '6950', postalCode: '6950' }],
      postalCodes: ['6950'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual([]);
    expect(hasContractTerritoryMapSelection(area)).toBe(false);
  });

  it('resolves Swedish map regions from municipalities and keeps postal fields separate', () => {
    const area: ContractTerritoryArea = {
      country: 'SE',
      wholeCountry: false,
      selectedRegions: [
        { id: '1280', name: 'Malmö' },
        { id: '1281', name: 'Lund' },
      ],
      municipalities: [
        { id: '1280', name: 'Malmö' },
        { id: '1281', name: 'Lund' },
      ],
      postalEntries: [
        { input: '211 20', postalCode: '211 20' },
        { input: '223 50', postalCode: '223 50' },
      ],
      postalCodes: ['211 20', '223 50'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual(['1280', '1281']);
    expect(hasContractTerritoryMapSelection(area)).toBe(true);
  });

  it('does not use Swedish postal entries as map region keys', () => {
    const area: ContractTerritoryArea = {
      country: 'SE',
      wholeCountry: false,
      selectedRegions: [],
      municipalities: [],
      postalEntries: [{ input: '211 20', postalCode: '211 20' }],
      postalCodes: ['211 20'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual([]);
    expect(hasContractTerritoryMapSelection(area)).toBe(false);
  });

  it('toggles Swedish municipality selection with the shared multi-select helper', () => {
    const area = {
      country: 'SE',
      wholeCountry: false,
      selectedRegions: [],
      municipalities: [],
      postalEntries: [],
      postalCodes: [],
      postalRanges: [],
    } satisfies ContractTerritoryArea;

    const withMalmo = toggleContractTerritoryRegionSelection(area, { id: '1280', name: 'Malmö' });
    const withTwo = toggleContractTerritoryRegionSelection(withMalmo, { id: '1281', name: 'Lund' });
    const withoutMalmo = toggleContractTerritoryRegionSelection(withTwo, { id: '1280', name: 'Malmö' });

    expect(withTwo.selectedRegions.map((region) => region.id)).toEqual(['1281', '1280']);
    expect(withTwo.municipalities.map((region) => region.id)).toEqual(['1281', '1280']);
    expect(withoutMalmo.selectedRegions.map((region) => region.id)).toEqual(['1281']);
  });

  it('parses local Denmark municipality GeoJSON with stable municipality IDs', () => {
    const config = getContractTerritoryMapCountryConfig('DK');
    const data = JSON.parse(readFileSync(`public${config.geoJsonUrl}`, 'utf8')) as GeoJSON.FeatureCollection;
    const municipalities = parseDenmarkMunicipalitiesGeoJson(data);
    const odense = municipalities.features.find((feature) => config.getFeatureMeta(feature)?.key === '0461');

    expect(municipalities.features).toHaveLength(DENMARK_MUNICIPALITIES_EXPECTED_COUNT);
    expect(new Set(municipalities.features.map((feature) => config.getFeatureMeta(feature)?.key).filter(Boolean)).size).toBe(DENMARK_MUNICIPALITIES_EXPECTED_COUNT);
    expect(config.getFeatureMeta(odense!)?.label).toBe('Odense Kommune');
    expect(odense?.geometry.type).toMatch(/Polygon/);
  });

  it('parses local Sweden municipality GeoJSON with stable municipality IDs', () => {
    const config = getContractTerritoryMapCountryConfig('SE');
    const data = JSON.parse(readFileSync(`public${config.geoJsonUrl}`, 'utf8')) as GeoJSON.FeatureCollection;
    const municipalities = parseSwedenMunicipalitiesGeoJson(data);
    const malmo = municipalities.features.find((feature) => config.getFeatureMeta(feature)?.key === '1280');

    expect(municipalities.features).toHaveLength(SWEDEN_MUNICIPALITIES_EXPECTED_COUNT);
    expect(new Set(municipalities.features.map((feature) => config.getFeatureMeta(feature)?.key).filter(Boolean)).size).toBe(SWEDEN_MUNICIPALITIES_EXPECTED_COUNT);
    expect(config.getFeatureMeta(malmo!)?.label).toBe('Malmö');
    expect(malmo?.geometry.type).toMatch(/Polygon/);
  });

  it('keeps the local Denmark postal map data lightweight enough for lazy loading', () => {
    const config = getContractTerritoryMapCountryConfig('DK');
    const stats = statSync(`public${config.geoJsonUrl}`);

    expect(stats.size).toBeLessThan(2_000_000);
  });

  it('keeps the local Sweden municipality map data lightweight enough for lazy loading', () => {
    const config = getContractTerritoryMapCountryConfig('SE');
    const stats = statSync(`public${config.geoJsonUrl}`);

    expect(stats.size).toBeLessThan(2_000_000);
  });

  it('has map labels for all portal languages and treats whole-country as selectable', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

    for (const language of languages) {
      expect(getContractTerritoryMapLabel('title', language)).toBeTruthy();
      expect(getContractTerritoryMapLabel('primary', language)).toBeTruthy();
      expect(getContractTerritoryMapLabel('secondary', language)).toBeTruthy();
      expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.datasetLabel[language]).toBeTruthy();
      expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.datasetLabel[language]).toBeTruthy();
      expect(CONTRACT_TERRITORY_MAP_COUNTRIES.SE.datasetLabel[language]).toBeTruthy();
    }

    expect(hasContractTerritoryMapSelection({
      country: 'DE',
      wholeCountry: true,
      selectedRegions: [],
      municipalities: [],
      postalEntries: [],
      postalCodes: [],
      postalRanges: [],
    })).toBe(true);
  });
});
