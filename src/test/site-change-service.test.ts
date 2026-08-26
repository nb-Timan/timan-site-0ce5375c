import { describe, expect, it } from 'vitest';
import { inferModuleFromFiles, publicRowToEntry, recommendPublication } from '@/lib/portalChangelogService';

describe('site change service', () => {
  it('recommends publication from user and technical impact separately', () => {
    expect(recommendPublication(9, 7)).toBe('publish');
    expect(recommendPublication(1, 4)).toBe('internal');
    expect(recommendPublication(4, 7)).toBe('maybe');
  });

  it('infers the likely module from changed files', () => {
    expect(inferModuleFromFiles(['src/pages/crm/CrmLeadsPage.tsx'])).toBe('crm');
    expect(inferModuleFromFiles(['src/pages/misc/PartnerMapPage.tsx'])).toBe('map');
    expect(inferModuleFromFiles(['src/pages/tsb/TsbDashboardPage.tsx'])).toBe('tsb');
  });

  it('maps public rows to front-page changelog entries without internal fields', () => {
    const entry = publicRowToEntry({
      id: 'change-1',
      published_at: '2026-08-26T12:00:00.000Z',
      implemented_at: '2026-08-25T12:00:00.000Z',
      title: 'Nye muligheder for forhandlere',
      description: 'Forhandlere kan arbejde med egne leads.',
      module: 'dealer_portal',
      change_type: 'feature',
      affected_roles: ['timan_dealer', 'dealer_user'],
      is_important: true,
      source_ref: 'abc123',
      updated_at: '2026-08-26T12:00:00.000Z',
    });

    expect(entry.title.da).toBe('Nye muligheder for forhandlere');
    expect(entry.description?.da).toBe('Forhandlere kan arbejde med egne leads.');
    expect(entry.module_key).toBe('dealer_data');
    expect(entry.role_visibility).toEqual(['dealer']);
    expect(entry.is_major).toBe(true);
    expect('technical_description' in entry).toBe(false);
  });
});
