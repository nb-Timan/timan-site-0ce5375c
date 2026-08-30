import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  CONTRACT_TERRITORY_MAP_COUNTRIES,
  getContractTerritoryMapCountryConfig,
  getContractTerritoryMapLabel,
  getContractTerritoryMapRegionKeys,
  hasContractTerritoryMapSelection,
} from '@/lib/contractTerritoryMap';
import { DENMARK_MUNICIPALITIES_EXPECTED_COUNT, DENMARK_MUNICIPALITIES_GEOJSON_URL, parseDenmarkMunicipalitiesGeoJson } from '@/lib/denmarkMunicipalities';
import type { ContractTerritoryArea } from '@/lib/contractTerritory';

describe('contract territory map config', () => {
  it('uses municipalities for Denmark and PLZ2 for Germany', () => {
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.datasetId).toBe('dk_municipalities');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.geoJsonUrl).toBe(DENMARK_MUNICIPALITIES_GEOJSON_URL);
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.datasetId).toBe('de_plz2');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.geoJsonUrl).toBe('/data/germany-plz2.geojson');
  });

  it('resolves German PLZ entries to existing PLZ2 regions', () => {
    const area: ContractTerritoryArea = {
      country: 'DE',
      wholeCountry: false,
      municipalities: [],
      postalEntries: [
        { input: '39104', postalCode: '39104' },
        { input: '20000-29999', postalRange: { from: '20000', to: '29999' } },
      ],
      postalCodes: ['39104'],
      postalRanges: [{ from: '20000', to: '29999' }],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual([
      '20',
      '21',
      '22',
      '23',
      '24',
      '25',
      '26',
      '27',
      '28',
      '29',
      '39',
    ]);
  });

  it('resolves Danish map regions from municipalities and keeps postal fields separate', () => {
    const area: ContractTerritoryArea = {
      country: 'DK',
      wholeCountry: false,
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
      municipalities: [],
      postalEntries: [{ input: '6950', postalCode: '6950' }],
      postalCodes: ['6950'],
      postalRanges: [],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toEqual([]);
    expect(hasContractTerritoryMapSelection(area)).toBe(false);
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

  it('keeps the local Denmark postal map data lightweight enough for lazy loading', () => {
    const config = getContractTerritoryMapCountryConfig('DK');
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
    }

    expect(hasContractTerritoryMapSelection({
      country: 'DE',
      wholeCountry: true,
      municipalities: [],
      postalEntries: [],
      postalCodes: [],
      postalRanges: [],
    })).toBe(true);
  });
});
