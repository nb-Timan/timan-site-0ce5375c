import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Language } from '@/types/configurator';
import { PORTAL_LANGUAGE_CODES, FALLBACK_LANGUAGE } from '@/lib/portalLanguages';

const STORAGE_KEY = 'timan.language';
const MANUAL_KEY = 'timan.language.manual';
const SUPPORTED: Language[] = PORTAL_LANGUAGE_CODES;
const FALLBACK: Language = FALLBACK_LANGUAGE;

function loadFromStorage(): Language {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED as string[]).includes(raw)) return raw as Language;
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
  language: Language;
  /** Manual selection from the top switcher — persists across sessions. */
  setLanguage: (lang: Language) => void;
  /**
   * Apply the user's preferred_language only if no manual override exists.
   * Called once after the signed-in user is loaded.
   */
  applyPreferredLanguage: (lang: string | null | undefined) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => loadFromStorage());

  const setLanguage = useCallback((lang: Language) => {
    const safe = (SUPPORTED as string[]).includes(lang) ? lang : FALLBACK;
    setLanguageState(safe);
    try {
      localStorage.setItem(STORAGE_KEY, safe);
      localStorage.setItem(MANUAL_KEY, '1');
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, []);

  const applyPreferredLanguage = useCallback((lang: string | null | undefined) => {
    if (!lang || !(SUPPORTED as string[]).includes(lang)) return;
    if (hasManualSelection()) return;
    const safe = lang as Language;
    setLanguageState(safe);
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
        setLanguageState(e.newValue as Language);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, applyPreferredLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
