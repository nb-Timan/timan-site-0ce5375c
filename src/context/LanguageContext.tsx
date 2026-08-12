import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Language } from '@/types/configurator';
import {
  PORTAL_LANGUAGE_CODES,
  FALLBACK_LANGUAGE,
  mapUiLanguageToLegacy,
  type PortalUiLanguage,
} from '@/lib/portalLanguages';

const STORAGE_KEY = 'timan.language';
const MANUAL_KEY = 'timan.language.manual';
const SUPPORTED: PortalUiLanguage[] = PORTAL_LANGUAGE_CODES;
const FALLBACK: PortalUiLanguage = FALLBACK_LANGUAGE;

function loadFromStorage(): PortalUiLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED as string[]).includes(raw)) return raw as PortalUiLanguage;
  } catch {
    // ignore
  }
  return FALLBACK;
}

function hasManualSelection(): boolean {
  try {
    return localStorage.getItem(MANUAL_KEY) === '1';
  } catch {
    return false;
  }
}

interface LanguageContextValue {
  /**
   * Legacy `Language` for the many inline `Record<Language, string>` lookups
   * (sv/fr/pl/cs are mapped to 'en'). Use this when reading translations from
   * legacy inline T objects.
   */
  language: Language;
  /**
   * Actual selected portal UI language (one of 9 codes). Use for the
   * language switcher's active state and any new translation lookups.
   */
  uiLanguage: PortalUiLanguage;
  /** Manual selection from the top switcher — persists across sessions. */
  setLanguage: (lang: PortalUiLanguage) => void;
  setAutoLanguage: (lang: PortalUiLanguage) => void;
  /**
   * Apply the user's preferred_language only if no manual override exists.
   * Called once after the signed-in user is loaded.
   */
  applyPreferredLanguage: (lang: string | null | undefined) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [uiLanguage, setUiLanguageState] = useState<PortalUiLanguage>(() => loadFromStorage());

  const setLanguage = useCallback((lang: PortalUiLanguage) => {
    const safe: PortalUiLanguage = (SUPPORTED as string[]).includes(lang) ? lang : FALLBACK;
    setUiLanguageState(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
      localStorage.setItem(MANUAL_KEY, '1');
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, []);

  const setAutoLanguage = useCallback((lang: PortalUiLanguage) => {
    const safe: PortalUiLanguage = (SUPPORTED as string[]).includes(lang) ? lang : FALLBACK;
    setUiLanguageState(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, []);

  const applyPreferredLanguage = useCallback((lang: string | null | undefined) => {
    if (!lang || !(SUPPORTED as string[]).includes(lang)) return;
    if (hasManualSelection()) return;
    const safe = lang as PortalUiLanguage;
    setUiLanguageState(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
    } catch {
      // ignore
    }
  }, []);

  // React to language changes from other tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && (SUPPORTED as string[]).includes(e.newValue)) {
        setUiLanguageState(e.newValue as PortalUiLanguage);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language: mapUiLanguageToLegacy(uiLanguage),
      uiLanguage,
      setLanguage,
      setAutoLanguage,
      applyPreferredLanguage,
    }),
    [uiLanguage, setLanguage, setAutoLanguage, applyPreferredLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
