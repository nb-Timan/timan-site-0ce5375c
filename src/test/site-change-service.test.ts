import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferModuleFromFiles, publicRowToEntry, recommendPublication } from '@/lib/portalChangelogService';
import { getPublishedFeatureContent } from '@/lib/portalChangelogService';

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
    expect(entry.module_name.de).toBe('Partnerdaten');
    expect(entry.module_name.fr).toBe('Données partenaire');
  });

  it('resolves the same published feature content for admin and front page previews', () => {
    const row = {
      id: 'change-preview',
      source: 'github',
      source_ref: 'github:a8289899',
      implemented_at: '2026-08-31T12:00:00.000Z',
      title_internal: 'Fix contract territory map tiles',
      description_internal: 'Automatisk importeret fra GitHub.',
      technical_description: 'Repository: nb-Timan/timan-site-0ce5375c\nCommit: a8289899',
      title_public: 'Forbedret områdekort i kontrakten',
      description_public: 'Områdekortet i kontrakten er blevet forbedret.\n\nOmråde: Kort / Kontrakt',
      localized_content: {
        da: {
          title: 'Forbedret områdekort i kontrakten',
          description: 'Områdekortet i kontrakten er blevet forbedret.\n\nOmråde: Kort / Kontrakt',
          note: 'Områdekort forbedret',
          module_label: 'Kort / Kontrakt',
        },
        en: {
          title: 'Improved territory map in the contract',
          description: 'The territory map in the contract has been improved.\n\nArea: Map / Contract',
          note: 'Territory map improved',
          module_label: 'Map / Contract',
        },
        de: {
          title: 'Verbesserte Gebietskarte im Vertrag',
          description: 'Die Gebietskarte im Vertrag wurde verbessert.\n\nBereich: Karte / Vertrag',
          note: 'Gebietskarte verbessert',
          module_label: 'Karte / Vertrag',
        },
      },
      module: 'map',
      change_type: 'bugfix',
      affected_roles: ['all'],
      user_impact_score: 5,
      technical_impact_score: 4,
      publish_recommendation: 'maybe' as const,
      is_important: false,
      status: 'published' as const,
      published_at: '2026-08-31T12:00:00.000Z',
      archived_at: null,
      reviewed_at: '2026-08-31T12:00:00.000Z',
      created_by: null,
      updated_by: null,
      published_by: null,
      created_at: '2026-08-31T12:00:00.000Z',
      updated_at: '2026-08-31T12:00:00.000Z',
    };

    expect(getPublishedFeatureContent(row, 'de')).toMatchObject({
      title: 'Verbesserte Gebietskarte im Vertrag',
      description: 'Die Gebietskarte im Vertrag wurde verbessert.\n\nBereich: Karte / Vertrag',
      moduleLabel: 'Karte / Vertrag',
    });
    expect(getPublishedFeatureContent(row, 'fr')).toMatchObject({
      title: 'Improved territory map in the contract',
      description: 'The territory map in the contract has been improved.\n\nArea: Map / Contract',
      moduleLabel: 'Map / Contract',
    });
  });

  it('renders front-page changelog entries with title, description, area and date hierarchy', () => {
    const source = readFileSync('src/components/portal/LatestChanges.tsx', 'utf8');

    expect(source).toContain('const description = pickLocalizedRecord(entry.description || {}, language)');
    expect(source).toContain("t('siteFeaturesArea', language)");
    expect(source).toContain('formatChangedDate(entry.changed_at)');
    expect(source).toContain('line-clamp-2');
  });

  it('keeps GitHub-imported technical metadata separate from suggested public text', () => {
    const source = readFileSync('supabase/functions/import-site-changes-from-github/index.ts', 'utf8');

    expect(source).toContain('buildPublishedSuggestion(module, changeType)');
    expect(source).toContain('title_public: localizedContent.da.title');
    expect(source).toContain('description_public: localizedContent.da.description');
    expect(source).toContain('technical_description');
    expect(source).toContain('Repository: ${repository}');
    expect(source).not.toContain('Automatisk importeret fra GitHub commit');
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
