import type { CalcResult, ConfiguratorState } from '@/types/configurator';
import { buildAccountCaseLines } from '@/lib/configuratorAccountSummaries';
import { hasFrozenConfiguratorPricing } from '@/lib/configuratorPricing';
import type { QuoteContentSummary } from '@/lib/quoteContentSummary';
import { resolvePaymentTerms } from '@/lib/paymentTerms';
import { machinePurchaseReference, orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';

/** A historical document must never silently substitute today's prices. */
export function buildSubmittedOrderDocument(state: ConfiguratorState) {
  if (!hasFrozenConfiguratorPricing(state)) {
    throw new Error('Ordren mangler et gyldigt historisk pris-snapshot. Backend skal gennemgå ordren før en ny ordrebekræftelse.');
  }
  const lines = buildAccountCaseLines(state, state.language);
  const totals = state.pricingSnapshot!.totals!;
  const sum = lines.reduce((total, line) => total + line.total, 0);
  if (![sum, totals.subtotal, totals.totalDiscount, totals.finalPrice].every(Number.isFinite)
    || Math.abs(sum - totals.subtotal) > 0.02
    || Math.abs(totals.subtotal - totals.totalDiscount - totals.finalPrice) > 0.02) {
    throw new Error('Ordrelinjer og historiske totaler stemmer ikke overens. Ordrebekræftelsen kan ikke genereres.');
  }
  const calcResult: CalcResult = {
    lineItems: lines.map(line => ({
      txt: `${line.description}${line.quantity > 1 ? ` x${line.quantity}` : ''}${line.purchaseReferences?.length ? ` · REK./PO: ${line.purchaseReferences.join(', ')}` : ''}`,
      varenr: line.itemNo, price: line.total,
    })),
    subtotal: totals.subtotal,
    totalDiscount: totals.totalDiscount,
    currentPrice: totals.finalPrice,
    totalPct: totals.subtotal ? totals.totalDiscount / totals.subtotal * 100 : 0,
    qtyPct: 0,
    discountDetails: [{ txt: 'Rabat', amount: totals.totalDiscount }],
  };
  return { lines, totals, calcResult };
}

/** Keep the existing webhook shape, but resolve every commercial line from the document. */
export function buildSubmittedOrderMailSummary(state: ConfiguratorState): QuoteContentSummary {
  const { lines, totals } = buildSubmittedOrderDocument(state);
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
        is_demo: accessories.some(line => line.itemNo === 'DEMO'),
        req_number: machinePurchaseReference(state, unitNumber),
        accessories: accessories.map(line => ({
          id: line.itemNo, varenr: line.itemNo, name: line.description,
          qty: line.quantity, unit_price: line.unitPrice, total: line.total,
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
    language: state.language, currency: state.language === 'da' ? 'DKK' : 'EUR', flow_type: 'order',
    payment_terms: resolvePaymentTerms(state.paymentTerms),
    purchase_order_number: orderPurchaseReferenceSummary(state).headerValue,
    delivery: { method: state.deliveryMethod || '', date: state.date || null, startup_option: state.deliveryDeliverStartup ?? null },
    machines, totals: { subtotal: totals.subtotal },
  };
}
