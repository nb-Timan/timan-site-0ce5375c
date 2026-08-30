import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  CONTRACT_TERRITORY_MAP_COUNTRIES,
  getContractTerritoryMapCountryConfig,
  getContractTerritoryMapLabel,
  getContractTerritoryMapRegionKeys,
  hasContractTerritoryMapSelection,
} from '@/lib/contractTerritoryMap';
import type { ContractTerritoryArea } from '@/lib/contractTerritory';

describe('contract territory map config', () => {
  it('uses postal-code datasets for Denmark and Germany', () => {
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.datasetId).toBe('dk_postal_codes');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DK.geoJsonUrl).toBe('/data/denmark-postal-codes.geojson');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.datasetId).toBe('de_plz2');
    expect(CONTRACT_TERRITORY_MAP_COUNTRIES.DE.geoJsonUrl).toBe('/data/germany-plz2.geojson');
  });

  it('resolves German PLZ entries to existing PLZ2 regions', () => {
    const area: ContractTerritoryArea = {
      country: 'DE',
      wholeCountry: false,
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

  it('resolves Danish postal entries to individual postal-code areas', () => {
    const area: ContractTerritoryArea = {
      country: 'DK',
      wholeCountry: false,
      postalEntries: [
        { input: '5000', postalCode: '5000' },
        { input: '5200-5210', postalRange: { from: '5200', to: '5210' } },
      ],
      postalCodes: ['5000'],
      postalRanges: [{ from: '5200', to: '5210' }],
    };

    expect(getContractTerritoryMapRegionKeys(area)).toContain('5000');
    expect(getContractTerritoryMapRegionKeys(area)).toContain('5200');
    expect(getContractTerritoryMapRegionKeys(area)).toContain('5210');
  });

  it('parses local Denmark postal-code GeoJSON with stable postal IDs', () => {
    const config = getContractTerritoryMapCountryConfig('DK');
    const data = JSON.parse(readFileSync(`public${config.geoJsonUrl}`, 'utf8')) as GeoJSON.FeatureCollection;
    const odense = data.features.find((feature) => config.getFeatureMeta(feature)?.key === '5000');

    expect(data.features.length).toBeGreaterThan(1000);
    expect(new Set(data.features.map((feature) => config.getFeatureMeta(feature)?.key).filter(Boolean)).size).toBe(data.features.length);
    expect(config.getFeatureMeta(odense!)?.label).toContain('Odense');
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
      postalEntries: [],
      postalCodes: [],
      postalRanges: [],
    })).toBe(true);
  });
});
