import type { CalcResult, ConfiguratorState } from '@/types/configurator';
import { buildAccountCaseLines, type AccountCaseLine } from '@/lib/configuratorAccountSummaries';
import { configuratorCurrency, hasFrozenConfiguratorPricing, isConfiguratorNettoSku } from '@/lib/configuratorPricing';
import type { QuoteContentSummary } from '@/lib/quoteContentSummary';
import { getPaymentTermsDocumentValue } from '@/lib/paymentTerms';
import { machinePurchaseReference, orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';
import { hasMachineDeliveryOverride, machineDeliveryDate, resolveDeliveryDestination } from '@/lib/configuratorDelivery';
import { DEMO_FEE_ITEM_NUMBER } from '@/data/machines';
import { TIMAN_COMPANY_PROFILE } from '../../supabase/functions/_shared/timanCompanyProfile';

export interface SubmittedOrderMachineGroup {
  unitNumber: number;
  machineConfigId: string;
  machineType: string;
  title: string;
  purchaseReference: string | null;
  deliveryDate: string | null;
  lines: AccountCaseLine[];
  subtotal: number;
}

function groupSubmittedOrderLines(state: ConfiguratorState, lines: AccountCaseLine[]) {
  const machineGroups: SubmittedOrderMachineGroup[] = [];
  const groupedUnitNumbers = new Set<number>();
  let unitNumber = 0;

  state.machineConfigs.forEach((machine) => {
    for (let unitIndex = 1; unitIndex <= Math.max(0, machine.qty || 0); unitIndex += 1) {
      unitNumber += 1;
      const unitLines = lines.filter(line => line.unitNumber === unitNumber);
      if (unitLines.length === 0) continue;
      groupedUnitNumbers.add(unitNumber);
      machineGroups.push({
        unitNumber,
        machineConfigId: machine.id,
        machineType: machine.type,
        title: unitLines[0]?.description || machine.type,
        purchaseReference: machinePurchaseReference(state, unitNumber),
        deliveryDate: machineDeliveryDate(state, unitNumber) || null,
        lines: unitLines,
        subtotal: unitLines.reduce((sum, line) => sum + line.total, 0),
      });
    }
  });

  const ungroupedLines = lines.filter(line => !line.unitNumber || !groupedUnitNumbers.has(line.unitNumber));
  return { machineGroups, ungroupedLines };
}

/** A historical sales document must never silently substitute today's prices. */
export function buildReadOnlySalesDocument(state: ConfiguratorState) {
  if (!hasFrozenConfiguratorPricing(state)) {
    throw new Error('Dokumentet mangler et gyldigt historisk pris-snapshot. Backend skal gennemgå dokumentet før en ny bekræftelse.');
  }
  const lines = buildAccountCaseLines(state, state.language);
  const { machineGroups, ungroupedLines } = groupSubmittedOrderLines(state, lines);
  const totals = state.pricingSnapshot!.totals!;
  const isNetto = (itemNo: string) => state.pricingSnapshot?.nettoPricingVersion === 1 && isConfiguratorNettoSku(itemNo);
  const nettoTotal = lines.filter(line => isNetto(line.itemNo)).reduce((total, line) => total + line.total, 0);
  const sum = lines.reduce((total, line) => total + line.total, 0);
  if (![sum, totals.subtotal, totals.totalDiscount, totals.finalPrice].every(Number.isFinite)
    || Math.abs(sum - totals.subtotal) > 0.02
    || Math.abs(totals.subtotal - totals.totalDiscount - totals.finalPrice) > 0.02) {
    throw new Error('Dokumentlinjer og historiske totaler stemmer ikke overens. Bekræftelsen kan ikke genereres.');
  }
  const calcResult: CalcResult = {
    lineItems: lines.map(line => ({
      ...(isNetto(line.itemNo) ? { isNetto: true } : {}),
      campaign: state.pricingSnapshot?.campaignLines?.find(campaign => campaign.itemNumber === line.itemNo && campaign.unitNumber === line.unitNumber),
      txt: line.description,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      varenr: line.itemNo, price: line.total,
    })),
    subtotal: totals.subtotal,
    ...(nettoTotal ? { nettoTotal } : {}),
    totalDiscount: totals.totalDiscount,
    currentPrice: totals.finalPrice,
    totalPct: totals.subtotal - nettoTotal ? totals.totalDiscount / (totals.subtotal - nettoTotal) * 100 : 0,
    qtyPct: 0,
    discountDetails: state.pricingSnapshot?.discountDetails ?? [{ txt: 'Rabat', amount: totals.totalDiscount }],
    deliveryDiscounts: state.pricingSnapshot?.deliveryDiscounts,
    campaignLines: state.pricingSnapshot?.campaignLines,
  };
  return { issuer: { ...TIMAN_COMPANY_PROFILE }, lines, machineGroups, ungroupedLines, totals, calcResult };
}

/** Backwards-compatible order entry point used by mail/PDF and existing callers. */
export const buildSubmittedOrderDocument = buildReadOnlySalesDocument;

/** Keep the existing webhook shape, but resolve every commercial line from the document. */
export function buildSubmittedOrderMailSummary(state: ConfiguratorState): QuoteContentSummary {
  const { lines, totals } = buildSubmittedOrderDocument(state);
  const destination = resolveDeliveryDestination(state);
  let unitNumber = 0;
  const machines = state.machineConfigs.map(machine => {
    const units = Array.from({ length: machine.qty }, (_, index) => {
      unitNumber += 1;
      const unitLines = lines.filter(line => line.unitNumber === unitNumber);
      const [base, ...accessories] = unitLines;
      if (!base) throw new Error('Ordrebekræftelsen mangler historiske maskinlinjer.');
      return {
        base,
        unit_number: unitNumber,
        config_key: machine.configMode === 'shared' ? machine.id : `${machine.id}_${index + 1}`,
        is_demo: accessories.some(line => line.itemNo === DEMO_FEE_ITEM_NUMBER || line.itemNo === 'DEMO'),
        req_number: machinePurchaseReference(state, unitNumber),
        delivery_date: machineDeliveryDate(state, unitNumber) || null,
        delivery_date_overridden: hasMachineDeliveryOverride(state, unitNumber),
        delivery_address: resolveDeliveryDestination(state, unitNumber),
        accessories: accessories.map(line => ({
          id: line.itemNo, varenr: line.itemNo, name: line.description,
          qty: line.quantity, unit_price: line.unitPrice, total: line.total,
          ...(state.pricingSnapshot?.nettoPricingVersion === 1 && isConfiguratorNettoSku(line.itemNo) ? { is_netto: true } : {}),
        })),
        unit_total: unitLines.reduce((sum, line) => sum + line.total, 0),
      };
    });
    return {
      model_id: machine.id, model_type: machine.type,
      model_name: units[0]?.base.description ?? machine.type,
      varenr: units[0]?.base.itemNo ?? '', qty: machine.qty,
      config_mode: machine.configMode, unit_price: units[0]?.base.unitPrice ?? 0,
      units: units.map(({ base: _base, ...unit }) => unit),
      group_total: units.reduce((sum, unit) => sum + unit.unit_total, 0),
    };
  });
  return {
    issuer: { ...TIMAN_COMPANY_PROFILE },
    language: state.language, currency: configuratorCurrency(state), flow_type: 'order',
    payment_terms: getPaymentTermsDocumentValue(state.paymentTerms),
    purchase_order_number: orderPurchaseReferenceSummary(state).headerValue,
    customer: {
      company: state.firmanavn || '', contact_person: state.kontaktperson || '', phone: state.telefon || '',
      address: state.address || '', postal_code: state.postalCode || '', city: state.city || '', country: state.country || '',
    },
    delivery: {
      method: state.deliveryMethod || '', date: state.date || null, startup_option: state.deliveryDeliverStartup ?? null,
      address_source: destination.source, address: destination.address, postal_code: destination.postalCode,
      city: destination.city, country: destination.country, contact_person: destination.contactPerson,
      phone: destination.phone, note: destination.note,
    },
    machines, totals: { subtotal: totals.subtotal },
  };
}
