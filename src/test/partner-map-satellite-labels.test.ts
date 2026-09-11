import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('partner map satellite city labels', () => {
  it('uses the provider reference layer rather than a local city list', () => {
    const source = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');
    expect(source).toContain('World_Boundaries_and_Places');
    expect(source).toContain("'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/");
  });

  it('renders labels only as a satellite base-layer companion before pins', () => {
    const source = readFileSync('src/pages/misc/PartnerMapPage.tsx', 'utf8');
    const labelsIndex = source.indexOf('selectedMapStyle.labelsUrl');
    const partnerPinsIndex = source.indexOf('<ClusterLayer');

    expect(source).toContain("labelsUrl: SATELLITE_REFERENCE_LABELS_URL");
    expect(labelsIndex).toBeGreaterThan(source.indexOf('selectedMapStyle.url'));
    expect(labelsIndex).toBeLessThan(partnerPinsIndex);
  });
});
