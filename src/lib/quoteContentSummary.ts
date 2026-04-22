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
  getPrice,
  LOOSE_TOOL_KEY,
} from '@/data/machines';

export interface SummaryAccessoryLine {
  id: string;
  varenr: string;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
  is_ral_color?: boolean;
  ral_code?: string;
}

export interface SummaryMachineUnit {
  unit_number: number;
  config_key: string;
  is_demo: boolean;
  req_number: string | null;
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
  language: Language;
  currency: 'DKK' | 'EUR';
  flow_type: 'quote' | 'order';
  delivery: {
    method: string;
    date: string | null;
    startup_option: string | null;
  };
  machines: SummaryMachineGroup[];
  totals: {
    subtotal: number;
  };
}

function isEurLanguage(lang: Language): boolean {
  return lang === 'en' || lang === 'de' || lang === 'it' || lang === 'hu';
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
  const currency: 'DKK' | 'EUR' = isEurLanguage(lang) ? 'EUR' : 'DKK';

  const machines: SummaryMachineGroup[] = [];
  let subtotal = 0;
  let runningUnitNumber = 0;

  for (const mc of state.machineConfigs ?? []) {
    const product = PRODUCTS[mc.type];
    if (!product) continue;

    const isShared = mc.configMode === 'shared';
    const modelName = getLocalizedName(product.name, lang);
    const unitPrice = getPrice(product, lang);
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
        const accUnitPrice = getPrice(a, lang);
        const total = accUnitPrice * qty;
        const ral = a.isRAL ? getRalCodeFor(state, configKey, a.id) : undefined;
        return {
          id: a.id,
          varenr: a.varenr,
          name: getLocalizedName(a.name, lang),
          qty,
          unit_price: accUnitPrice,
          total,
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
    language: lang,
    currency,
    flow_type: state.flowType === 'order' ? 'order' : 'quote',
    delivery: {
      method: state.deliveryMethod || '',
      date: state.date || null,
      startup_option: state.deliveryDeliverStartup ?? null,
    },
    machines,
    totals: {
      subtotal,
    },
  };
}
