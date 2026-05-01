/**
 * Single source of truth for portal languages.
 *
 * Used by:
 *  - LanguageContext (portal language switcher)
 *  - Signup form (Preferred language dropdown)
 *  - Backend Users admin (Edit user > Language)
 *
 * Add a new language here and it shows up everywhere automatically.
 */

import type { Language } from '@/types/configurator';

export interface PortalLanguageOption {
  /** Internal code (matches type Language). */
  code: Language;
  /** ISO-style flag/country label shown in the switcher (DK, GB, DE, IT, HU). */
  flag: string;
  /** Native display name for dropdowns. */
  label: string;
}

export const PORTAL_LANGUAGES: PortalLanguageOption[] = [
  { code: 'da', flag: 'DK', label: 'Dansk' },
  { code: 'en', flag: 'GB', label: 'English' },
  { code: 'de', flag: 'DE', label: 'Deutsch' },
  { code: 'it', flag: 'IT', label: 'Italiano' },
  { code: 'hu', flag: 'HU', label: 'Magyar' },
];

export const PORTAL_LANGUAGE_CODES: Language[] = PORTAL_LANGUAGES.map((l) => l.code);
export const FALLBACK_LANGUAGE: Language = 'da';

export function isSupportedLanguage(value: string | null | undefined): value is Language {
  return !!value && (PORTAL_LANGUAGE_CODES as string[]).includes(value);
}
