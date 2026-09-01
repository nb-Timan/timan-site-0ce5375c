import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SITE_FEATURE_TRANSLATIONS,
  siteFeatureT,
  type SiteFeatureI18nKey,
} from '@/lib/i18n/siteFeatureTranslations';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';

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
    expect(siteFeatureT('siteFeaturesGroupSelected', 'de')).toBe('Zu einer Funktion bündeln');
    expect(siteFeatureT('siteFeaturesRoleDealerCustomer', 'de')).toBe('Händlerkunde');
    expect(siteFeatureT('siteFeaturesModuleMarketing', 'de')).toBe('Marketing');
    expect(siteFeatureT('siteFeaturesTypeBugfix', 'de')).toBe('Fehlerbehebung');

    expect(siteFeatureT('siteFeaturesTitle', 'en')).toBe('New site features');
    expect(siteFeatureT('siteFeaturesStatusNew', 'en')).toBe('New / not reviewed');
  });

  it('keeps grouped publication labels and GitHub sync counts available in every portal language', () => {
    for (const lang of PORTAL_LANGUAGE_CODES) {
      expect(siteFeatureT('siteFeaturesGroupSelected', lang), `${lang}.siteFeaturesGroupSelected`).toBeTruthy();
      expect(siteFeatureT('siteFeaturesGroupedCount', lang), `${lang}.siteFeaturesGroupedCount`).toContain('{count}');
      expect(siteFeatureT('siteFeaturesGitHubSynced', lang), `${lang}.siteFeaturesGitHubSynced`).toContain('{groups}');
    }
  });

  it('is available through the central portal translation resolver', () => {
    expect(t('siteFeaturesTitle', 'de')).toBe('Neue Funktionen auf der Website');
    expect(t('siteFeaturesSyncGitHub', 'de')).toBe('GitHub synchronisieren');
    expect(t('siteFeaturesStatusNew', 'de')).toBe('Neu / nicht geprüft');
    expect(t('siteFeaturesAllModules', 'en')).toBe('All modules');
    expect(t('siteFeaturesAllModules', 'da')).toBe('Alle moduler');
  });

  it('keeps the Site Features page wired to translation keys instead of hardcoded Danish UI labels', () => {
    const source = readFileSync(join(process.cwd(), 'src/pages/backend/BackendChangelogPage.tsx'), 'utf8');
    expect(source).toContain('useLanguage()');
    expect(source).toContain('uiLanguage');
    expect(source).toContain('t(key, uiLanguage)');

    for (const label of [
      'Nye features på sitet',
      'Intern produkt-changelog',
      'Synkronisér GitHub',
      'Genindlæs',
      'Anvend søgning',
      'Alle anbefalinger',
      'Alle målgrupper',
      'Ny / ikke gennemgået',
      'Vælg en ændring',
      'Marketing kan omskrive',
    ]) {
      expect(source, label).not.toContain(label);
    }
  });
});
