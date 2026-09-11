import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LANGUAGE,
  PORTAL_LANGUAGE_CODES,
  normalizePortalLanguageCode,
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
});
