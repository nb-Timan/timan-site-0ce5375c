import type { CalcResult, ConfiguratorLineDiscountApplication, ConfiguratorState, DiscountDetail, LineItem, MachineDeliveryDiscount, SalesStockAssetSnapshot } from '@/types/configurator';
import { DEMO_FEE_ITEM_NUMBER, PRODUCTS, getAccessoriesFlat, getLocalizedName, getPriceForCurrency } from '@/data/machines';
import { t } from '@/data/translations';
import { configuratorCurrency, hasFrozenConfiguratorPricing, isConfiguratorNettoSku, snapshotAccessoryPrice, snapshotDemoFee, snapshotMachinePrice, snapshotStartupPrice, snapshotProductName } from '@/lib/configuratorPricing';
import { convertCurrency } from '@/lib/currency';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { shouldIncludeQuantityAccessory } from '@/lib/looseToolDependencies';
import { campaignBenefitEntitlement, campaignProductPricing, campaignTriggerSetCount, isCampaignActive, isCampaignEligibleForPartnerType, publishedCampaignDefinitions, type CampaignLineSnapshot } from '@/lib/configuratorCampaigns';
import { DELIVERY_DISCOUNT_PERCENT, hasMachineDeliveryOverride, isDeliveryDiscountEligible, machineDeliveryDate } from '@/lib/configuratorDelivery';
import { canonicalBaseDiscountPct, IMPORTER_DEMO_DISCOUNT_PCT, resolveConfiguratorPartnerAccountType } from '@/lib/importerDiscount';

export const roundPricingMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const isCampaignPricingActive = (campaignLines: CampaignLineSnapshot[] | undefined): boolean =>
  Boolean(campaignLines?.some(line => !line.suppressedReason));
export const shouldShowCampaignDisableControl = (
  state: Pick<ConfiguratorState, 'pricingMode'>,
  campaignLines: CampaignLineSnapshot[] | undefined,
  grossPriceMode = false,
): boolean => state.pricingMode !== 'direct' && !grossPriceMode && Boolean(campaignLines?.length);
type PricingOptions = { grossManualDiscountOnly?: boolean; now?: number };
type EconomicLine = { gross: number; net: number; quantity: number; unit: number; demo: boolean; quantityEligible: boolean; productKey: string; item: LineItem; campaignApplied: boolean; selectionOrder: number; discountApplications: ConfiguratorLineDiscountApplication[]; salesStockAsset?: SalesStockAssetSnapshot };

const salesStockLabel = (language: ConfiguratorState['language'], kind: 'base' | 'discount') => ({
  da: kind === 'base' ? 'Nedskrevet grundpris' : 'Salgslager-/demo-rabat',
  en: kind === 'base' ? 'Adjusted sales-stock base price' : 'Sales-stock/demo discount',
  de: kind === 'base' ? 'Angepasster Lager-Grundpreis' : 'Lager-/Demo-Rabatt',
  it: kind === 'base' ? 'Prezzo base stock rettificato' : 'Sconto stock/demo',
  hu: kind === 'base' ? 'Módosított készlet-alapár' : 'Készlet/demo kedvezmény',
}[language] ?? (kind === 'base' ? 'Adjusted sales-stock base price' : 'Sales-stock/demo discount'));

