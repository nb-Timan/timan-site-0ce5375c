import type { ContractPaymentTermId } from '@/lib/contractPaymentTerms';
import { convertCurrency, formatMoney, type Currency } from '@/lib/currency';
import { normalizePartnerAccountType, type PartnerAccountTypeId } from '@/lib/partnerAccountTypes';
import type { ContractPartnerType } from '@/lib/contractPartnerTerms';

export const DEFAULT_STANDARD_MACHINE_DISCOUNT_PCT = 25;
export const DEFAULT_IMPORTER_DISCOUNT_PCT = 30;
export const DEFAULT_SPARE_PARTS_DISCOUNT_PCT = 30;
export const DEFAULT_DEALER_MACHINE_DISCOUNT_PCT = 25;
export const DEFAULT_DEALER_SPARE_PARTS_DISCOUNT_PCT = 25;
export const DEFAULT_IMPORTER_MACHINE_DISCOUNT_PCT = 30;
export const DEFAULT_IMPORTER_EQUIPMENT_DISCOUNT_PCT = 30;
export const DEFAULT_SERVICE_PARTNER_SPARE_PARTS_DISCOUNT_PCT = 25;
export const CONTRACT_DEMO_COMPENSATION_DKK = 3100;
export const CONTRACT_DEMO_COMPENSATION_EUR = 425;

/**
 * Contract compensation is a commercial amount, not a relabelled source value.
 * EUR has its own agreed value; SEK follows the portal's canonical rate model
 * until a separate SEK commercial amount is configured.
 */
export function getContractDemoCompensationAmount(currency: Currency): number {
  if (currency === 'EUR') return CONTRACT_DEMO_COMPENSATION_EUR;
  if (currency === 'SEK') return convertCurrency(CONTRACT_DEMO_COMPENSATION_DKK, 'DKK', 'SEK');
  return CONTRACT_DEMO_COMPENSATION_DKK;
}

export function formatContractDemoCompensation(currency: Currency): string {
  return formatMoney(getContractDemoCompensationAmount(currency), currency);
}

export type ContractCommercialTerms = {
  standardMachineDiscountPct: number;
  importerDiscountPct: number;
  sparePartsDiscountPct: number;
};

export type ContractCommercialTermsInput = Partial<ContractCommercialTerms>;

export type ContractDiscountStructure = {
  machineDiscountPct?: number;
  equipmentDiscountPct?: number;
  sparePartsDiscountPct?: number;
};

type ContractDiscountStructureOptions = {
  /** Existing signed snapshots keep the terms that were accepted at signing. */
  preserveStoredDiscounts?: boolean;
};

function normalizePercentage(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, numeric));
}

export function resolveContractCommercialTerms(input: ContractCommercialTermsInput): ContractCommercialTerms {
  return {
    standardMachineDiscountPct: normalizePercentage(input.standardMachineDiscountPct, DEFAULT_STANDARD_MACHINE_DISCOUNT_PCT),
    importerDiscountPct: normalizePercentage(input.importerDiscountPct, DEFAULT_IMPORTER_DISCOUNT_PCT),
    sparePartsDiscountPct: normalizePercentage(input.sparePartsDiscountPct, DEFAULT_SPARE_PARTS_DISCOUNT_PCT),
  };
}

/**
 * New contract drafts use semantic discount fields. Legacy fields remain a
 * read-only fallback so historical contracts keep their original values.
 */
export function getContractDiscountStructure(
  partnerType: ContractPartnerType | '' | null | undefined,
  input: ContractCommercialTermsInput & {
    machineDiscountPct?: number | null;
    equipmentDiscountPct?: number | null;
  },
  options: ContractDiscountStructureOptions = {},
): ContractDiscountStructure {
  if (partnerType === 'importer') {
    return {
      machineDiscountPct: options.preserveStoredDiscounts
        ? normalizePercentage(input.machineDiscountPct ?? input.importerDiscountPct, DEFAULT_IMPORTER_MACHINE_DISCOUNT_PCT)
        : DEFAULT_IMPORTER_MACHINE_DISCOUNT_PCT,
      equipmentDiscountPct: options.preserveStoredDiscounts
        ? normalizePercentage(input.equipmentDiscountPct ?? input.importerDiscountPct, DEFAULT_IMPORTER_EQUIPMENT_DISCOUNT_PCT)
        : DEFAULT_IMPORTER_EQUIPMENT_DISCOUNT_PCT,
    };
  }
  if (partnerType === 'service_partner') {
    return {
      sparePartsDiscountPct: normalizePercentage(
        input.sparePartsDiscountPct,
        DEFAULT_SERVICE_PARTNER_SPARE_PARTS_DISCOUNT_PCT,
      ),
    };
  }
  return {
    machineDiscountPct: options.preserveStoredDiscounts
      ? normalizePercentage(input.machineDiscountPct ?? input.standardMachineDiscountPct, DEFAULT_DEALER_MACHINE_DISCOUNT_PCT)
      : DEFAULT_DEALER_MACHINE_DISCOUNT_PCT,
    equipmentDiscountPct: options.preserveStoredDiscounts
      ? normalizePercentage(input.equipmentDiscountPct ?? input.sparePartsDiscountPct, DEFAULT_DEALER_SPARE_PARTS_DISCOUNT_PCT)
      : DEFAULT_DEALER_SPARE_PARTS_DISCOUNT_PCT,
  };
}

export function getNewContractDiscountDefaults(
  partnerType: ContractPartnerType | '',
): ContractDiscountStructure {
  return getContractDiscountStructure(partnerType, {});
}

/** Clears fields that do not belong to the newly selected partner type. */
export function getPartnerTypeDiscountFormPatch(partnerType: ContractPartnerType | '') {
  return {
    standardMachineDiscountPct: undefined,
    importerDiscountPct: undefined,
    machineDiscountPct: undefined,
    equipmentDiscountPct: undefined,
    sparePartsDiscountPct: undefined,
    ...getNewContractDiscountDefaults(partnerType),
  };
}

/** Configurator keeps its current canonical payment values while contracts use a compact enum. */
export function contractPaymentTermToConfiguratorValue(value: ContractPaymentTermId | null | undefined): string {
  if (value === 'net_30') return 'Net 30 days';
  if (value === 'cbs') return 'CBS - Cash before shipment';
  return 'Standard NET21';
}

export function resolveConfiguratorContractTerms(input: {
  customer_type?: string | null;
  customer_type_label?: string | null;
  dealer_type?: string | null;
  standard_machine_discount_pct?: number | null;
  importer_discount_pct?: number | null;
  payment_terms?: string | null;
}): { partnerType: PartnerAccountTypeId; baseDiscountPct: number | null; paymentTerms: string | null } {
  // customer_type is the canonical field. Labels are only a legacy fallback.
  const partnerType = normalizePartnerAccountType(input.customer_type)
    ?? normalizePartnerAccountType(input.dealer_type)
    ?? normalizePartnerAccountType(input.customer_type_label)
    ?? 'other_partner';
  const baseDiscountPct = partnerType === 'importer'
    ? input.importer_discount_pct ?? null
    : partnerType === 'dealer'
      ? input.standard_machine_discount_pct ?? null
      : null;
  const paymentTerms = typeof input.payment_terms === 'string' && input.payment_terms.trim()
    ? input.payment_terms.trim()
    : null;
  return { partnerType, baseDiscountPct, paymentTerms };
}
