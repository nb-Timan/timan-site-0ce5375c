import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/App.tsx', 'utf8');
const messeHome = readFileSync('src/pages/messe/MesseHomePage.tsx', 'utf8');

const messeTargets = [
  '/messe/konfigurator',
  '/messe/partner-map',
  '/messe/rc-751',
  '/messe/rc-1000s',
  '/messe/timan-2620',
  '/messe/timan-3330',
  '/messe/video',
  '/messe/nyt',
  '/messe/resources/driftberegner',
  '/messe/resources/co2',
  '/messe/follow-up',
];

describe('Messe context access parity', () => {
  it('keeps every Messe home target behind the single Messe route guard', () => {
    for (const target of messeTargets) {
      expect(messeHome).toContain(`to: '${target}'`);
      expect(app).toContain(`<Route path="${target}" element={<MesseRouteGuard>`);
    }
  });

  it('does not grant Messe context access to non-Messe portal routes', () => {
    expect(app).toContain('<Route path="/portal/crm/leads"');
    expect(app).toContain('<Route path="/portal/backend"');
    expect(app).not.toContain('<MesseRouteGuard><CrmLeadsPage');
    expect(app).not.toContain('<MesseRouteGuard><BackendSectionPage');
  });
});
