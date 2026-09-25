import { describe, expect, it } from 'vitest';
import { getPublishedFeatureContent, isCoherentSiteFeatureGroup } from '@/lib/portalChangelogService';
import {
  isPureTechnicalSiteChange,
  resolveUserFacingSiteFeature,
  SITE_FEATURE_LANGUAGES,
  siteFeatureTopicKey,
} from '../../supabase/functions/_shared/siteFeatureNormalization';

const GENERIC_LOCALIZED_CONTENT = Object.fromEntries(
  SITE_FEATURE_LANGUAGES.map((language) => [language, {
    title: language === 'da' ? 'CRM er forbedret' : '',
    description: language === 'da' ? 'CRM-arbejdet er blevet gjort mere overskueligt, så leads, opfølgning og salgsarbejde er lettere at holde styr på.' : '',
  }]),
);

function published(titleInternal: string, module = 'crm', changeType = 'improvement') {
  return getPublishedFeatureContent({
    source: 'github',
    source_ref: 'github:abc123',
    title_internal: titleInternal,
    description_internal: 'Automatisk importeret fra GitHub.',
    technical_description: `Commit message:\n${titleInternal}`,
    title_public: 'CRM er forbedret',
    description_public: 'CRM-arbejdet er blevet gjort mere overskueligt, så leads, opfølgning og salgsarbejde er lettere at holde styr på.',
    localized_content: GENERIC_LOCALIZED_CONTENT,
    module,
    change_type: changeType,
  }, 'da');
}

describe('site feature user-facing normalization', () => {
  it.each([
    ['Normalize CRM lead machine filters', 'Leads er blevet nemmere at filtrere'],
    ['Fix CRM demo dealer representative prefill', 'Kontaktpersoner kan vælges ved demo'],
    ['Fix legacy CRM G-lead contact persistence', 'Gamle leads gemmer nu oplysninger korrekt'],
    ['Simplify CRM lead note follow-up UI', 'Noter og opfølgning er samlet på leadet'],
    ['Show original dealer budget basis', 'Budgetgrundlag er nu synligt'],
    ['feat: add advanced sales campaign academy case', 'Ny avanceret salgscase i Academy'],
    ['fix: reset configurator scroll on navigation', 'Konfiguratoren starter øverst ved hvert trin'],
    ['Fix CRM Budget currency normalization', 'Budget viser nu beløb i korrekt valuta'],
  ])('turns %s into concise user-facing copy', (internalTitle, expectedTitle) => {
    const result = published(internalTitle);
    expect(result.title).toBe(expectedTitle);
    expect(result.description).not.toMatch(/github|commit|canonical|migration/i);
    expect(result.description.split(/(?<=[.!?])\s+/)).toHaveLength(1);
  });

  it('provides localized copy for every supported portal language', () => {
    const source = { title_internal: 'Normalize CRM lead machine filters' };
    const titles = SITE_FEATURE_LANGUAGES.map((language) => resolveUserFacingSiteFeature(source, language)?.title);
    expect(titles).toHaveLength(9);
    expect(titles.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(9);
    expect(resolveUserFacingSiteFeature(source, 'de')?.title).toBe('Leads lassen sich leichter filtern');
    expect(resolveUserFacingSiteFeature(source, 'en')?.title).toBe('Leads are easier to filter');
  });

  it('keeps grouping limited to the same concrete user-facing topic', () => {
    expect(siteFeatureTopicKey({ title_internal: 'Normalize CRM lead machine filters' }))
      .toBe(siteFeatureTopicKey({ title_internal: 'Fix CRM lead machine filter options' }));
    expect(siteFeatureTopicKey({ title_internal: 'Show original dealer budget basis' }))
      .not.toBe(siteFeatureTopicKey({ title_internal: 'Normalize CRM lead machine filters' }));
    expect(isCoherentSiteFeatureGroup([
      { title_internal: 'Normalize CRM lead machine filters', description_internal: null, technical_description: null, module: 'crm' },
      { title_internal: 'Fix CRM lead machine filter options', description_internal: null, technical_description: null, module: 'crm' },
    ])).toBe(true);
    expect(isCoherentSiteFeatureGroup([
      { title_internal: 'Normalize CRM lead machine filters', description_internal: null, technical_description: null, module: 'crm' },
      { title_internal: 'Show original dealer budget basis', description_internal: null, technical_description: null, module: 'crm' },
    ])).toBe(false);
  });

  it('marks pure technical maintenance as internal while keeping known user features publishable', () => {
    expect(isPureTechnicalSiteChange({ title_internal: 'refactor: split internal resolver' })).toBe(true);
    expect(isPureTechnicalSiteChange({ title_internal: 'test: update migration tests only' })).toBe(true);
    expect(isPureTechnicalSiteChange({ title_internal: 'Fix CRM demo dealer representative prefill' })).toBe(false);
  });
});
