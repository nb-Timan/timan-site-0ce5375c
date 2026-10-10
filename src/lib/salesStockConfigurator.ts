import { ACCESSORIES, getAccessoriesFlat, getPriceForCurrency, LOOSE_TOOL_KEY, PRODUCTS } from '@/data/machines';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { configuratorCurrency } from '@/lib/configuratorPricing';
import { getCurrentProductPrice } from '@/lib/publishedProductMaster';
import type { Currency } from '@/lib/currency';
import { fabricLoanPhysicalGroupKey, isFabricStockFresh, type FabricLoanAsset, type FabricLoanSyncStatus } from '@/lib/fabricLoanStock';
import type { ConfiguratorState, MachineConfig, SalesStockAssetSnapshot } from '@/types/configurator';

export const SALES_STOCK_HANDOFF_KEY = 'timan.configurator.sales-stock-handoff.v1';

export type SalesStockCatalogMatch = {
  itemType: 'machine' | 'equipment';
  machineType: string;
  catalogId: string;
  catalogItemNumber: string;
  listPrice: number;
};

function salesStockCatalogItemCandidates(itemNumber: string): string[] {
  const exact = itemNumber.trim().toUpperCase();
  const withoutRevision = exact.replace(/-\d{2}$/, '');
  return withoutRevision === exact ? [exact] : [exact, withoutRevision];
}

export function resolveSalesStockCatalogItem(itemNumber: string, currency: Currency): SalesStockCatalogMatch | null {
  const candidates = salesStockCatalogItemCandidates(itemNumber);
  const machine = Object.entries(PRODUCTS).find(([, product]) => candidates.includes(product.varenr.trim().toUpperCase()));
  if (machine) return {
    itemType: 'machine',
    machineType: machine[0],
    catalogId: machine[1].id,
    catalogItemNumber: machine[1].varenr,
    listPrice: getPriceForCurrency(machine[1], currency),
  };
  const looseEquipment = getAccessoriesFlat(LOOSE_TOOL_KEY).find((item) =>
    !item.sourceMachineType && !item.isHeader && !item.isProductGroup
    && candidates.includes(item.varenr.trim().toUpperCase()));
  if (looseEquipment) return {
    itemType: 'equipment',
    machineType: LOOSE_TOOL_KEY,
    catalogId: looseEquipment.id,
    catalogItemNumber: looseEquipment.varenr,
    listPrice: getPriceForCurrency(looseEquipment, currency),
  };

  for (const machineType of Object.keys(ACCESSORIES)) {
    const equipment = getAccessoriesFlat(machineType).find((item) =>
      !item.isHeader && !item.isProductGroup && candidates.includes(item.varenr.trim().toUpperCase()));
    if (!equipment) continue;
    return {
      itemType: 'equipment',
      machineType,
      catalogId: equipment.id,
      catalogItemNumber: equipment.varenr,
      listPrice: getPriceForCurrency(equipment, currency),
    };
  }

  return null;
}

export function canLaunchSalesStockAsset(asset: FabricLoanAsset, currency: Currency): boolean {
  void currency;
  return asset.classification === 'LOAN_CANDIDATE'
    && !asset.review_required
    && !asset.identity_conflict
    && !asset.brik_group_serial_conflict
    && !asset.allocated
    && !asset.sales_committed
    && asset.source_present
    && asset.inventory_qty !== null && Number.isFinite(asset.inventory_qty) && asset.inventory_qty > 0
    && Boolean(asset.serial_number?.trim() || (asset.asset_instance_id?.trim() && asset.brik_number))
    && ['2', '4'].includes(asset.warehouse_location_code)
    && ['1010', '1020'].includes(asset.account_number ?? '');
}

