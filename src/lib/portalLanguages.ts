/**
 * Single source of truth for portal languages.
 *
 * Adding a new portal UI language:
 *  1. Add a new code to `PortalUiLanguage` below.
 *  2. Append an entry to `PORTAL_LANGUAGES`.
 *  3. Map the new code to a legacy `Language` (used by the existing inline T
 *     objects scattered across pages) in `mapUiLanguageToLegacy()` — fallback
 *     to 'en' (or 'da' if English is missing) so no component crashes.
 *  4. Optionally add translations to `src/lib/i18n/translations.ts` for the
 *     central translation registry. Missing keys fall back to English, then
 *     Danish.
 *
 * Used by:
 *  - LanguageContext (portal language switcher)
 *  - Signup form (Preferred language dropdown)
 *  - Backend Users admin (Edit user > Language)
 *  - PortalHeader language selector
 */

import type { Language } from '@/types/configurator';

/**
 * Legacy `Language` covers the 5 fully-translated portal languages.
 * `PortalUiLanguage` extends this with newer UI-only locales whose translations
 * fall back to English. All language storage (localStorage, preferred_language)
 * uses these codes.
 */
export type PortalUiLanguage = Language | 'sv' | 'fr' | 'pl' | 'cs';

export interface PortalLanguageOption {
  /** Internal code persisted everywhere. */
  code: PortalUiLanguage;
  /** ISO-style flag/country label shown in dropdowns (DK, GB, DE, …). */
  flag: string;
  /** Emoji flag rendered in the language switcher. */
  emoji: string;
  /** Native display name for dropdowns. */
  label: string;
}

export const PORTAL_LANGUAGES: PortalLanguageOption[] = [
  { code: 'da', flag: 'DK', emoji: '🇩🇰', label: 'Dansk' },
  { code: 'en', flag: 'GB', emoji: '🇬🇧', label: 'English' },
  { code: 'de', flag: 'DE', emoji: '🇩🇪', label: 'Deutsch' },
  { code: 'it', flag: 'IT', emoji: '🇮🇹', label: 'Italiano' },
  { code: 'hu', flag: 'HU', emoji: '🇭🇺', label: 'Magyar' },
  { code: 'sv', flag: 'SE', emoji: '🇸🇪', label: 'Svenska' },
  { code: 'fr', flag: 'FR', emoji: '🇫🇷', label: 'Français' },
  { code: 'pl', flag: 'PL', emoji: '🇵🇱', label: 'Polski' },
  { code: 'cs', flag: 'CZ', emoji: '🇨🇿', label: 'Čeština' },
];

export const PORTAL_LANGUAGE_CODES: PortalUiLanguage[] = PORTAL_LANGUAGES.map((l) => l.code);
export const FALLBACK_LANGUAGE: Language = 'da';

export const PORTAL_LANGUAGE_ALIASES: Record<PortalUiLanguage, string[]> = {
  da: ['da', 'dk'],
  en: ['en', 'gb'],
  de: ['de'],
  it: ['it'],
  hu: ['hu'],
  sv: ['sv', 'se'],
  fr: ['fr'],
  pl: ['pl'],
  cs: ['cs', 'cz'],
};

/** Legacy `Language` codes that have full inline translation coverage. */
const LEGACY_LANGUAGE_CODES: Language[] = ['da', 'en', 'de', 'it', 'hu'];

export function isSupportedLanguage(value: string | null | undefined): value is PortalUiLanguage {
  return !!value && (PORTAL_LANGUAGE_CODES as string[]).includes(value);
}

export function normalizePortalLanguageCode(value: string | null | undefined): PortalUiLanguage | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;

  for (const code of PORTAL_LANGUAGE_CODES) {
    if (PORTAL_LANGUAGE_ALIASES[code].includes(normalized)) return code;
  }

  return null;
}

export function portalLanguageLookupOrder(
  lang: PortalUiLanguage | string | null | undefined,
  includeAll = false,
): string[] {
  const normalized = normalizePortalLanguageCode(lang) || FALLBACK_LANGUAGE;
  const preferred = PORTAL_LANGUAGE_ALIASES[normalized];
  const fallbacks = [
    ...(normalized === 'en' ? [] : PORTAL_LANGUAGE_ALIASES.en),
    ...(normalized === 'da' ? [] : PORTAL_LANGUAGE_ALIASES.da),
  ];
  const allLanguages = includeAll
    ? PORTAL_LANGUAGE_CODES.flatMap((code) => PORTAL_LANGUAGE_ALIASES[code])
    : [];

  return Array.from(new Set([...preferred, ...fallbacks, ...allLanguages]));
}

/**
 * Map any UI language to a legacy `Language` so the many inline
 * `Record<Language, string>` translation objects keep working.
 * Currently sv/fr/pl/cs fall back to English; English falls back to Danish.
 */
export function mapUiLanguageToLegacy(ui: PortalUiLanguage | string | null | undefined): Language {
  const normalized = normalizePortalLanguageCode(ui);
  if (!normalized) return FALLBACK_LANGUAGE;
  if ((LEGACY_LANGUAGE_CODES as string[]).includes(normalized)) return normalized as Language;
  // sv / fr / pl / cs — and any unknown value — fall back to English.
  return 'en';
}

/**
 * Identity-like cast from a legacy `Language` back to a `PortalUiLanguage`.
 * All legacy codes (da/en/de/it/hu) are valid `PortalUiLanguage` values, so
 * this is just a typed pass-through used by `resolveContentUiLanguage`.
 */
export function legacyToUi(lang: Language): PortalUiLanguage {
  return lang as PortalUiLanguage;
}

/**
 * Resolve a "content language" for modals/HTML builders that mix UI chrome
 * with product/accessory data. Product data is only available in the legacy
 * 5 languages, so for sv/fr/pl/cs we collapse the chrome to English too —
 * preventing mixed-language modals (e.g. French heading + English body).
 *
 * - da/en/de/it/hu → unchanged
 * - sv/fr/pl/cs → 'en'
 */
export function resolveContentUiLanguage(
  ui: PortalUiLanguage | string | null | undefined,
): PortalUiLanguage {
  return legacyToUi(mapUiLanguageToLegacy(ui));
}
