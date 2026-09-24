import type { CalcResult, ConfiguratorState, DiscountDetail, LineItem, MachineDeliveryDiscount } from '@/types/configurator';
import { DEMO_FEE_ITEM_NUMBER, PRODUCTS, getAccessoriesFlat, getLocalizedName, getPrice } from '@/data/machines';
import { t } from '@/data/translations';
import { hasFrozenConfiguratorPricing, snapshotAccessoryPrice, snapshotDemoFee, snapshotMachinePrice, snapshotStartupPrice, snapshotProductName } from '@/lib/configuratorPricing';
import { shouldIncludeQuantityAccessory } from '@/lib/looseToolDependencies';
import { campaignBenefitEntitlement, campaignProductPricing, campaignTriggerSetCount, isCampaignActive, publishedCampaignDefinitions, type CampaignLineSnapshot } from '@/lib/configuratorCampaigns';
import { DELIVERY_DISCOUNT_PERCENT, hasMachineDeliveryOverride, isDeliveryDiscountEligible, machineDeliveryDate } from '@/lib/configuratorDelivery';

export const roundPricingMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type PricingOptions = { grossManualDiscountOnly?: boolean; now?: number };
type EconomicLine = { gross: number; net: number; quantity: number; unit: number; demo: boolean; quantityEligible: boolean; productKey: string; item: LineItem; campaignApplied: boolean; selectionOrder: number };

/** Keeps campaign SKU provenance in the detail while omitting it from summaries. */
export function formatDiscountDetailLabel(detail: DiscountDetail, includeItemNumber = false): string {
  const label = detail.kind === 'campaign' && detail.varenr
    ? detail.txt.replace(` · ${detail.varenr}`, '')
    : detail.txt;
  return includeItemNumber && detail.kind !== 'campaign' && detail.varenr
    ? `${label} (${detail.varenr})`
    : label;
}

export function configurationCampaignSelection(state: ConfiguratorState) {
  let unit = 0;
  return state.machineConfigs.flatMap(machine => {
    const product = PRODUCTS[machine.type];
    if (!product) return [];
    const selection: { productKey: string; itemNumber: string; quantity: number; demo: boolean }[] = [];
    for (let index = 1; index <= machine.qty; index++) {
      const demo = Boolean(state.demoMachines?.[`${product.varenr}_${++unit}`]);
      selection.push({ productKey: `${machine.type}::${product.id}`, itemNumber: product.varenr, quantity: 1, demo });
      const key = machine.configMode === 'shared' ? machine.id : `${machine.id}_${index}`;
      const selected = machine.configMode === 'shared' ? machine.acc ?? [] : state.individualUnitConfigs?.[key]?.acc ?? [];
      for (const accessory of getAccessoriesFlat(machine.type)) {
        if (accessory.isHeader) continue;
        const quantity = state.accQty?.[`${key}_${accessory.id}`] || 0;
        if (selected.includes(accessory.id) || shouldIncludeQuantityAccessory(machine.type, accessory, selected, quantity)) {
          selection.push({ productKey: `${machine.type}::${accessory.id}`, itemNumber: accessory.varenr, quantity: quantity || 1, demo });
        }
      }
    }
    return selection;
  });
}

