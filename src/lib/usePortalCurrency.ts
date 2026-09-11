import { useMemo } from 'react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { resolveDisplayCurrency } from '@/lib/currency';

/**
 * Shared portal display-currency resolver. `uiLanguage` changes immediately
 * when the top-menu language selector changes, so consumers rerender together.
 */
export function usePortalCurrency() {
  const { appUser } = useAppUser();
  const { uiLanguage } = useLanguage();

  return useMemo(() => resolveDisplayCurrency({
    activeLanguage: uiLanguage,
    preferredLanguage: appUser?.preferred_language,
  }), [appUser?.preferred_language, uiLanguage]);
}
