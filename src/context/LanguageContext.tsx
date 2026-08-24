import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { Language } from '@/types/configurator';
import {
  FALLBACK_LANGUAGE,
  mapUiLanguageToLegacy,
  normalizePortalLanguageCode,
  type PortalUiLanguage,
} from '@/lib/portalLanguages';

const FALLBACK: PortalUiLanguage = FALLBACK_LANGUAGE;

function normalizeOrFallback(lang: string | null | undefined): PortalUiLanguage {
  return normalizePortalLanguageCode(lang) || FALLBACK;
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
  /** Manual selection from the top switcher — session only. */
  setLanguage: (lang: PortalUiLanguage) => void;
  setAutoLanguage: (lang: PortalUiLanguage) => void;
  /**
   * Apply the user's preferred_language only if no manual override exists.
   * Called once after the signed-in user is loaded.
   */
  applyPreferredLanguage: (lang: string | null | undefined) => void;
  resetLanguageForIdentity: (lang: string | null | undefined) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [uiLanguage, setUiLanguageState] = useState<PortalUiLanguage>(FALLBACK);
  const manualOverrideRef = useRef(false);

  const setLanguage = useCallback((lang: PortalUiLanguage) => {
    manualOverrideRef.current = true;
    setUiLanguageState(normalizeOrFallback(lang));
  }, []);

  const setAutoLanguage = useCallback((lang: PortalUiLanguage) => {
    manualOverrideRef.current = false;
    setUiLanguageState(normalizeOrFallback(lang));
  }, []);

  const applyPreferredLanguage = useCallback((lang: string | null | undefined) => {
    if (manualOverrideRef.current) return;
    setUiLanguageState(normalizeOrFallback(lang));
  }, []);

  const resetLanguageForIdentity = useCallback((lang: string | null | undefined) => {
    manualOverrideRef.current = false;
    setUiLanguageState(normalizeOrFallback(lang));
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language: mapUiLanguageToLegacy(uiLanguage),
      uiLanguage,
      setLanguage,
      setAutoLanguage,
      applyPreferredLanguage,
      resetLanguageForIdentity,
    }),
    [uiLanguage, setLanguage, setAutoLanguage, applyPreferredLanguage, resetLanguageForIdentity],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