export function salesStockAssetSelectionIssue(
  asset: FabricLoanAsset,
  sync: FabricLoanSyncStatus,
  currency: Currency,
): string | null {
  void currency;
  if (!isFabricStockFresh(sync)) return 'Salgslagerdata er ikke opdateret';
  if (asset.identity_conflict || asset.brik_group_serial_conflict
    || asset.classification === 'IDENTITY_CONFLICT') return 'Identitetskonflikt';
  if (asset.review_required || asset.classification === 'REVIEW_REQUIRED') return 'Kræver kontrol';
  if (asset.sales_committed) return 'Allerede reserveret til salg';
  if (asset.allocated) return 'Allerede reserveret til lån';
  if (!asset.source_present || asset.classification !== 'LOAN_CANDIDATE'
    || !['2', '4'].includes(asset.warehouse_location_code)
    || !['1010', '1020'].includes(asset.account_number ?? '')) return 'Ikke salgbar';
  if (asset.inventory_qty === null || !Number.isFinite(asset.inventory_qty) || asset.inventory_qty <= 0) return 'Ikke disponibel';
  if (!asset.serial_number?.trim()) {
    if (!asset.asset_instance_id?.trim()) return 'Identitetskonflikt';
    if (!asset.brik_number) return 'Mangler Brik nr.';
  }
  return null;
}

export function salesStockSelectedGroupIssue(
  asset: FabricLoanAsset,
  selected: FabricLoanAsset[],
): string | null {
  const groupKey = fabricLoanPhysicalGroupKey(asset);
  return selected.some((candidate) => candidate.asset_id !== asset.asset_id
    && fabricLoanPhysicalGroupKey(candidate) === groupKey)
    ? 'Samme fysiske redskab er allerede valgt'
    : null;
}

export function buildSalesStockConfiguratorState(
  assets: FabricLoanAsset[],
  language: ConfiguratorState['language'] = 'da',
  currency: Currency = 'DKK',
): ConfiguratorState {
  const base = createEmptyConfiguratorState(language, 'quote');
  const machineConfigs: MachineConfig[] = [];
  const snapshots: SalesStockAssetSnapshot[] = [];

  assets.forEach((asset, index) => {
    const match = resolveSalesStockCatalogItem(asset.item_number, currency);
    const releasedPrice = match ? getCurrentProductPrice({ itemNumber: match.catalogItemNumber, currency,
      legacy: { DKK: null, EUR: null, SEK: null } }) : null;
    const originalPrice = releasedPrice !== null && releasedPrice > 0 ? releasedPrice : null;
    if (!canLaunchSalesStockAsset(asset, currency)) throw new Error(`SALES_STOCK_ASSET_UNAVAILABLE:${asset.item_number}`);
    const unitNumber = index + 1;
    machineConfigs.push({
      id: `sales-stock-${unitNumber}`,
      type: match?.machineType ?? 'SALES_STOCK',
      qty: 1,
      configMode: 'shared',
      acc: [],
    });
    snapshots.push({
      sourceAssetId: asset.asset_id,
      assetInstanceId: asset.asset_instance_id,
      itemNumber: asset.item_number,
      catalogItemNumber: match?.catalogItemNumber ?? null,
      itemText: asset.line_text?.trim() || asset.item_name?.trim() || asset.item_number,
      itemType: asset.item_type,
      quantity: asset.inventory_qty!,
      priceSource: originalPrice !== null ? 'catalogue' : 'manual',
      serialNumber: asset.serial_number?.trim() || null,
      brikNumber: asset.brik_number ?? null,
      warehouseLocationCode: asset.warehouse_location_code,
      warehouseLocationName: asset.warehouse_location_name,
      accountNumber: asset.account_number,
      sourceOrderNumber: asset.order_number,
      classification: asset.classification,
      configuratorUnitNumber: unitNumber,
      originalListPrice: originalPrice,
      pricingCurrency: currency,
      pricingMethod: originalPrice !== null ? 'sales_stock_discount' : 'adjusted_base',
      adjustedBasePrice: null,
      salesStockDiscountPct: null,
      pricingReason: '',
    });
  });

  return normalizeConfiguratorState({
    ...base,
    step: 4,
    currency,
    salesChannel: 'sales_stock_demo',
    salesStockAssets: snapshots,
    machineConfigs,
    currentMachineIndex: 0,
    demoMachines: {},
    campaignDisabled: true,
  });
}

