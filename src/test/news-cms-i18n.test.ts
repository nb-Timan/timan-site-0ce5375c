import { describe, it, expect } from 'vitest';
import { t } from '@/lib/i18n/translations';
import { NEWS_CMS_TRANSLATIONS } from '@/lib/i18n/newsCmsTranslations';

const LANGS = ['da','en','de','it','hu','sv','fr','pl','cs'] as const;

describe('news cms i18n', () => {
  it('covers every key in all 9 languages', () => {
    const keys = Object.keys(NEWS_CMS_TRANSLATIONS.da);
    for (const lang of LANGS) {
      for (const key of keys) {
        expect(typeof (NEWS_CMS_TRANSLATIONS as any)[lang][key], `${lang}.${key}`).toBe('string');
      }
    }
  });
  it('resolves through t() without English leakage', () => {
    expect(t('newsCmsBadgeNews','de')).toBe('NEUHEIT');
    expect(t('newsCmsCategoryProductAnnouncement','pl')).toBe('NOWOŚĆ PRODUKTOWA');
    expect(t('newsCmsStepPublish','de')).toBe('Veröffentlichen');
    expect(t('newsCmsSaveDraft','pl')).toBe('Zapisz wersję roboczą');
    expect(t('newsCmsColumnActions','cs')).toBe('Akce');
  });
});
