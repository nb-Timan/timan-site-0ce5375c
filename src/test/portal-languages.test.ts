import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LANGUAGE,
  PORTAL_LANGUAGES,
  PORTAL_LANGUAGE_CODES,
  normalizePortalLanguageCode,
  portalLanguageDisplayCode,
  portalLanguageQueryAliases,
} from '@/lib/portalLanguages';

describe('portal language registry', () => {
  it('keeps Czech and rejects retired Turkish language values', () => {
    expect(PORTAL_LANGUAGE_CODES).toEqual(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']);
    expect(normalizePortalLanguageCode('CZ')).toBe('cs');
    expect(normalizePortalLanguageCode('cs-CZ')).toBe('cs');
    expect(normalizePortalLanguageCode('TR')).toBeNull();
    expect(normalizePortalLanguageCode('tr-TR')).toBeNull();
  });

  it('uses the safe default when a retired value reaches URL, storage, or user state', () => {
    expect(normalizePortalLanguageCode('TR') || FALLBACK_LANGUAGE).toBe('da');
  });

  it('normalizes portal display codes and safe aliases to one internal identity', () => {
    for (const value of ['dk', 'DA', 'da']) expect(normalizePortalLanguageCode(value)).toBe('da');
    for (const value of ['gb', 'EN', 'en']) expect(normalizePortalLanguageCode(value)).toBe('en');
    for (const value of ['se', 'SV', 'sv']) expect(normalizePortalLanguageCode(value)).toBe('sv');
    for (const value of ['cz', 'CZ', 'CS', 'cs']) expect(normalizePortalLanguageCode(value)).toBe('cs');
  });

  it('uses the nine portal selector labels for every user-facing language code', () => {
    expect(PORTAL_LANGUAGES.map((language) => language.flag)).toEqual(['DK', 'GB', 'DE', 'IT', 'HU', 'SE', 'FR', 'PL', 'CZ']);
    expect(PORTAL_LANGUAGE_CODES.map(portalLanguageDisplayCode)).toEqual(['DK', 'GB', 'DE', 'IT', 'HU', 'SE', 'FR', 'PL', 'CZ']);
    expect(portalLanguageDisplayCode('CS')).toBe('CZ');
    expect(portalLanguageDisplayCode('SV')).toBe('SE');
    expect(portalLanguageDisplayCode('EN')).toBe('GB');
    expect(portalLanguageDisplayCode('DA')).toBe('DK');
  });

  it('keeps legacy aliases queryable without creating another language identity', () => {
    expect(portalLanguageQueryAliases('CZ')).toEqual(['cs', 'CS', 'cz', 'CZ']);
    expect(portalLanguageQueryAliases('SE')).toEqual(['sv', 'SV', 'se', 'SE']);
    expect(portalLanguageQueryAliases('GB')).toEqual(['en', 'EN', 'gb', 'GB']);
    expect(portalLanguageQueryAliases('DK')).toEqual(['da', 'DA', 'dk', 'DK']);
  });
});
