/**
 * Localized country display helper.
 *
 * The database keeps the raw country value untouched (could be an ISO-2 code,
 * a Danish/English/German name, or anything the importer produced). For UI we
 * map it to the user's currently-selected portal language using
 * `Intl.DisplayNames` when available, falling back to a small static table.
 *
 * Usage:
 *   const { formatCountry } = useCountryFormatter();
 *   <span>{formatCountry(dealer.country)}</span>
 *
 * Or non-hook:
 *   formatCountry(value, language)
 */

import { useCallback, useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { Language } from '@/types/configurator';

/** Aliases → ISO-3166-1 alpha-2. Lower-cased keys. */
const ALIAS_TO_ISO: Record<string, string> = {
  // Denmark
  dk: 'DK', dnk: 'DK', danmark: 'DK', denmark: 'DK', dänemark: 'DK', danimarca: 'DK', dánia: 'DK',
  // Germany
  de: 'DE', deu: 'DE', tyskland: 'DE', germany: 'DE', deutschland: 'DE', germania: 'DE', németország: 'DE',
  // Sweden
  se: 'SE', swe: 'SE', sverige: 'SE', sweden: 'SE', schweden: 'SE', svezia: 'SE', svédország: 'SE',
  // Spain
  es: 'ES', esp: 'ES', spanien: 'ES', spain: 'ES', españa: 'ES', espana: 'ES', spagna: 'ES', spanyolország: 'ES',
  // Czechia
  cz: 'CZ', cze: 'CZ', tjekkiet: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', tschechien: 'CZ', 'repubblica ceca': 'CZ', csehország: 'CZ',
  // Austria
  at: 'AT', aut: 'AT', østrig: 'AT', oestrig: 'AT', austria: 'AT', österreich: 'AT', oesterreich: 'AT', ausztria: 'AT',
  // Netherlands
  nl: 'NL', nld: 'NL', holland: 'NL', netherlands: 'NL', 'the netherlands': 'NL', nederland: 'NL', niederlande: 'NL', 'paesi bassi': 'NL', hollandia: 'NL',
  // United Kingdom
  gb: 'GB', uk: 'GB', gbr: 'GB', england: 'GB', 'united kingdom': 'GB', storbritannien: 'GB', großbritannien: 'GB', grossbritannien: 'GB', vereinigtes_königreich: 'GB', 'regno unito': 'GB', 'egyesült királyság': 'GB',
  // France
  fr: 'FR', fra: 'FR', frankrig: 'FR', france: 'FR', frankreich: 'FR', francia: 'FR', franciaország: 'FR',
  // Poland
  pl: 'PL', pol: 'PL', polen: 'PL', poland: 'PL', polska: 'PL', polonia: 'PL', lengyelország: 'PL',
  // Belgium
  be: 'BE', bel: 'BE', belgien: 'BE', belgium: 'BE', belgië: 'BE', belgie: 'BE', belgique: 'BE', belgio: 'BE', belgium_hu: 'BE',
  // Canada
  ca: 'CA', can: 'CA', canada: 'CA', kanada: 'CA', kanada_hu: 'CA',
  // Japan
  jp: 'JP', jpn: 'JP', japan: 'JP', japon: 'JP', giappone: 'JP', japán: 'JP',
  // Australia
  au: 'AU', aus: 'AU', australien: 'AU', australia: 'AU', australie: 'AU', ausztrália: 'AU',
  // Italy / Hungary (portal languages — handy to have)
  it: 'IT', ita: 'IT', italien: 'IT', italy: 'IT', italia: 'IT', olaszország: 'IT',
  hu: 'HU', hun: 'HU', ungarn: 'HU', hungary: 'HU', ungheria: 'HU', magyarország: 'HU',
};

/** Manual fallback names per portal language, used when Intl.DisplayNames is unavailable. */
const FALLBACK_NAMES: Record<string, Partial<Record<Language, string>>> = {
  DK: { da: 'Danmark', en: 'Denmark', de: 'Dänemark', it: 'Danimarca', hu: 'Dánia' },
  DE: { da: 'Tyskland', en: 'Germany', de: 'Deutschland', it: 'Germania', hu: 'Németország' },
  SE: { da: 'Sverige', en: 'Sweden', de: 'Schweden', it: 'Svezia', hu: 'Svédország' },
  ES: { da: 'Spanien', en: 'Spain', de: 'Spanien', it: 'Spagna', hu: 'Spanyolország' },
  CZ: { da: 'Tjekkiet', en: 'Czechia', de: 'Tschechien', it: 'Repubblica Ceca', hu: 'Csehország' },
  AT: { da: 'Østrig', en: 'Austria', de: 'Österreich', it: 'Austria', hu: 'Ausztria' },
  NL: { da: 'Holland', en: 'Netherlands', de: 'Niederlande', it: 'Paesi Bassi', hu: 'Hollandia' },
  GB: { da: 'England', en: 'United Kingdom', de: 'Vereinigtes Königreich', it: 'Regno Unito', hu: 'Egyesült Királyság' },
  FR: { da: 'Frankrig', en: 'France', de: 'Frankreich', it: 'Francia', hu: 'Franciaország' },
  PL: { da: 'Polen', en: 'Poland', de: 'Polen', it: 'Polonia', hu: 'Lengyelország' },
  BE: { da: 'Belgien', en: 'Belgium', de: 'Belgien', it: 'Belgio', hu: 'Belgium' },
  CA: { da: 'Canada', en: 'Canada', de: 'Kanada', it: 'Canada', hu: 'Kanada' },
  JP: { da: 'Japan', en: 'Japan', de: 'Japan', it: 'Giappone', hu: 'Japán' },
  AU: { da: 'Australien', en: 'Australia', de: 'Australien', it: 'Australia', hu: 'Ausztrália' },
  IT: { da: 'Italien', en: 'Italy', de: 'Italien', it: 'Italia', hu: 'Olaszország' },
  HU: { da: 'Ungarn', en: 'Hungary', de: 'Ungarn', it: 'Ungheria', hu: 'Magyarország' },
};

/** Try to resolve a raw country value to an ISO-3166-1 alpha-2 code. */
export function toCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Direct ISO-2.
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase();
  return ALIAS_TO_ISO[key] ?? null;
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();
function getDisplayNames(locale: string): Intl.DisplayNames | null {
  if (displayNamesCache.has(locale)) return displayNamesCache.get(locale) ?? null;
  let instance: Intl.DisplayNames | null = null;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      instance = new Intl.DisplayNames([locale], { type: 'region' });
    }
  } catch {
    instance = null;
  }
  displayNamesCache.set(locale, instance);
  return instance;
}

/** Format a raw country value for display in the given portal language. */
export function formatCountry(value: string | null | undefined, locale: Language = 'da'): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const iso = toCountryCode(raw);
  if (!iso) return raw; // unknown — show as-is

  // Special case for Danish — Intl returns "Storbritannien", but the project
  // historically labels it "England".
  if (locale === 'da' && iso === 'GB') return 'England';

  const dn = getDisplayNames(locale);
  if (dn) {
    try {
      const out = dn.of(iso);
      if (out && out !== iso) return out;
    } catch {
      // fall through
    }
  }
  return FALLBACK_NAMES[iso]?.[locale] ?? raw;
}

/** React hook bound to the current portal language. */
export function useCountryFormatter() {
  const { language } = useLanguage();
  const fmt = useCallback((value: string | null | undefined) => formatCountry(value, language), [language]);
  return useMemo(() => ({ formatCountry: fmt, language }), [fmt, language]);
}