/** Keeps campaign SKU provenance in the detail while omitting it from summaries. */
export function formatDiscountDetailLabel(detail: DiscountDetail, includeItemNumber = false, locale?: PortalUiLanguage): string {
  const originalLabel = detail.kind === 'campaign' && detail.varenr
    ? detail.txt.replace(` · ${detail.varenr}`, '')
    : detail.txt;
  const translationKeys: Partial<Record<NonNullable<DiscountDetail['kind']>, string>> = {
    demo: 'demoDiscount', base: 'baseDiscountLabel', delivery: 'deliveryDiscountLabel',
    quantity: 'qtyDiscountLabel', dealer: 'extraDealerDiscountLabel', campaign: 'campaignDiscountLabel',
    direct: 'directExtraDiscountLabel',
  };
  let label = originalLabel;
  if (locale && detail.kind && translationKeys[detail.kind]) {
    const base = t(translationKeys[detail.kind]!, locale).replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/, '');
    const campaignCode = detail.kind === 'campaign'
      ? originalLabel.match(/·\s*([^()·]+?)(?:\s*\(|$)/)?.[1]?.trim()
      : null;
    const percent = typeof detail.percent === 'number'
      ? ` (${detail.percent.toLocaleString(locale, { maximumFractionDigits: 2 })}%)`
      : '';
    label = `${base}${campaignCode ? ` · ${campaignCode}` : ''}${percent}`;
  }
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
        if (accessory.isHeader || accessory.isProductGroup) continue;
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
  const salesStockMode = state.salesChannel === 'sales_stock_demo' && Boolean(state.salesStockAssets?.length);
  const sourceSalesStockLines = salesStockMode && state.salesStockAssets?.some(asset => asset.priceSource !== undefined);
  const directPricing = !sourceSalesStockLines && state.pricingMode === 'direct';
  const campaignDisabled = state.campaignDisabled === true;
  const partnerAccountType = resolveConfiguratorPartnerAccountType({ persisted: state.partnerAccountType });
  const currency = configuratorCurrency(state);
  const importerPricing = !directPricing && partnerAccountType === 'importer';
  const T = (key: string) => t(key, state.language);
  const lineItems: LineItem[] = [];
  const lines: EconomicLine[] = [];
  const nettoPricing = !hasFrozenConfiguratorPricing(state) || state.pricingSnapshot?.nettoPricingVersion === 1;
  const details: DiscountDetail[] = [];
  let deliveryDiscounts: MachineDeliveryDiscount[] = [];
  let eligibleUnits = 0;
  let unit = 0;
  const add = (item: LineItem, quantity: number, demo: boolean, quantityEligible: boolean, productKey = '', selectionOrder = -1, lineUnit = unit) => {
    item.price = roundPricingMoney(item.price);
    item.quantity = quantity;
    item.unitPrice = roundPricingMoney(item.price / (sourceSalesStockLines && quantity > 0 ? quantity : Math.max(1, quantity)));
    if (!sourceSalesStockLines && nettoPricing && isConfiguratorNettoSku(item.varenr)) item.isNetto = true;
    lineItems.push(item);
    const salesStockAsset = salesStockMode
      ? state.salesStockAssets?.find((asset) => asset.configuratorUnitNumber === lineUnit
        && (asset.itemNumber === item.varenr || asset.catalogItemNumber === item.varenr))
      : undefined;
    lines.push({ gross: item.price, net: item.price, quantity, unit: lineUnit, demo, quantityEligible, productKey, item, campaignApplied: false, selectionOrder, discountApplications: [], salesStockAsset });
  };

  // New sales-stock cases use physical source lines, not generated catalogue carts.
  // Legacy snapshots retain their original catalogue line shape.
  if (sourceSalesStockLines) {
    for (const asset of state.salesStockAssets ?? []) {
      unit = asset.configuratorUnitNumber;
      const quantity = asset.quantity ?? 1;
      const base = asset.originalListPrice ?? asset.adjustedBasePrice;
      const pending = base === null || !Number.isFinite(base) || base <= 0
        || asset.pricingCurrency !== currency
        || (asset.pricingMethod === 'adjusted_base' && (asset.adjustedBasePrice === null || asset.adjustedBasePrice <= 0));
      add({ txt: asset.itemText, description: asset.itemText, price: pending ? 0 : base! * quantity,
        varenr: asset.itemNumber, bold: true, isMachine: asset.itemType === 'machine',
        index: unit, ...(pending ? { pricePending: true } : {}) }, quantity, false, false);
    }
  } else for (const machine of state.machineConfigs ?? []) {
    const product = PRODUCTS[machine.type];
    if (!product) continue;
    for (let index = 1; index <= machine.qty; index++) {
      unit++;
      const key = machine.configMode === 'shared' ? machine.id : `${machine.id}_${index}`;
      const selected = machine.configMode === 'shared' ? machine.acc ?? [] : state.individualUnitConfigs?.[key]?.acc ?? [];
      const demo = !directPricing && Boolean(state.demoMachines?.[`${product.varenr}_${unit}`]);
      const eligible = !demo && product.isDiscountEligible === true;
      if (eligible) eligibleUnits++;
      const machineDescription = snapshotProductName(state, product.varenr, getLocalizedName(product.name, state.language));
      add({ txt: `${T('machineLabel')} ${unit} (${machineDescription})`, description: machineDescription, price: snapshotMachinePrice(state, machine.type, getPriceForCurrency(product, currency)), varenr: product.varenr, bold: true, isMachine: true, index: unit }, 1, demo, eligible, `${machine.type}::${product.id}`);
      for (const accessory of getAccessoriesFlat(machine.type)) {
        if (accessory.isHeader || accessory.isProductGroup) continue;
        const quantity = state.accQty?.[`${key}_${accessory.id}`] || 1;
        if (!selected.includes(accessory.id) && !shouldIncludeQuantityAccessory(machine.type, accessory, selected, state.accQty?.[`${key}_${accessory.id}`] || 0)) continue;
        const description = snapshotProductName(state, accessory.varenr, getLocalizedName(accessory.name, state.language));
        add({ txt: `- ${description}`, description, price: snapshotAccessoryPrice(state, machine.type, accessory, getPriceForCurrency(accessory, currency)) * quantity, varenr: accessory.varenr, sub: true, isAutoAdded: !!accessory.hidden, index: unit }, quantity, demo, eligible, `${machine.type}::${accessory.id}`, selected.indexOf(accessory.id));
      }
      if (demo) {
        const description = snapshotProductName(state, DEMO_FEE_ITEM_NUMBER, T('demoMachineLabel'));
        add({ txt: `- ${description}`, description, price: snapshotDemoFee(state, currency), varenr: DEMO_FEE_ITEM_NUMBER, sub: true }, 1, true, false);
      }
      lineItems.push({ txt: `${T('subtotalMachine')} ${unit}:`, price: roundPricingMoney(lines.filter(line => line.unit === unit && !line.item.isNetto).reduce((sum, line) => sum + line.gross, 0)), varenr: 'SUBTOTAL', subtotal: true, index: unit });
    }
  }
  if (unit && state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const option = state.deliveryDeliverStartup;
    const dkkFallback = option === 'no_bridge' ? 1500 : option === 'with_bridge' ? 2500 : 0;
    const fallback = currency === 'DKK' ? dkkFallback
      : currency === 'EUR' ? (option === 'no_bridge' ? 200 : option === 'with_bridge' ? 335 : 0)
        : convertCurrency(dkkFallback, 'DKK', 'SEK');
    const description = T(option === 'no_bridge' ? 'startupNoBridgeCalc' : option === 'with_bridge' ? 'startupWithBridgeCalc' : 'startupOtherCalc');
    add({ txt: `- ${description}`, description, price: snapshotStartupPrice(state, currency, option, fallback), varenr: '795050', sub: true }, 1, false, false, '', -1, 0);
  }
  const subtotal = roundPricingMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  const nettoTotal = roundPricingMoney(lines.filter(line => line.item.isNetto).reduce((sum, line) => sum + line.gross, 0));
  const apply = (kind: NonNullable<DiscountDetail['kind']>, percent: number, eligible: (line: EconomicLine) => boolean, label: string, varenr?: string) => {
    if (!(percent > 0)) return;
    // Demo is an exclusive per-unit regime, including its existing surcharge.
    const affected = lines.filter(line => !line.item.isNetto && (kind === 'demo' || !line.demo) && eligible(line));
    const basis = roundPricingMoney(affected.reduce((sum, line) => sum + line.net, 0));
    // Allocate rounded aggregate discount deterministically, conserving every cent.
    const amount = roundPricingMoney(basis * Math.min(100, percent) / 100);
    let allocated = 0;
    let cumulative = 0;
    for (const line of affected) {
      cumulative += line.net;
      const next = basis ? roundPricingMoney(amount * cumulative / basis) : 0;
      const lineBasis = line.net;
      const lineAmount = roundPricingMoney(next - allocated);
      line.net = roundPricingMoney(line.net - lineAmount);
      line.discountApplications.push({
        kind,
        percent,
        basis: lineBasis,
        amount: lineAmount,
      });
      allocated = next;
    }
    if (amount > 0) details.push({ kind, percent, basis, txt: `${label.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/, '')} (${percent.toLocaleString(state.language, { maximumFractionDigits: 2 })}%)`, amount, ...(varenr ? { varenr } : {}) });
  };
  const quantityPct = importerPricing ? 0 : eligibleUnits >= 4 ? 4 : eligibleUnits >= 2 ? 2 : 0;
  if (!directPricing && !options.grossManualDiscountOnly) {
    apply('demo', IMPORTER_DEMO_DISCOUNT_PCT, line => line.demo, T('demoDiscount'));
    const canonicalBasePct = canonicalBaseDiscountPct(partnerAccountType, state.baseDiscountPct) * 100;
    if (salesStockMode) {
      for (const asset of state.salesStockAssets ?? []) {
        const affected = lines.filter((line) => line.salesStockAsset?.sourceAssetId === asset.sourceAssetId && !line.item.isNetto);
        if (affected.length === 0) continue;
        if (asset.pricingMethod === 'adjusted_base' && asset.adjustedBasePrice !== null) {
          const basis = roundPricingMoney(affected.reduce((sum, line) => sum + line.net, 0));
          const target = roundPricingMoney(Math.min(basis, Math.max(0, asset.adjustedBasePrice) * (asset.quantity ?? 1)));
          const amount = roundPricingMoney(basis - target);
          if (amount > 0) {
            let allocated = 0;
            let cumulative = 0;
            for (const line of affected) {
              cumulative += line.net;
              const next = roundPricingMoney(amount * cumulative / basis);
              const lineAmount = roundPricingMoney(next - allocated);
              line.discountApplications.push({ kind: 'sales_stock_base', percent: basis ? amount / basis * 100 : 0, basis: line.net, amount: lineAmount });
              line.net = roundPricingMoney(line.net - lineAmount);
              allocated = next;
            }
            details.push({ kind: 'sales_stock_base', basis, amount, varenr: asset.itemNumber,
              percent: basis ? amount / basis * 100 : 0, txt: salesStockLabel(state.language, 'base') });
          }
        } else {
          apply('sales_stock', asset.salesStockDiscountPct ?? canonicalBasePct,
            line => line.salesStockAsset?.sourceAssetId === asset.sourceAssetId,
            salesStockLabel(state.language, 'discount'), asset.itemNumber);
        }
      }
      apply('base', canonicalBasePct, line => !line.demo && !line.salesStockAsset, T('baseDiscountLabel'));
    } else {
      apply('base', canonicalBasePct, line => !line.demo, T('baseDiscountLabel'));
    }
  }

  const campaignLines: CampaignLineSnapshot[] = [];
  // Campaigns are resolved after the standard partner discount but before all
  // optional normal-pricing layers. Demo quantities are excluded canonically
  // by campaignTriggerSetCount/campaignBenefitEntitlement.
  if (!salesStockMode && !directPricing && !options.grossManualDiscountOnly && (!state.pricingSnapshot || state.pricingSnapshot.discountEngineVersion === 2)) {
    for (const campaign of publishedCampaignDefinitions()) {
      if (!isCampaignActive(campaign, now)
          || !isCampaignEligibleForPartnerType(campaign, partnerAccountType)
          || campaign.type === 'badge') continue;
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
        if (line.campaignApplied || line.item.isNetto) continue;
        const benefit = benefitLinks.find(product => product.itemNumber === line.item.varenr || product.productKey === line.productKey);
        if (!benefit) continue;
        const remaining = remainingBenefitQuantity;
        if (!line.demo && remaining <= 0) continue;
        const eligibleQuantity = line.demo ? line.quantity : Math.min(line.quantity, remaining);
        if (!(eligibleQuantity > 0)) continue;
        const pricing = campaignProductPricing(campaign, benefit);
        const pricingType = pricing.type as 'percentage' | 'fixed';
        const configuredPct = pricing.discountPct;
        const target = pricingType === 'fixed'
          ? currency === 'DKK' ? pricing.targetPriceDkk
            : currency === 'EUR' ? pricing.targetPriceEur
              : convertCurrency(pricing.targetPriceDkk ?? 0, 'DKK', 'SEK')
          : null;
        const lineBefore = line.net;
        const eligibleBasis = roundPricingMoney(lineBefore * eligibleQuantity / line.quantity);
        const amount = line.demo || campaignDisabled ? 0 : roundPricingMoney(pricingType === 'percentage'
          ? eligibleBasis * (configuredPct ?? 0) / 100
          : Math.max(0, eligibleBasis - roundPricingMoney((target ?? 0) * eligibleQuantity)));
        line.net = roundPricingMoney(lineBefore - amount);
        const percent = eligibleBasis > 0 ? amount / eligibleBasis * 100 : 0;
        const snapshot: CampaignLineSnapshot = {
          campaignId: campaign.id, campaignCode: campaign.code, campaignName: campaign.name,
          campaignType: campaign.type, pricingType, applied: amount > 0,
          partnerAccountType, eligiblePartnerTypes: campaign.eligiblePartnerTypes,
          ...(campaignDisabled
            ? { suppressedReason: 'campaign_opt_out' as const }
            : line.demo ? { suppressedReason: 'demo_machine' as const } : {}),
          triggerItemNumbers: triggerLinks.map(product => product.itemNumber), benefitItemNumber: benefit.itemNumber,
          triggerMatchMode: campaign.triggerMatchMode, triggerSetCount,
          repeatPerTrigger: campaign.scaleBenefitWithTrigger, benefitEntitlementQuantity,
          configuredPct: pricingType === 'percentage' ? configuredPct : null,
          discountPct: line.demo || campaignDisabled ? 0 : pricingType === 'percentage' ? configuredPct ?? 0 : percent,
          discountAmount: amount, targetPrice: target, currency, productKey: line.productKey,
          itemNumber: line.item.varenr, unitNumber: line.unit, quantity: eligibleQuantity,
          startsAt: campaign.startsAt, endsAt: campaign.endsAt,
          grossLineValue: line.gross, preCampaignNet: lineBefore, finalLineValue: line.net,
        };
        campaignLines.push(snapshot);
        line.item.campaign = snapshot;
        if (amount > 0) {
          line.campaignApplied = true;
          line.discountApplications.push({ kind: 'campaign', percent: snapshot.discountPct, basis: eligibleBasis, amount });
          details.push({ kind: 'campaign', campaignId: campaign.id, varenr: line.item.varenr, percent: snapshot.discountPct, basis: eligibleBasis, amount,
            txt: `${T('campaignDiscountLabel')} · ${campaign.code} (${snapshot.discountPct.toLocaleString(state.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)` });
        }
        // Related demo products retain provenance but consume no entitlement.
        if (!line.demo) remainingBenefitQuantity -= eligibleQuantity;
      }
    }
  }
  const campaignPricingActive = isCampaignPricingActive(campaignLines);

  if (!directPricing && !options.grossManualDiscountOnly && !campaignPricingActive && !importerPricing) {
    const eligibleDeliveryUnits = new Set<number>();
    const deliveryBasisByUnit = new Map<number, number>();
    for (let unitNumber = 1; unitNumber <= unit; unitNumber += 1) {
      const basis = roundPricingMoney(lines.filter(line => line.unit === unitNumber && !line.demo && !line.item.isNetto).reduce((sum, line) => sum + line.net, 0));
      deliveryBasisByUnit.set(unitNumber, basis);
      if (basis > 0 && isDeliveryDiscountEligible(machineDeliveryDate(state, unitNumber), now)) eligibleDeliveryUnits.add(unitNumber);
    }
    if (eligibleDeliveryUnits.size > 0) {
      apply('delivery', DELIVERY_DISCOUNT_PERCENT, line => !line.demo && eligibleDeliveryUnits.has(line.unit), T('deliveryDiscountLabel'), '795045');
    }
    deliveryDiscounts = Array.from({ length: unit }, (_, index) => {
      const unitNumber = index + 1;
      const basis = deliveryBasisByUnit.get(unitNumber) ?? 0;
      const netAfter = roundPricingMoney(lines.filter(line => line.unit === unitNumber && !line.demo && !line.item.isNetto).reduce((sum, line) => sum + line.net, 0));
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
  if (directPricing) {
    apply('direct', Math.min(100, Math.max(0, state.manualDealerDiscountPct || 0)), () => true, T('directExtraDiscountLabel'));
  } else if (!campaignPricingActive) {
    apply('dealer', Math.min(100, Math.max(0, state.manualDealerDiscountPct || 0)), () => true, T('extraDealerDiscountLabel'), '795042');
  }
  const currentPrice = roundPricingMoney(lines.reduce((sum, line) => sum + line.net, 0));
  const totalDiscount = roundPricingMoney(subtotal - currentPrice);
  const commercialLines = lines.map(line => ({
    unitNumber: line.unit || undefined,
    itemNo: line.item.varenr,
    quantity: line.quantity,
    unitPrice: line.item.unitPrice ?? roundPricingMoney(line.gross / Math.max(1, line.quantity)),
    grossAmount: line.gross,
    finalNetAmount: line.net,
    discountApplications: line.discountApplications,
  }));
  const discountBasis = roundPricingMoney(subtotal - nettoTotal);
  return { lineItems, subtotal, ...(lineItems.some(item => item.pricePending) ? { pricingIncomplete: true } : {}),
    ...(nettoTotal ? { nettoTotal } : {}), discountDetails: details, deliveryDiscounts, totalDiscount, currentPrice, totalPct: discountBasis ? totalDiscount / discountBasis * 100 : 0, qtyPct: directPricing ? 0 : quantityPct / 100, campaignLines, commercialLines };
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
