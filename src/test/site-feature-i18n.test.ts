import { describe, expect, it } from 'vitest';
import {
  SITE_FEATURE_TRANSLATIONS,
  siteFeatureT,
  type SiteFeatureI18nKey,
} from '@/lib/i18n/siteFeatureTranslations';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';

describe('site feature i18n', () => {
  it('covers every site feature label in all portal languages', () => {
    const keys = Object.keys(SITE_FEATURE_TRANSLATIONS.da) as SiteFeatureI18nKey[];

    for (const lang of PORTAL_LANGUAGE_CODES) {
      for (const key of keys) {
        expect(SITE_FEATURE_TRANSLATIONS[lang][key], `${lang}.${key}`).toBeTruthy();
      }
    }
  });

  it('resolves the visible marketing labels in German and English', () => {
    expect(siteFeatureT('siteFeaturesTitle', 'de')).toBe('Neue Funktionen auf der Website');
    expect(siteFeatureT('siteFeaturesSyncGitHub', 'de')).toBe('GitHub synchronisieren');
    expect(siteFeatureT('siteFeaturesStatusNew', 'de')).toBe('Neu / nicht geprüft');
    expect(siteFeatureT('siteFeaturesRoleDealerCustomer', 'de')).toBe('Händlerkunde');

    expect(siteFeatureT('siteFeaturesTitle', 'en')).toBe('New site features');
    expect(siteFeatureT('siteFeaturesStatusNew', 'en')).toBe('New / not reviewed');
  });
});
