import { describe, expect, it } from 'vitest';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import { SUPPORT_ADMIN_TRANSLATIONS, getSupportAdminCopy } from '@/lib/i18n/supportAdminTranslations';

describe('Support administration translations', () => {
  it('covers every static key in all nine portal languages', () => {
    const englishKeys = Object.keys(SUPPORT_ADMIN_TRANSLATIONS.en);
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);
    for (const language of PORTAL_LANGUAGE_CODES) {
      const copy = getSupportAdminCopy(language);
      expect(Object.keys(copy)).toEqual(expect.arrayContaining(englishKeys));
      for (const key of englishKeys) {
        expect(String(copy[key as keyof typeof copy]).trim(), `${language}.${key}`).not.toBe('');
      }
    }
  });

  it('provides localized navigation and zero-state labels', () => {
    expect(getSupportAdminCopy('da').overview).toBe('Overblik');
    expect(getSupportAdminCopy('de').knowledgeBase).toBe('Wissensbasis');
    expect(getSupportAdminCopy('it').unanswered).toBe('Senza risposta');
    expect(getSupportAdminCopy('hu').noData).not.toBe(getSupportAdminCopy('en').noData);
    expect(getSupportAdminCopy('sv').questions).toBe('Frågor');
    expect(getSupportAdminCopy('fr').observability).toContain('Observabilité');
    expect(getSupportAdminCopy('pl').feedback).toBe('Opinie');
    expect(getSupportAdminCopy('cs').knowledgeGaps).toContain('znalost');
  });
});
