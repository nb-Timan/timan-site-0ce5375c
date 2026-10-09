import {
  normalizePartnerAccountType,
  resolvePartnerAccountType,
  type PartnerAccountTypeId,
} from '@/lib/partnerAccountTypes';

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
 * Basisrabatten er fælles input til normal-, kampagne- og dokumentpriser.
 * De øvrige rabatlag styres af den kanoniske prioritet i calcConfiguration.
 */

export const DEFAULT_BASE_DISCOUNT_PCT = 0.25;
export const IMPORTER_BASE_DISCOUNT_PCT = 0.30;
export const IMPORTER_DEMO_DISCOUNT_PCT = 32.5;

export type ConfiguratorPartnerAccountType = Extract<
  PartnerAccountTypeId,
  'dealer' | 'importer' | 'service_partner'
>;

export const CONFIGURATOR_PARTNER_ACCOUNT_TYPES: readonly ConfiguratorPartnerAccountType[] = [
  'dealer',
  'importer',
  'service_partner',
];

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
  return resolveAppUserPartnerAccountType(user) === 'importer';
}

export function isConfiguratorPartnerAccountType(value: unknown): value is ConfiguratorPartnerAccountType {
  return typeof value === 'string'
    && (CONFIGURATOR_PARTNER_ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function toConfiguratorPartnerAccountType(
  value: PartnerAccountTypeId | string | null | undefined,
): ConfiguratorPartnerAccountType | null {
  const normalized = normalizePartnerAccountType(value);
  return isConfiguratorPartnerAccountType(normalized) ? normalized : null;
}

export function resolveAppUserPartnerAccountType(user: MaybeUser): ConfiguratorPartnerAccountType | null {
  if (!user) return null;
  const role = (user.portal_role || '').trim().toLowerCase();
  if (role === 'timan_importer') return 'importer';
  if (role === 'timan_service_partner') return 'service_partner';
  if (role === 'timan_dealer' || role === 'dealer_user') return 'dealer';
  return toConfiguratorPartnerAccountType(user.partner_type);
}

export function isImporterDealerAccount(dealer: MaybeDealer): boolean {
  return resolveDealerPartnerAccountType(dealer) === 'importer';
}

export function resolveDealerPartnerAccountType(dealer: MaybeDealer): ConfiguratorPartnerAccountType | null {
  if (!dealer) return null;
  return toConfiguratorPartnerAccountType(resolvePartnerAccountType(dealer));
}

/** The selected commercial account wins; the effective user is only a fallback. */
export function resolveConfiguratorPartnerAccountType(input: {
  appUser?: MaybeUser;
  dealer?: MaybeDealer;
  persisted?: unknown;
}): ConfiguratorPartnerAccountType {
  return resolveDealerPartnerAccountType(input.dealer)
    ?? resolveAppUserPartnerAccountType(input.appUser)
    ?? (isConfiguratorPartnerAccountType(input.persisted) ? input.persisted : null)
    ?? 'dealer';
}

export function canonicalBaseDiscountPct(
  partnerType: ConfiguratorPartnerAccountType,
  configuredDiscountPct?: number | null,
): number {
  if (partnerType === 'importer') return IMPORTER_BASE_DISCOUNT_PCT;
  if (typeof configuredDiscountPct !== 'number' || configuredDiscountPct < 0) {
    return DEFAULT_BASE_DISCOUNT_PCT;
  }
  if (configuredDiscountPct <= 1) return configuredDiscountPct;
  if (configuredDiscountPct <= 100) return configuredDiscountPct / 100;
  return DEFAULT_BASE_DISCOUNT_PCT;
}

export function resolveBaseDiscountPct(input: {
  appUser?: MaybeUser;
  dealer?: MaybeDealer;
}): number {
  return canonicalBaseDiscountPct(resolveConfiguratorPartnerAccountType(input));
}
