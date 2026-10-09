import { describe, expect, it } from 'vitest';
import { getPublishedFeatureContent, isCoherentSiteFeatureGroup } from '@/lib/portalChangelogService';
import {
  isPureTechnicalSiteChange,
  resolveSiteFeatureClassification,
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

  it.each([
    ['Add canonical campaign opt-out pricing', 'Kampagner kan nu deaktiveres i Configurator', 'sales', 'improvement'],
    ['Add direct Configurator pricing mode', 'Direkte kan nu kun bruges til tilbud', 'sales', 'improvement'],
    ['Enforce configurator pricing precedence', 'Direkte kan nu kun bruges til tilbud', 'sales', 'improvement'],
    ['Add read-only CRM sales document breakdowns', 'Tilbud og ordrer viser nu rabatfordelingen', 'crm', 'feature'],
    ['Secure machine margins and add warranty indicator', 'Forlænget garanti vises på maskiner', 'service', 'feature'],
    ['Fix Support product price lookup', 'AI Support kan slå aktuelle produktpriser op', 'ai_support', 'bugfix'],
    ['Fix spare-parts identification routing', 'Reservedels-support er blevet udvidet', 'ai_support', 'improvement'],
    ['Add Academy progressive portal access', 'Academy åbner Portal-funktioner trin for trin', 'academy', 'feature'],
    ['Make released price lists canonical', 'Prislister kan nu frigives til Configurator', 'sales', 'feature'],
    ['Decouple Configurator demo access', 'Sælgeres demo-adgang er gjort mere præcis', 'sales', 'improvement'],
    ['feat: add importer pricing and campaign audiences', 'Kampagner kan målrettes relevante målgrupper', 'marketing', 'campaign'],
  ])('extracts product capability from %s', (title, expectedTitle, module, changeType) => {
    const source = { title_internal: title, technical_description: `Commit message:\n${title}` };
    expect(resolveUserFacingSiteFeature(source, 'da')?.title).toBe(expectedTitle);
    expect(resolveSiteFeatureClassification(source)).toMatchObject({ module, changeType });
  });

  it('provides concrete localized copy for all portal languages for a current capability', () => {
    const source = { title_internal: 'Add canonical campaign opt-out pricing' };
    const copies = SITE_FEATURE_LANGUAGES.map((language) => resolveUserFacingSiteFeature(source, language));
    expect(copies).toHaveLength(9);
    expect(copies.every((copy) => Boolean(copy?.title && copy?.description))).toBe(true);
    expect(copies.every((copy) => !/backend er opdateret|has been updated/i.test(copy?.title || ''))).toBe(true);
  });

  it('prioritizes the concrete commit title over unrelated technical file evidence', () => {
    const source = {
      title_internal: 'Make released price lists canonical',
      technical_description: 'Changed files:\nsupabase/functions/support-product-price-lookup/index.ts',
    };
    expect(resolveUserFacingSiteFeature(source, 'da')?.title).toBe('Prislister kan nu frigives til Configurator');
    expect(resolveSiteFeatureClassification(source)).toMatchObject({ id: 'price-list-release', module: 'sales' });
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

  it('classifies security and technical noise conservatively without hiding a known safe feature', () => {
    expect(isPureTechnicalSiteChange({ title_internal: 'chore: dependency update' })).toBe(true);
    expect(resolveSiteFeatureClassification({ title_internal: 'Secure machine margins and add warranty indicator' }))
      .toMatchObject({ id: 'machine-extended-warranty-indicator', recommendation: 'publish' });
  });
});
