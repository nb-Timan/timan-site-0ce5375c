/**
 * Build a structured, language-aware summary of a configurator state suitable
 * for sending to n8n / quote+order email templates.
 *
 * The webhook receives both the rendered PDF AND this structured payload, so
 * the email body can render machine + accessory specifications even if the
 * PDF parsing pipeline fails.
 *
 * Single source of truth: the saved configurator state (state_json on the
 * configurations row). Both quote and order webhooks use this same builder so
 * "Min konto", PDF and email never disagree.
 */

import { ConfiguratorState, Language } from '@/types/configurator';
import {
  PRODUCTS,
  getAccessoriesFlat,
  getLocalizedName,
  getPriceForCurrency,
  LOOSE_TOOL_KEY,
} from '@/data/machines';
import { configuratorCurrency, hasFrozenConfiguratorPricing, isConfiguratorNettoSku, snapshotAccessoryPrice, snapshotMachinePrice, snapshotProductName } from '@/lib/configuratorPricing';
import { getPaymentTermsDocumentValue } from '@/lib/paymentTerms';
import { orderPurchaseReferenceSummary } from '@/lib/orderPurchaseReferences';
import { hasMachineDeliveryOverride, machineDeliveryDate, lineDeliveryDates, resolveDeliveryDestination, type ConfiguratorDeliveryDestination } from '@/lib/configuratorDelivery';
import {
  TIMAN_COMPANY_PROFILE,
  type TimanCompanyProfile,
} from '../../supabase/functions/_shared/timanCompanyProfile';

export interface SummaryAccessoryLine {
  id: string;
  varenr: string;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  is_ral_color?: boolean;
  ral_code?: string;
  is_netto?: boolean;
  delivery_dates?: string[];
}

export interface SummaryMachineUnit {
  unit_number: number;
  config_key: string;
  is_demo: boolean;
  req_number: string | null;
  delivery_date: string | null;
  delivery_date_overridden: boolean;
  delivery_address: ConfiguratorDeliveryDestination;
  accessories: SummaryAccessoryLine[];
  unit_total: number;
}

export interface SummaryMachineGroup {
  model_id: string;
  model_type: string;
  model_name: string;
  varenr: string;
  qty: number;
  config_mode: 'shared' | 'individual';
  unit_price: number;
  units: SummaryMachineUnit[];
  group_total: number;
}

export interface QuoteContentSummary {
  issuer: TimanCompanyProfile;
  language: Language;
  currency: 'DKK' | 'EUR' | 'SEK';
  flow_type: 'quote' | 'order';
  payment_terms: string;
  /** Customer reference from the persisted Configurator state. */
  purchase_order_number: string | null;
  customer: {
    company: string;
    contact_person: string;
    phone: string;
    address: string;
    postal_code: string;
    city: string;
    country: string;
  };
  delivery: {
    method: string;
    date: string | null;
    startup_option: string | null;
    address_source: 'customer' | 'alternative' | 'dealer';
    address: string;
    postal_code: string;
    city: string;
    country: string;
    contact_person: string;
    phone: string;
    note: string;
  };
  machines: SummaryMachineGroup[];
  totals: {
    subtotal: number;
  };
}

function getRalCodeFor(state: ConfiguratorState, configKey: string, accId: string): string | undefined {
  const direct = state.ralCodes?.[`${configKey}_${accId}`];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  // Fallback: legacy keying
  const legacy = state.ralCodes?.[accId];
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  return undefined;
}

