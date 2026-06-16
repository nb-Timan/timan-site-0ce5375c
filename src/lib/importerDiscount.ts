/**
 * Importør-rabat (Phase 63)
 *
 * Standardrabatten i konfiguratorens prisberegning er 25 % for normale
 * forhandlere. Importør-konti (portal_role='timan_importer' eller
 * partner_type='importoer' på app_users, eller customer_type='Importør'
 * på dealer_accounts) skal automatisk få 30 % som basis-rabat.
 *
 * Funktionerne her er pure helpers — de tager hverken state eller hooks ind
 * og kan derfor bruges fra både UI (ConfiguratorPage), hooks (useConfigurator)
 * og rene calc-funktioner (calcConfiguration).
 *
 * Logik:
 *   resolveBaseDiscountPct({ appUser, dealer }) → 0.30 hvis enten den
 *     aktive bruger eller den valgte forhandler er importør, ellers 0.25.
 *
 * Ekstra forhandlerrabat (manualDealerDiscountPct), demo-rabat (32,5 %),
 * antalsrabat og leveringsrabat påvirkes ikke — de oven på basis-rabatten
 * præcis som før.
 */

export const DEFAULT_BASE_DISCOUNT_PCT = 0.25;
export const IMPORTER_BASE_DISCOUNT_PCT = 0.30;

type MaybeUser = {
  portal_role?: string | null;
  partner_type?: string | null;
} | null | undefined;

type MaybeDealer = {
  customer_type?: string | null;
  customer_type_label?: string | null;
  dealer_type?: string | null;
} | null | undefined;

export function isImporterAppUser(user: MaybeUser): boolean {
  if (!user) return false;
  const role = (user.portal_role || '').toLowerCase();
  if (role === 'timan_importer') return true;
  const partner = (user.partner_type || '').toLowerCase();
  if (partner === 'importoer' || partner === 'importer' || partner === 'importør') return true;
  return false;
}

function looksLikeImporter(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v.includes('import'); // matches "importer", "importør", "importoer"
}

export function isImporterDealerAccount(dealer: MaybeDealer): boolean {
  if (!dealer) return false;
  return (
    looksLikeImporter(dealer.customer_type) ||
    looksLikeImporter(dealer.customer_type_label) ||
    looksLikeImporter(dealer.dealer_type)
  );
}

export function resolveBaseDiscountPct(input: {
  appUser?: MaybeUser;
  dealer?: MaybeDealer;
}): number {
  if (isImporterAppUser(input.appUser) || isImporterDealerAccount(input.dealer)) {
    return IMPORTER_BASE_DISCOUNT_PCT;
  }
  return DEFAULT_BASE_DISCOUNT_PCT;
}
