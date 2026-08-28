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
      localized_content: null,
      module: 'dealer_portal',
      change_type: 'feature',
      affected_roles: ['timan_dealer', 'dealer_user'],
      is_important: true,
      source_ref: 'abc123',
      updated_at: '2026-08-26T12:00:00.000Z',
    });

    expect(entry.title.da).toBe('Nye muligheder for forhandlere');
    expect(entry.title.de).toBe('Nye muligheder for forhandlere');
    expect(entry.description?.da).toBe('Forhandlere kan arbejde med egne leads.');
    expect(entry.module_key).toBe('dealer_data');
    expect(entry.role_visibility).toEqual(['timan_dealer', 'dealer', 'dealer_user']);
    expect(entry.is_major).toBe(true);
    expect('technical_description' in entry).toBe(false);
  });

  it('uses localized public changelog content with English then Danish fallback', () => {
    const entry = publicRowToEntry({
      id: 'change-localized',
      published_at: '2026-08-26T12:00:00.000Z',
      implemented_at: '2026-08-25T12:00:00.000Z',
      title: 'Dansk fallback titel',
      description: 'Dansk fallback tekst.',
      localized_content: {
        da: {
          title: 'Dansk titel',
          description: 'Dansk tekst.',
          note: 'Dansk note',
        },
        en: {
          title: 'English title',
          description: 'English text.',
          note: 'English note',
        },
        de: {
          title: 'Deutscher Titel',
          description: 'Deutscher Text.',
          note: 'Deutsche Notiz',
        },
        fr: {
          title: 'Titre français',
          description: 'Texte français.',
          note: 'Note française',
        },
      },
      module: 'dealer_data',
      change_type: 'feature',
      affected_roles: ['all'],
      is_important: false,
      source_ref: null,
      updated_at: '2026-08-26T12:00:00.000Z',
    });

    expect(entry.title.da).toBe('Dansk titel');
    expect(entry.title.en).toBe('English title');
    expect(entry.title.de).toBe('Deutscher Titel');
    expect(entry.title.fr).toBe('Titre français');
    expect(entry.title.pl).toBe('English title');
    expect(entry.description?.pl).toBe('English text.');
    expect(entry.module_name.de).toBe('Händlerdaten');
    expect(entry.module_name.fr).toBe('Données revendeur');
  });

  it('keeps specific audience roles separate for published changes', () => {
    const importerEntry = publicRowToEntry({
      id: 'change-importer',
      published_at: '2026-08-26T12:00:00.000Z',
      implemented_at: '2026-08-25T12:00:00.000Z',
      title: 'Importørnyhed',
      description: null,
      localized_content: null,
      module: 'dealer_portal',
      change_type: 'feature',
      affected_roles: ['timan_importer', 'exhibition_user'],
      is_important: false,
      source_ref: null,
      updated_at: '2026-08-26T12:00:00.000Z',
    });

    expect(importerEntry.role_visibility).toContain('timan_importer');
    expect(importerEntry.role_visibility).toContain('exhibition_user');
    expect(importerEntry.role_visibility).toContain('timan_messe');
  });
});