export function buildQuoteContentSummary(state: ConfiguratorState): QuoteContentSummary {
  const lang = state.language;
  const currency = configuratorCurrency(state);
  const destination = resolveDeliveryDestination(state);

  const machines: SummaryMachineGroup[] = [];
  let subtotal = 0;
  let runningUnitNumber = 0;

  for (const mc of state.machineConfigs ?? []) {
    const product = PRODUCTS[mc.type];
    if (!product) continue;

    const isShared = mc.configMode === 'shared';
    const modelName = snapshotProductName(state, product.varenr, getLocalizedName(product.name, lang));
    const unitPrice = snapshotMachinePrice(state, mc.type, getPriceForCurrency(product, currency));
    const flatAccs = getAccessoriesFlat(mc.type);

    const units: SummaryMachineUnit[] = [];
    let groupTotal = 0;

    for (let i = 1; i <= mc.qty; i++) {
      runningUnitNumber += 1;
      const configKey = isShared ? mc.id : `${mc.id}_${i}`;
      const accIds: string[] = isShared
        ? mc.acc ?? []
        : state.individualUnitConfigs?.[configKey]?.acc ?? [];

      const selectedAccs = flatAccs.filter(
        a => accIds.includes(a.id) && !a.isHeader,
      );

      // Quantity-only inputs whose parent is selected count too
      const qtyOnlyAccs = flatAccs.filter(a => {
        if (!a.isQtyInput || a.isHeader) return false;
        if (accIds.includes(a.id)) return false;
        if (a.requires && !accIds.includes(a.requires)) return false;
        const q = state.accQty?.[`${configKey}_${a.id}`] || 0;
        return q > 0;
      });

      const accessoryLines: SummaryAccessoryLine[] = [...selectedAccs, ...qtyOnlyAccs].map(a => {
        const qty = state.accQty?.[`${configKey}_${a.id}`] || 1;
        const accUnitPrice = snapshotAccessoryPrice(state, mc.type, a, getPriceForCurrency(a, currency));
        const total = accUnitPrice * qty;
        const ral = a.isRAL ? getRalCodeFor(state, configKey, a.id) : undefined;
        return {
          id: a.id,
          varenr: a.varenr,
          name: snapshotProductName(state, a.varenr, getLocalizedName(a.name, lang)),
          qty,
          unit_price: accUnitPrice,
          total,
          delivery_dates: lineDeliveryDates(state, runningUnitNumber, a.varenr),
          ...((!hasFrozenConfiguratorPricing(state) || state.pricingSnapshot?.nettoPricingVersion === 1) && isConfiguratorNettoSku(a.varenr) ? { is_netto: true } : {}),
          is_ral_color: a.isRAL || undefined,
          ral_code: ral,
        };
      });

      const accessoriesTotal = accessoryLines.reduce((sum, l) => sum + l.total, 0);
      const unitTotal = (mc.type === LOOSE_TOOL_KEY ? 0 : unitPrice) + accessoriesTotal;
      groupTotal += unitTotal;

      const reqKey = `machine_${runningUnitNumber}`;
      const reqNumber = state.reqNumbers?.[reqKey] ?? null;
      const demoKey = `${product.varenr}_${runningUnitNumber}`;

      units.push({
        unit_number: runningUnitNumber,
        config_key: configKey,
        is_demo: !!state.demoMachines?.[demoKey],
        req_number: reqNumber && reqNumber.trim() ? reqNumber : null,
        delivery_date: machineDeliveryDate(state, runningUnitNumber) || null,
        delivery_date_overridden: hasMachineDeliveryOverride(state, runningUnitNumber),
        delivery_address: resolveDeliveryDestination(state, runningUnitNumber),
        accessories: accessoryLines,
        unit_total: unitTotal,
      });
    }

    machines.push({
      model_id: mc.id,
      model_type: mc.type,
      model_name: modelName,
      varenr: product.varenr,
      qty: mc.qty,
      config_mode: isShared ? 'shared' : 'individual',
      unit_price: mc.type === LOOSE_TOOL_KEY ? 0 : unitPrice,
      units,
      group_total: groupTotal,
    });

    subtotal += groupTotal;
  }

  return {
    issuer: { ...TIMAN_COMPANY_PROFILE },
    language: lang,
    currency,
    flow_type: state.flowType === 'order' ? 'order' : 'quote',
    payment_terms: getPaymentTermsDocumentValue(state.paymentTerms),
    // The order-level label is derived from the frozen machine references.
    // Legacy snapshots without them retain their original global fallback.
    purchase_order_number: orderPurchaseReferenceSummary(state).headerValue,
    customer: {
      company: state.firmanavn || '',
      contact_person: state.kontaktperson || '',
      phone: state.telefon || '',
      address: state.address || '',
      postal_code: state.postalCode || '',
      city: state.city || '',
      country: state.country || '',
    },
    delivery: {
      method: state.deliveryMethod || '',
      date: state.date || null,
      startup_option: state.deliveryDeliverStartup ?? null,
      address_source: destination.source,
      address: destination.address,
      postal_code: destination.postalCode,
      city: destination.city,
      country: destination.country,
      contact_person: destination.contactPerson,
      phone: destination.phone,
      note: destination.note,
    },
    machines,
    totals: {
      subtotal,
    },
  };
}
