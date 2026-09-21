import { describe, expect, it } from 'vitest';
import { demoLinkingText, type DemoLinkingTextKey } from '@/lib/crmDemoLinkingI18n';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

const languages: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
const keys: DemoLinkingTextKey[] = [
  'title', 'linkExisting', 'createNew', 'selectExisting', 'selectPlaceholder',
  'searchLead', 'noLeads', 'leadUnavailable', 'loadingLeads',
];

describe('Demo lead-linking translations', () => {
  it('has non-empty copy for every portal language', () => {
    for (const language of languages) {
      for (const key of keys) expect(demoLinkingText(key, language)).toBeTruthy();
    }
  });

  it('uses the requested canonical Danish, English and German terminology', () => {
    expect(demoLinkingText('linkExisting', 'da')).toBe('Knyt til eksisterende lead');
    expect(demoLinkingText('linkExisting', 'en')).toBe('Link to existing lead');
    expect(demoLinkingText('title', 'de')).toBe('Zugehöriger Demo-Lead');
    expect(demoLinkingText('linkExisting', 'de')).toBe('Mit bestehendem Lead verknüpfen');
    expect(demoLinkingText('selectExisting', 'de')).toBe('Bestehenden Lead auswählen');
    expect(demoLinkingText('selectPlaceholder', 'de')).toBe('Lead auswählen…');
  });

  it('does not fall back to Danish for the additional portal languages', () => {
    for (const language of ['it', 'hu', 'sv', 'fr', 'pl', 'cs'] as PortalUiLanguage[]) {
      expect(demoLinkingText('selectExisting', language)).not.toBe(demoLinkingText('selectExisting', 'da'));
      expect(demoLinkingText('noLeads', language)).not.toBe(demoLinkingText('noLeads', 'da'));
    }
  });
});
