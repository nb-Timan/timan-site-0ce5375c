import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { Language } from '@/types/configurator';
import {
  FALLBACK_LANGUAGE,
  mapUiLanguageToLegacy,
  normalizePortalLanguageCode,
  type PortalUiLanguage,
} from '@/lib/portalLanguages';

const FALLBACK: PortalUiLanguage = FALLBACK_LANGUAGE;
const STORAGE_KEY = 'timan.language';

function normalizeOrFallback(lang: string | null | undefined): PortalUiLanguage {
  return normalizePortalLanguageCode(lang) || FALLBACK;
}

function readStoredLanguage(): PortalUiLanguage | null {
  if (typeof window === 'undefined') return null;
  try {
    return normalizePortalLanguageCode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredLanguage(lang: PortalUiLanguage) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage is optional; the in-memory language still updates.
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
  const [uiLanguage, setUiLanguageState] = useState<PortalUiLanguage>(() => readStoredLanguage() || FALLBACK);
  const manualOverrideRef = useRef(false);

  const setLanguage = useCallback((lang: PortalUiLanguage) => {
    const normalized = normalizeOrFallback(lang);
    manualOverrideRef.current = true;
    writeStoredLanguage(normalized);
    setUiLanguageState(normalized);
  }, []);

  const setAutoLanguage = useCallback((lang: PortalUiLanguage) => {
    const normalized = normalizeOrFallback(lang);
    manualOverrideRef.current = false;
    writeStoredLanguage(normalized);
    setUiLanguageState(normalized);
  }, []);

  const applyPreferredLanguage = useCallback((lang: string | null | undefined) => {
    if (manualOverrideRef.current) return;
    const stored = readStoredLanguage();
    if (stored) {
      setUiLanguageState(stored);
      return;
    }
    setUiLanguageState(normalizeOrFallback(lang));
  }, []);

  const resetLanguageForIdentity = useCallback((lang: string | null | undefined) => {
    manualOverrideRef.current = false;
    const stored = readStoredLanguage();
    if (stored) {
      setUiLanguageState(stored);
      return;
    }
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
