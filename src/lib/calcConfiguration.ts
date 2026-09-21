import type { CalcResult, ConfiguratorState, DiscountDetail, LineItem } from '@/types/configurator';
import { PRODUCTS, getAccessoriesFlat, getLocalizedName, getPrice } from '@/data/machines';
import { t } from '@/data/translations';
import { hasFrozenConfiguratorPricing, snapshotAccessoryPrice, snapshotDemoFee, snapshotMachinePrice, snapshotStartupPrice } from '@/lib/configuratorPricing';
import { shouldIncludeQuantityAccessory } from '@/lib/looseToolDependencies';
import { isCampaignActive, publishedCampaignDefinitions, type CampaignLineSnapshot } from '@/lib/configuratorCampaigns';

export const roundPricingMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type PricingOptions = { grossManualDiscountOnly?: boolean; now?: number };
type EconomicLine = { gross: number; net: number; quantity: number; unit: number; demo: boolean; quantityEligible: boolean; productKey: string; item: LineItem; campaignApplied: boolean };

/** One commercial calculation for the live cart, persistence and document totals. */
export function calculateConfiguration(state: ConfiguratorState, options: PricingOptions = {}): CalcResult {
  if (state.pricingSnapshot?.totalsOnly) throw new Error('Historiske linjepriser mangler. Brug det afsendte dokument; priser genberegnes ikke automatisk.');
  const now = options.now ?? Date.now();
  const T = (key: string) => t(key, state.language);
  const lineItems: LineItem[] = [];
  const lines: EconomicLine[] = [];
  const details: DiscountDetail[] = [];
  let eligibleUnits = 0;
  let unit = 0;
  const add = (item: LineItem, quantity: number, demo: boolean, quantityEligible: boolean, productKey = '') => {
    item.price = roundPricingMoney(item.price);
    lineItems.push(item);
    lines.push({ gross: item.price, net: item.price, quantity, unit, demo, quantityEligible, productKey, item, campaignApplied: false });
  };

  for (const machine of state.machineConfigs ?? []) {
    const product = PRODUCTS[machine.type];
    if (!product) continue;
    for (let index = 1; index <= machine.qty; index++) {
      unit++;
      const key = machine.configMode === 'shared' ? machine.id : `${machine.id}_${index}`;
      const selected = machine.configMode === 'shared' ? machine.acc ?? [] : state.individualUnitConfigs?.[key]?.acc ?? [];
      const demo = Boolean(state.demoMachines?.[`${product.varenr}_${unit}`]);
      const eligible = !demo && product.isDiscountEligible === true;
      if (eligible) eligibleUnits++;
      add({ txt: `${T('machineLabel')} ${unit} (${getLocalizedName(product.name, state.language)})`, price: snapshotMachinePrice(state, machine.type, getPrice(product, state.language)), varenr: product.varenr, bold: true, isMachine: true, index: unit }, 1, demo, eligible, `${machine.type}::${product.id}`);
      for (const accessory of getAccessoriesFlat(machine.type)) {
        if (accessory.isHeader) continue;
        const quantity = state.accQty?.[`${key}_${accessory.id}`] || 1;
        if (!selected.includes(accessory.id) && !shouldIncludeQuantityAccessory(machine.type, accessory, selected, state.accQty?.[`${key}_${accessory.id}`] || 0)) continue;
        add({ txt: `- ${getLocalizedName(accessory.name, state.language)}${quantity > 1 ? ` x${quantity}` : ''}`, price: snapshotAccessoryPrice(state, machine.type, accessory, getPrice(accessory, state.language)) * quantity, varenr: accessory.varenr, sub: true, isAutoAdded: !!accessory.hidden }, quantity, demo, eligible, `${machine.type}::${accessory.id}`);
      }
      if (demo) add({ txt: `- ${T('demoMachineLabel')}`, price: snapshotDemoFee(state, state.language), varenr: 'DEMO', sub: true }, 1, true, false);
      lineItems.push({ txt: `${T('subtotalMachine')} ${unit}:`, price: roundPricingMoney(lines.filter(line => line.unit === unit).reduce((sum, line) => sum + line.gross, 0)), varenr: 'SUBTOTAL', subtotal: true, index: unit });
    }
  }
  if (unit && state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const option = state.deliveryDeliverStartup;
    const fallback = option === 'no_bridge' ? (state.language === 'da' ? 1500 : 200) : option === 'with_bridge' ? (state.language === 'da' ? 2500 : 335) : 0;
    add({ txt: `- ${T(option === 'no_bridge' ? 'startupNoBridgeCalc' : option === 'with_bridge' ? 'startupWithBridgeCalc' : 'startupOtherCalc')}`, price: snapshotStartupPrice(state, state.language, option, fallback), varenr: '795050', sub: true }, 1, false, false);
  }
  const subtotal = roundPricingMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  const apply = (kind: DiscountDetail['kind'], percent: number, eligible: (line: EconomicLine) => boolean, label: string, varenr?: string) => {
    if (!(percent > 0)) return;
    const affected = lines.filter(eligible);
    const basis = roundPricingMoney(affected.reduce((sum, line) => sum + line.net, 0));
    // Allocate rounded aggregate discount deterministically, conserving every cent.
    const amount = roundPricingMoney(basis * Math.min(100, percent) / 100);
    let allocated = 0;
    let cumulative = 0;
    for (const line of affected) {
      cumulative += line.net;
      const next = basis ? roundPricingMoney(amount * cumulative / basis) : 0;
      line.net = roundPricingMoney(line.net - (next - allocated));
      allocated = next;
    }
    if (amount > 0) details.push({ kind, percent, basis, txt: `${label.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/, '')} (${percent.toLocaleString(state.language, { maximumFractionDigits: 2 })}%)`, amount, varenr });
  };
  const quantityPct = eligibleUnits >= 4 ? 4 : eligibleUnits >= 2 ? 2 : 0;
  if (!options.grossManualDiscountOnly) {
    apply('demo', 32.5, line => line.demo, T('demoDiscount'));
    apply('base', (state.baseDiscountPct ?? 0.25) * 100, line => !line.demo, T('baseDiscountLabel'));
    const threshold = new Date(now);
    threshold.setMonth(threshold.getMonth() + 3);
    if (state.date && new Date(state.date) > threshold) apply('delivery', 2, line => !line.demo, T('deliveryDiscountLabel'), '795045');
    apply('quantity', quantityPct, line => line.quantityEligible, T('qtyDiscountLabel'), '795043');
  }
  apply('dealer', Math.min(100, Math.max(0, state.manualDealerDiscountPct || 0)), () => true, T('extraDealerDiscountLabel'), '795042');

  const campaignLines: CampaignLineSnapshot[] = [];
  // Old snapshots contain no economic campaign baseline: never retrofit one.
  if (!options.grossManualDiscountOnly && (!state.pricingSnapshot || state.pricingSnapshot.discountEngineVersion === 2)) {
    for (const campaign of publishedCampaignDefinitions()) {
      if (!isCampaignActive(campaign, now) || campaign.type === 'badge') continue;
      const triggerLinks = campaign.products.filter(product => product.role === 'trigger');
      const benefitLinks = campaign.products.filter(product => product.role === 'benefit' || (campaign.type !== 'conditional' && product.role === 'linked'));
      const triggerQuantity = triggerLinks.reduce((sum, product) => sum + lines.filter(line => line.productKey === product.productKey).reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
      if (campaign.type === 'conditional' && triggerQuantity < campaign.triggerMinQuantity) continue;
      const scale = campaign.type === 'conditional' && campaign.scaleBenefitWithTrigger
        ? Math.floor(triggerQuantity / campaign.triggerMinQuantity) : 1;
      const remainingBenefitQuantity = new Map(benefitLinks.map(product => [
        product.productKey,
        campaign.type === 'conditional' ? campaign.benefitQuantity * scale : Number.POSITIVE_INFINITY,
      ]));
      for (const line of lines) {
        if (line.campaignApplied) continue;
        const benefit = benefitLinks.find(product => product.productKey === line.productKey);
        if (!benefit) continue;
        const remaining = remainingBenefitQuantity.get(benefit.productKey) ?? 0;
        if (remaining <= 0) continue;
        const eligibleQuantity = Math.min(line.quantity, remaining);
        if (!(eligibleQuantity > 0)) continue;
        const pricingType = (campaign.type === 'conditional' ? campaign.benefitPricingType : campaign.type) as 'percentage' | 'fixed';
        const currency = state.language === 'da' ? 'DKK' : 'EUR';
        const configuredPct = benefit.discountPct ?? campaign.discountPct;
        const target = pricingType === 'fixed'
          ? currency === 'DKK' ? benefit.targetPriceDkk ?? campaign.targetPriceDkk : benefit.targetPriceEur ?? campaign.targetPriceEur
          : null;
        const lineBefore = line.net;
        const eligibleBasis = roundPricingMoney(lineBefore * eligibleQuantity / line.quantity);
        const amount = roundPricingMoney(pricingType === 'percentage'
          ? eligibleBasis * (configuredPct ?? 0) / 100
          : Math.max(0, eligibleBasis - roundPricingMoney((target ?? 0) * eligibleQuantity)));
        line.net = roundPricingMoney(lineBefore - amount);
        const percent = eligibleBasis > 0 ? amount / eligibleBasis * 100 : 0;
        const snapshot: CampaignLineSnapshot = {
          campaignId: campaign.id, campaignCode: campaign.code, campaignName: campaign.name,
          campaignType: campaign.type, pricingType, applied: amount > 0,
          triggerItemNumbers: triggerLinks.map(product => product.itemNumber), benefitItemNumber: benefit.itemNumber,
          configuredPct: pricingType === 'percentage' ? configuredPct : null,
          discountPct: pricingType === 'percentage' ? configuredPct ?? 0 : percent,
          discountAmount: amount, targetPrice: target, currency, productKey: line.productKey,
          itemNumber: line.item.varenr, unitNumber: line.unit, quantity: eligibleQuantity,
          startsAt: campaign.startsAt, endsAt: campaign.endsAt,
          grossLineValue: line.gross, preCampaignNet: lineBefore, finalLineValue: line.net,
        };
        campaignLines.push(snapshot);
        line.item.campaign = snapshot;
        if (amount > 0) {
          line.campaignApplied = true;
          details.push({ kind: 'campaign', campaignId: campaign.id, varenr: line.item.varenr, percent: snapshot.discountPct, basis: eligibleBasis, amount,
            txt: `${T('campaignDiscountLabel')} · ${campaign.code} · ${line.item.varenr} (${snapshot.discountPct.toLocaleString(state.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)` });
        }
        remainingBenefitQuantity.set(benefit.productKey, remaining - eligibleQuantity);
      }
    }
  }
  const currentPrice = roundPricingMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const totalDiscount = roundPricingMoney(subtotal - currentPrice);
  return { lineItems, subtotal, discountDetails: details, totalDiscount, currentPrice, totalPct: subtotal ? totalDiscount / subtotal * 100 : 0, qtyPct: quantityPct / 100, campaignLines };
}

export function calcConfigurationTotals(state: ConfiguratorState, options: PricingOptions = {}): { subtotal: number; totalDiscount: number; finalPrice: number } {
  if (!options.grossManualDiscountOnly && hasFrozenConfiguratorPricing(state) && state.pricingSnapshot?.totals) return state.pricingSnapshot.totals;
  const result = calculateConfiguration(state, options);
  return { subtotal: result.subtotal, totalDiscount: result.totalDiscount, finalPrice: result.currentPrice };
}

export function formatMoney(amount: number, language: string): string {
  const currency = language === 'da' ? 'DKK' : 'EUR';
  return new Intl.NumberFormat(language || 'en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
