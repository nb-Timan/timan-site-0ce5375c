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

/** Legacy `Language` codes that have full inline translation coverage. */
const LEGACY_LANGUAGE_CODES: Language[] = ['da', 'en', 'de', 'it', 'hu'];

export function isSupportedLanguage(value: string | null | undefined): value is PortalUiLanguage {
  return !!value && (PORTAL_LANGUAGE_CODES as string[]).includes(value);
}

/**
 * Map any UI language to a legacy `Language` so the many inline
 * `Record<Language, string>` translation objects keep working.
 * Currently sv/fr/pl/cs fall back to English; English falls back to Danish.
 */
export function mapUiLanguageToLegacy(ui: PortalUiLanguage | string | null | undefined): Language {
  if (!ui) return FALLBACK_LANGUAGE;
  if ((LEGACY_LANGUAGE_CODES as string[]).includes(ui)) return ui as Language;
  // sv / fr / pl / cs — and any unknown value — fall back to English.
  return 'en';
}
