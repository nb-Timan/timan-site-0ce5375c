import { describe, expect, it } from 'vitest';
import { TIMAN_2620_INFO_TRANSLATIONS, TIMAN_2620_INFO_KEYS } from '@/lib/i18n/timan2620InfoTranslations';
import { translations, t } from '@/lib/i18n/translations';

const LANGS = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;

describe('Timan 2620 information modal translations', () => {
  it('defines every key in all 9 portal languages', () => {
    for (const lang of LANGS) {
      for (const key of TIMAN_2620_INFO_KEYS) {
        const v = TIMAN_2620_INFO_TRANSLATIONS[lang][key];
        expect(typeof v, `${lang}/${key}`).toBe('string');
        expect(v.length, `${lang}/${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('is registered in the central translation registry', () => {
    for (const lang of LANGS) {
      for (const key of TIMAN_2620_INFO_KEYS) {
        expect(translations[lang][key], `${lang}/${key}`).toBe(TIMAN_2620_INFO_TRANSLATIONS[lang][key]);
        expect(t(key, lang)).not.toBe(key);
      }
    }
  });

  it('does not leave Danish text in other languages for translated labels', () => {
    const sample = ['m2620i_redskab_title', 'm2620i_udstyr_title', 'm2620i_bucket_name', 'm2620i_salt_x1_value'];
    for (const lang of LANGS.filter(l => l !== 'da')) {
      for (const key of sample) {
        expect(translations[lang][key], `${lang}/${key}`).not.toBe(translations.da[key]);
      }
    }
  });
});
