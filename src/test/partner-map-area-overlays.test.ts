import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  DENMARK_MUNICIPALITIES_EXPECTED_COUNT,
  DENMARK_MUNICIPALITIES_GEOJSON_URL,
  DENMARK_MUNICIPALITIES_LABELS,
  getDenmarkMunicipalityDisplayName,
  parseDenmarkMunicipalitiesGeoJson,
} from '@/lib/denmarkMunicipalities';

describe('partner map area overlays', () => {
  it('defines the Denmark municipalities area option beside existing overlays', () => {
    const source = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');

    expect(source).toContain("type AdministrativeOverlayId = 'none' | 'de_plz2' | 'dk_municipalities'");
    expect(source).toContain('<option value="none">');
    expect(source).toContain('<option value="de_plz2">');
    expect(source).toContain('<option value="dk_municipalities">');
    expect(source).toContain('DenmarkMunicipalitiesOverlay');
    expect(source).toContain("enabled={administrativeOverlay === 'dk_municipalities'}");
  });

  it('provides municipality labels for every portal language', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

    expect(DENMARK_MUNICIPALITIES_LABELS.areaDenmarkMunicipalities.da).toBe('Danmark - Kommuner');
    expect(DENMARK_MUNICIPALITIES_LABELS.areaDenmarkMunicipalities.en).toBe('Denmark - Municipalities');
    for (const language of languages) {
      expect(DENMARK_MUNICIPALITIES_LABELS.areaDenmarkMunicipalities[language]).toBeTruthy();
      expect(DENMARK_MUNICIPALITIES_LABELS.municipality[language]).toBeTruthy();
      expect(DENMARK_MUNICIPALITIES_LABELS.selectMunicipality[language]).toBeTruthy();
    }
  });

  it('parses local Danish municipality GeoJSON with stable IDs, names and geometry', () => {
    const path = `public${DENMARK_MUNICIPALITIES_GEOJSON_URL}`;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const municipalities = parseDenmarkMunicipalitiesGeoJson(data);
    const ids = municipalities.features.map((feature) => feature.properties.kode);
    const names = municipalities.features.map((feature) => feature.properties.navn);
    const odense = municipalities.features.find((feature) => feature.properties.kode === '0461');

    expect(municipalities.features).toHaveLength(DENMARK_MUNICIPALITIES_EXPECTED_COUNT);
    expect(new Set(ids).size).toBe(DENMARK_MUNICIPALITIES_EXPECTED_COUNT);
    expect(names).toContain('Odense');
    expect(odense?.geometry.type).toBe('MultiPolygon');
    expect(getDenmarkMunicipalityDisplayName(odense)).toBe('Odense Kommune');
  });

  it('keeps the local web-map municipality data lightweight', () => {
    const stats = statSync(`public${DENMARK_MUNICIPALITIES_GEOJSON_URL}`);

    expect(stats.size).toBeLessThan(1_000_000);
  });

  it('keeps Denmark overlay lazy-loaded and click-focusable', () => {
    const source = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');
    const start = source.indexOf('function DenmarkMunicipalitiesOverlay');
    const end = source.indexOf('// Cluster + marker layer driven by props');
    const overlaySource = source.slice(start, end);

    expect(overlaySource).toContain('fetch(DENMARK_MUNICIPALITIES_GEOJSON_URL)');
    expect(overlaySource).toContain('parseDenmarkMunicipalitiesGeoJson(data)');
    expect(overlaySource).toContain('bindTooltip(municipality');
    expect(overlaySource).toContain('selectedCodeRef.current = code');
    expect(overlaySource).toContain('map.fitBounds(bounds');
    expect(overlaySource).toContain("zIndex = '360'");
  });
});