export function storeSalesStockHandoff(assets: FabricLoanAsset[]): void {
  sessionStorage.setItem(SALES_STOCK_HANDOFF_KEY, JSON.stringify({ assets, createdAt: new Date().toISOString() }));
}

export function consumeSalesStockHandoff(): FabricLoanAsset[] {
  const raw = sessionStorage.getItem(SALES_STOCK_HANDOFF_KEY);
  sessionStorage.removeItem(SALES_STOCK_HANDOFF_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { assets?: FabricLoanAsset[] };
    return Array.isArray(parsed.assets) ? parsed.assets : [];
  } catch {
    return [];
  }
}

export function isSalesStockConfiguration(state: Pick<ConfiguratorState, 'salesChannel'>): boolean {
  return state.salesChannel === 'sales_stock_demo';
}

/** The existing priceSource marker distinguishes source lines from legacy catalogue snapshots. */
export function usesSourceSalesStockLines(state: Pick<ConfiguratorState, 'salesChannel' | 'salesStockAssets'>): boolean {
  return isSalesStockConfiguration(state) && Boolean(state.salesStockAssets?.some(asset => asset.priceSource !== undefined));
}

export type SalesSourceType = 'STANDARD' | 'SALES_STOCK_DEMO';

export function configuratorSalesSourceType(state: Pick<ConfiguratorState, 'salesChannel'>): SalesSourceType {
  return isSalesStockConfiguration(state) ? 'SALES_STOCK_DEMO' : 'STANDARD';
}

export function salesStockAssetContextLines(
  state: Pick<ConfiguratorState, 'salesChannel' | 'salesStockAssets'>,
): string[] {
  if (!isSalesStockConfiguration(state) || !state.salesStockAssets?.length) return [];
  return [
    'Salgslager / Demo',
    ...state.salesStockAssets.map((asset) => [
      `${asset.itemNumber} - ${asset.itemText}`,
      `Serienr.: ${asset.serialNumber || '-'}`,
      `Brik nr.: ${asset.brikNumber ?? '-'}`,
      `Lager: ${asset.warehouseLocationCode}`,
      `Konto: ${asset.accountNumber || '-'}`,
      `Kildeordre: ${asset.sourceOrderNumber || '-'}`,
      `Stk.: ${asset.quantity ?? 1}`,
    ].join(' | ')),
  ];
}

export function updateSalesStockAssetPricing(
  state: ConfiguratorState,
  sourceAssetId: string,
  patch: Partial<Pick<SalesStockAssetSnapshot, 'pricingMethod' | 'adjustedBasePrice' | 'salesStockDiscountPct' | 'pricingReason'>>,
): ConfiguratorState {
  if (!isSalesStockConfiguration(state)) return state;
  return {
    ...state,
    pricingSnapshot: undefined,
    salesStockAssets: (state.salesStockAssets ?? []).map((asset) => asset.sourceAssetId === sourceAssetId
      ? {
          ...asset,
          ...(asset.pricingCurrency !== configuratorCurrency(state) ? {
            pricingCurrency: configuratorCurrency(state),
            ...(() => {
              const price = asset.catalogItemNumber ? getCurrentProductPrice({
                itemNumber: asset.catalogItemNumber, currency: configuratorCurrency(state),
                legacy: { DKK: null, EUR: null, SEK: null },
              }) : null;
              return { originalListPrice: price !== null && price > 0 ? price : null,
                priceSource: price !== null && price > 0 ? 'catalogue' as const : 'manual' as const };
            })(),
            adjustedBasePrice: null,
            salesStockDiscountPct: null,
          } : {}),
          ...patch,
          ...(patch.pricingMethod === 'adjusted_base' ? { salesStockDiscountPct: null } : {}),
          ...(patch.pricingMethod === 'sales_stock_discount' ? { adjustedBasePrice: null } : {}),
        }
      : asset),
  };
}