/** One commercial calculation for the live cart, persistence and document totals. */
export function calculateConfiguration(state: ConfiguratorState, options: PricingOptions = {}): CalcResult {
  if (state.pricingSnapshot?.totalsOnly) throw new Error('Historiske linjepriser mangler. Brug det afsendte dokument; priser genberegnes ikke automatisk.');
  const now = options.now ?? Date.now();
  const T = (key: string) => t(key, state.language);
  const lineItems: LineItem[] = [];
  const lines: EconomicLine[] = [];
  const details: DiscountDetail[] = [];
  let deliveryDiscounts: MachineDeliveryDiscount[] = [];
  let eligibleUnits = 0;
  let unit = 0;
  const add = (item: LineItem, quantity: number, demo: boolean, quantityEligible: boolean, productKey = '', selectionOrder = -1, lineUnit = unit) => {
    item.price = roundPricingMoney(item.price);
    item.quantity = quantity;
    item.unitPrice = roundPricingMoney(item.price / Math.max(1, quantity));
    lineItems.push(item);
    lines.push({ gross: item.price, net: item.price, quantity, unit: lineUnit, demo, quantityEligible, productKey, item, campaignApplied: false, selectionOrder });
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
      const machineDescription = snapshotProductName(state, product.varenr, getLocalizedName(product.name, state.language));
      add({ txt: `${T('machineLabel')} ${unit} (${machineDescription})`, description: machineDescription, price: snapshotMachinePrice(state, machine.type, getPrice(product, state.language)), varenr: product.varenr, bold: true, isMachine: true, index: unit }, 1, demo, eligible, `${machine.type}::${product.id}`);
      for (const accessory of getAccessoriesFlat(machine.type)) {
        if (accessory.isHeader) continue;
        const quantity = state.accQty?.[`${key}_${accessory.id}`] || 1;
        if (!selected.includes(accessory.id) && !shouldIncludeQuantityAccessory(machine.type, accessory, selected, state.accQty?.[`${key}_${accessory.id}`] || 0)) continue;
        const description = snapshotProductName(state, accessory.varenr, getLocalizedName(accessory.name, state.language));
        add({ txt: `- ${description}`, description, price: snapshotAccessoryPrice(state, machine.type, accessory, getPrice(accessory, state.language)) * quantity, varenr: accessory.varenr, sub: true, isAutoAdded: !!accessory.hidden }, quantity, demo, eligible, `${machine.type}::${accessory.id}`, selected.indexOf(accessory.id));
      }
      if (demo) {
        const description = snapshotProductName(state, DEMO_FEE_ITEM_NUMBER, T('demoMachineLabel'));
        add({ txt: `- ${description}`, description, price: snapshotDemoFee(state, state.language), varenr: DEMO_FEE_ITEM_NUMBER, sub: true }, 1, true, false);
      }
      lineItems.push({ txt: `${T('subtotalMachine')} ${unit}:`, price: roundPricingMoney(lines.filter(line => line.unit === unit).reduce((sum, line) => sum + line.gross, 0)), varenr: 'SUBTOTAL', subtotal: true, index: unit });
    }
  }
  if (unit && state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const option = state.deliveryDeliverStartup;
    const fallback = option === 'no_bridge' ? (state.language === 'da' ? 1500 : 200) : option === 'with_bridge' ? (state.language === 'da' ? 2500 : 335) : 0;
    const description = T(option === 'no_bridge' ? 'startupNoBridgeCalc' : option === 'with_bridge' ? 'startupWithBridgeCalc' : 'startupOtherCalc');
    add({ txt: `- ${description}`, description, price: snapshotStartupPrice(state, state.language, option, fallback), varenr: '795050', sub: true }, 1, false, false, '', -1, 0);
  }
  const subtotal = roundPricingMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  const apply = (kind: DiscountDetail['kind'], percent: number, eligible: (line: EconomicLine) => boolean, label: string, varenr?: string) => {
    if (!(percent > 0)) return;
    // Demo is an exclusive per-unit regime, including its existing surcharge.
    const affected = lines.filter(line => (kind === 'demo' || !line.demo) && eligible(line));
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
    if (amount > 0) details.push({ kind, percent, basis, txt: `${label.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/, '')} (${percent.toLocaleString(state.language, { maximumFractionDigits: 2 })}%)`, amount, ...(varenr ? { varenr } : {}) });
  };
  const quantityPct = eligibleUnits >= 4 ? 4 : eligibleUnits >= 2 ? 2 : 0;
  if (!options.grossManualDiscountOnly) {
    apply('demo', 32.5, line => line.demo, T('demoDiscount'));
    apply('base', (state.baseDiscountPct ?? 0.25) * 100, line => !line.demo, T('baseDiscountLabel'));
    const eligibleDeliveryUnits = new Set<number>();
    const deliveryBasisByUnit = new Map<number, number>();
    for (let unitNumber = 1; unitNumber <= unit; unitNumber += 1) {
      const basis = roundPricingMoney(lines.filter(line => line.unit === unitNumber && !line.demo).reduce((sum, line) => sum + line.net, 0));
      deliveryBasisByUnit.set(unitNumber, basis);
      if (basis > 0 && isDeliveryDiscountEligible(machineDeliveryDate(state, unitNumber), now)) eligibleDeliveryUnits.add(unitNumber);
    }
    if (eligibleDeliveryUnits.size > 0) {
      apply('delivery', DELIVERY_DISCOUNT_PERCENT, line => !line.demo && eligibleDeliveryUnits.has(line.unit), T('deliveryDiscountLabel'), '795045');
    }
    deliveryDiscounts = Array.from({ length: unit }, (_, index) => {
      const unitNumber = index + 1;
      const basis = deliveryBasisByUnit.get(unitNumber) ?? 0;
      const netAfter = roundPricingMoney(lines.filter(line => line.unit === unitNumber && !line.demo).reduce((sum, line) => sum + line.net, 0));
      const eligible = eligibleDeliveryUnits.has(unitNumber);
      return {
        unitNumber,
        date: machineDeliveryDate(state, unitNumber),
        overridden: hasMachineDeliveryOverride(state, unitNumber),
        percent: eligible ? DELIVERY_DISCOUNT_PERCENT : 0,
        basis,
        amount: eligible ? roundPricingMoney(basis - netAfter) : 0,
      };
    });
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
      const campaignSelection = lines.map(line => ({ productKey: line.productKey, itemNumber: line.item.varenr, quantity: line.quantity, demo: line.demo }));
      const triggerSetCount = campaignTriggerSetCount(campaign, campaignSelection);
      let remainingBenefitQuantity = campaignBenefitEntitlement(campaign, campaignSelection);
      const benefitEntitlementQuantity = campaign.type === 'conditional' ? remainingBenefitQuantity : null;
      // A single entitlement is shared by all choices; the latest selected choice wins.
      const benefitLines = campaign.type === 'conditional'
        ? [...lines].sort((a, b) => b.selectionOrder - a.selectionOrder || a.unit - b.unit)
        : lines;
      for (const line of benefitLines) {
        if (line.campaignApplied) continue;
        const benefit = benefitLinks.find(product => product.itemNumber === line.item.varenr || product.productKey === line.productKey);
        if (!benefit) continue;
        const remaining = remainingBenefitQuantity;
        if (!line.demo && remaining <= 0) continue;
        const eligibleQuantity = line.demo ? line.quantity : Math.min(line.quantity, remaining);
        if (!(eligibleQuantity > 0)) continue;
        const pricing = campaignProductPricing(campaign, benefit);
        const pricingType = pricing.type as 'percentage' | 'fixed';
        const currency = state.language === 'da' ? 'DKK' : 'EUR';
        const configuredPct = pricing.discountPct;
        const target = pricingType === 'fixed'
          ? currency === 'DKK' ? pricing.targetPriceDkk : pricing.targetPriceEur
          : null;
        const lineBefore = line.net;
        const eligibleBasis = roundPricingMoney(lineBefore * eligibleQuantity / line.quantity);
        const amount = line.demo ? 0 : roundPricingMoney(pricingType === 'percentage'
          ? eligibleBasis * (configuredPct ?? 0) / 100
          : Math.max(0, eligibleBasis - roundPricingMoney((target ?? 0) * eligibleQuantity)));
        line.net = roundPricingMoney(lineBefore - amount);
        const percent = eligibleBasis > 0 ? amount / eligibleBasis * 100 : 0;
        const snapshot: CampaignLineSnapshot = {
          campaignId: campaign.id, campaignCode: campaign.code, campaignName: campaign.name,
          campaignType: campaign.type, pricingType, applied: amount > 0,
          ...(line.demo ? { suppressedReason: 'demo_machine' as const } : {}),
          triggerItemNumbers: triggerLinks.map(product => product.itemNumber), benefitItemNumber: benefit.itemNumber,
          triggerMatchMode: campaign.triggerMatchMode, triggerSetCount,
          repeatPerTrigger: campaign.scaleBenefitWithTrigger, benefitEntitlementQuantity,
          configuredPct: pricingType === 'percentage' ? configuredPct : null,
          discountPct: line.demo ? 0 : pricingType === 'percentage' ? configuredPct ?? 0 : percent,
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
            txt: `${T('campaignDiscountLabel')} · ${campaign.code} (${snapshot.discountPct.toLocaleString(state.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)` });
        }
        // Related demo products retain provenance but consume no entitlement.
        if (!line.demo) remainingBenefitQuantity -= eligibleQuantity;
      }
    }
  }
  const currentPrice = roundPricingMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const totalDiscount = roundPricingMoney(subtotal - currentPrice);
  return { lineItems, subtotal, discountDetails: details, deliveryDiscounts, totalDiscount, currentPrice, totalPct: subtotal ? totalDiscount / subtotal * 100 : 0, qtyPct: quantityPct / 100, campaignLines };
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
