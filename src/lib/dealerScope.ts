/**
 * Phase 51 — Generel dealer-scope helper for hele portalen.
 *
 * Når en bruger er logget ind som forhandler / importør / servicepartner /
 * dealer_user / partner, skal systemet AUTOMATISK bruge brugerens egen
 * forhandler. Brugeren må aldrig kunne vælge en anden forhandler.
 *
 * Interne Timan-roller (backend / service / sælger / admin) kan have
 * forhandler-dropdown hvor det er relevant — denne hook fortæller bare,
 * om dropdown må vises og hvilken låst forhandler ekstern bruger har.
 *
 * NB:
 *  - UI-lock alene er ikke nok. Alle submits til Supabase SKAL bruge
 *    `lockedDealerNumber` for eksterne brugere — RLS bør også blokere
 *    forsøg på at gemme på en anden konto.
 *  - Sælger-scope mod konkrete dealer-konti er kun bygget i CRM
 *    (`account_owner_user_id`). For andre flows (formularer, service,
 *    konfigurator) returnerer denne hook `availableDealers = null`
 *    indtil scope-relationen er afklaret. Komponenter skal håndtere
 *    null som "ikke begrænset — vis fuld liste eller intet" alt efter
 *    kontekst.
 */
import { useEffect, useState } from 'react';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import {
  fetchDealerAccountByNumber,
  DealerAccount,
} from '@/lib/dealerAccountsService';
import { PortalRole } from '@/lib/portalAccess';

const EXTERNAL_DEALER_ROLES: ReadonlySet<string> = new Set([
  'timan_dealer',
  'timan_importer',
  'timan_service_partner',
  'dealer_customer',
  'dealer_user',
]);

const INTERNAL_TIMAN_ROLES: ReadonlySet<string> = new Set([
  'timan_backend',
  'timan_service',
  'timan_seller',
]);

export interface DealerScope {
  /** True når brugeren er en ekstern forhandler-rolle og skal låses. */
  isExternalDealerUser: boolean;
  /** True når intern Timan-rolle og dropdown må vises. */
  canChooseDealer: boolean;
  /** Låst dealer-nummer (account_number) for ekstern bruger. Null for interne. */
  lockedDealerNumber: string | null;
  /** Firmanavn på låst dealer (fra dealer_accounts eller app_users.company_dealer). */
  lockedDealerName: string | null;
  /** Den fulde dealer_accounts-række, hvis den er hentet. */
  lockedDealerAccount: DealerAccount | null;
  /** True når ekstern bruger mangler dealer_number — formularer skal disable Send. */
  missingDealerLink: boolean;
  /** Færdig fejlbesked til UI når dealer mangler. */
  errorMessage: string | null;
  /** True hvis vi stadig henter dealer_accounts-rækken. */
  loading: boolean;
  /** Rolle på den (effektive) bruger. */
  role: PortalRole | null;
}

const DEFAULT_SCOPE: DealerScope = {
  isExternalDealerUser: false,
  canChooseDealer: false,
  lockedDealerNumber: null,
  lockedDealerName: null,
  lockedDealerAccount: null,
  missingDealerLink: false,
  errorMessage: null,
  loading: false,
  role: null,
};

/**
 * useDealerScope — fælles regel for hele portalen.
 *
 * Returnerer scope baseret på den logged-in bruger:
 *  - Eksterne forhandler-roller låses til egen dealer_number.
 *  - Interne Timan-roller får canChooseDealer = true (dropdown må vises).
 *  - Ekstern bruger uden dealer_number markeres med missingDealerLink.
 *
 * @param opts.requireDealer Hvis true sættes errorMessage / missingDealerLink
 *   når ekstern bruger mangler dealer_number.
 */
export function useDealerScope(opts: { requireDealer?: boolean } = {}): DealerScope {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser ?? null);
  const [account, setAccount] = useState<DealerAccount | null>(null);
  const [loading, setLoading] = useState(false);

  const role = (effectiveUser?.portal_role as PortalRole | null) ?? null;
  const isExternal = !!role && EXTERNAL_DEALER_ROLES.has(role);
  const isInternal = !!role && INTERNAL_TIMAN_ROLES.has(role);
  const dealerNumber = (effectiveUser?.dealer_number ?? '').trim() || null;

  // Hent dealer_accounts-rækken for ekstern bruger så vi har officielt firmanavn,
  // adresse osv. Falder tilbage til app_users.company_dealer hvis ikke fundet.
  useEffect(() => {
    if (!isExternal || !dealerNumber) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchDealerAccountByNumber(dealerNumber)
      .then(({ row }) => {
        if (!cancelled) setAccount(row);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isExternal, dealerNumber]);

  if (!effectiveUser || !role) return DEFAULT_SCOPE;

  const missingDealerLink = isExternal && !dealerNumber;
  const lockedDealerName =
    account?.company_name ?? effectiveUser?.company_dealer ?? null;
  const errorMessage =
    opts.requireDealer && missingDealerLink
      ? 'Din bruger er ikke koblet til en forhandler. Kontakt Timan.'
      : null;

  return {
    isExternalDealerUser: isExternal,
    canChooseDealer: isInternal,
    lockedDealerNumber: isExternal ? dealerNumber : null,
    lockedDealerName: isExternal ? lockedDealerName : null,
    lockedDealerAccount: isExternal ? account : null,
    missingDealerLink,
    errorMessage,
    loading,
    role,
  };
}

/**
 * Resolve den dealer-værdi der SKAL bruges i et submit/update payload.
 *
 * Eksterne brugere: altid lockedDealerNumber (ignorer evt. UI-input).
 * Interne brugere: brug det dealer-nummer som UI har valgt (fallback null).
 */
export function resolveDealerSelection(
  scope: DealerScope,
  uiSelectedDealerNumber: string | null,
): { dealer_account_number: string | null; dealer_name: string | null } {
  if (scope.isExternalDealerUser) {
    return {
      dealer_account_number: scope.lockedDealerNumber,
      dealer_name: scope.lockedDealerName,
    };
  }
  return {
    dealer_account_number: (uiSelectedDealerNumber ?? '').trim() || null,
    dealer_name: null,
  };
}
