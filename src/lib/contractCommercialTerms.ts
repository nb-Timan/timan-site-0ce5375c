import type { ContractPaymentTermId } from '@/lib/contractPaymentTerms';
import { normalizePartnerAccountType, type PartnerAccountTypeId } from '@/lib/partnerAccountTypes';

export const DEFAULT_STANDARD_MACHINE_DISCOUNT_PCT = 25;
export const DEFAULT_IMPORTER_DISCOUNT_PCT = 30;
export const DEFAULT_SPARE_PARTS_DISCOUNT_PCT = 30;

export type ContractCommercialTerms = {
  standardMachineDiscountPct: number;
  importerDiscountPct: number;
  sparePartsDiscountPct: number;
};

export type ContractCommercialTermsInput = Partial<ContractCommercialTerms>;

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
