import { describe, expect, it } from 'vitest';
import { ACADEMY_TRANSLATIONS } from '@/lib/i18n/academyTranslations';
import { t } from '@/lib/i18n/translations';

const locales = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

describe('Academy Portal Basics fullscreen guidance', () => {
  it('provides a native fullscreen instruction through the shared registry for every supported Academy locale', () => {
    for (const locale of locales) {
      const translations = ACADEMY_TRANSLATIONS[locale];

      expect(translations.academyPortalBasicsFullscreenTask).toBeTruthy();
      expect(translations.academyPortalBasicsFullscreenDescription).toBeTruthy();
      expect(translations.academyPortalBasicsFullscreenNext).toBeTruthy();
      expect(t('academyPortalBasicsFullscreenTask', locale)).toBe(translations.academyPortalBasicsFullscreenTask);
      expect(t('academyPortalBasicsFullscreenDescription', locale)).toBe(translations.academyPortalBasicsFullscreenDescription);
      expect(t('academyPortalBasicsFullscreenNext', locale)).toBe(translations.academyPortalBasicsFullscreenNext);
    }

    expect(ACADEMY_TRANSLATIONS.da.academyPortalBasicsFullscreenDescription).toContain('to diagonale pile');
    expect(ACADEMY_TRANSLATIONS.en.academyPortalBasicsFullscreenDescription).toContain('two diagonal arrows');
    expect(ACADEMY_TRANSLATIONS.de.academyPortalBasicsFullscreenDescription).toContain('zwei diagonalen Pfeilen');
    expect(ACADEMY_TRANSLATIONS.it.academyPortalBasicsFullscreenDescription).toContain('due frecce diagonali');
    expect(ACADEMY_TRANSLATIONS.hu.academyPortalBasicsFullscreenDescription).toContain('két átlós nyilat');
    expect(ACADEMY_TRANSLATIONS.sv.academyPortalBasicsFullscreenDescription).toContain('två diagonala pilarna');
    expect(ACADEMY_TRANSLATIONS.fr.academyPortalBasicsFullscreenDescription).toContain('deux flèches diagonales');
    expect(ACADEMY_TRANSLATIONS.pl.academyPortalBasicsFullscreenDescription).toContain('dwiema ukośnymi strzałkami');
    expect(ACADEMY_TRANSLATIONS.cs.academyPortalBasicsFullscreenDescription).toContain('dvěma šikmými šipkami');
  });
});
