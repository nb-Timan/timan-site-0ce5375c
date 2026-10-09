import { beforeEach, describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { assertValidSalesStockState, normalizeConfiguratorState } from '@/lib/configuratorState';
import {
  buildSalesStockConfiguratorState,
  configuratorSalesSourceType,
  consumeSalesStockHandoff,
  resolveSalesStockCatalogItem,
  salesStockAssetContextLines,
  salesStockSelectedGroupIssue,
  storeSalesStockHandoff,
  updateSalesStockAssetPricing,
} from '@/lib/salesStockConfigurator';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';

const asset = (id: string, itemNumber: '410040-01' | '411000-04', serial: string): FabricLoanAsset => ({
  asset_id: id,
  asset_instance_id: `SERIAL|DAT|${serial}`,
  instance_ordinal: 1,
  company: 'DAT',
  account_number: '1010',
  order_number: '138063',
  line_number: 1,
  item_number: itemNumber,
  item_name: itemNumber.startsWith('410040') ? 'RC-751' : 'RC-1000s',
  line_text: itemNumber.startsWith('410040') ? 'RC-751 salgslager' : 'RC-1000s salgslager',
  serial_number: serial,
  serial_number_normalized: serial,
  warehouse_location_code: itemNumber.startsWith('410040') ? '2' : '4',
  warehouse_location_name: itemNumber.startsWith('410040') ? 'Lager 2' : 'Lager 4',
  inventory_qty: 1,
  reserved_qty: 0,
  stock_last_changed: '2026-10-08T10:00:00',
  classification: 'LOAN_CANDIDATE',
  review_required: false,
  review_reason: null,
  identity_conflict: false,
  source_present: true,
  item_type: 'machine',
  allocated: false,
  sales_committed: false,
  brik_number: Number(serial.slice(-2)),
});

describe('sales-stock Configurator domain', () => {
  beforeEach(() => sessionStorage.clear());

  it('resolves exact Fabric revision suffixes through canonical Product Master item numbers', () => {
    expect(resolveSalesStockCatalogItem('410040-01', 'DKK')?.machineType).toBe('RC-751');
    expect(resolveSalesStockCatalogItem('411000-04', 'DKK')?.machineType).toBe('RC-1000S');
    expect(resolveSalesStockCatalogItem('410910-00', 'DKK')?.itemType).toBe('equipment');
    expect(resolveSalesStockCatalogItem('411666-00', 'DKK')?.itemType).toBe('equipment');
    expect(resolveSalesStockCatalogItem('312010-00', 'DKK')).toMatchObject({
      itemType: 'equipment',
      machineType: 'Loader Line',
      catalogItemNumber: '312010',
    });
    expect(resolveSalesStockCatalogItem('210100-01', 'DKK')).toBeNull();
    expect(resolveSalesStockCatalogItem('210112-02', 'DKK')).toBeNull();
    expect(resolveSalesStockCatalogItem('210123-00', 'DKK')).toBeNull();
    expect(resolveSalesStockCatalogItem('410040-01-extra', 'DKK')).toBeNull();
  });

  it('hands multiple physical assets to the existing Configurator with immutable identity snapshots', () => {
    const assets = [asset('asset-a', '410040-01', '410040-01'), asset('asset-b', '411000-04', '411000-02')];
    storeSalesStockHandoff(assets);
    const restored = buildSalesStockConfiguratorState(consumeSalesStockHandoff(), 'da', 'DKK');
    expect(restored.machineConfigs).toHaveLength(2);
    expect(restored.salesStockAssets?.map((row) => row.sourceAssetId)).toEqual(['asset-a', 'asset-b']);
    expect(restored.salesStockAssets?.map((row) => row.catalogItemNumber)).toEqual(['410040', '411000']);
    expect(restored.salesStockAssets?.map((row) => row.itemNumber)).toEqual(['410040-01', '411000-04']);
    expect(restored.salesStockAssets?.map((row) => row.serialNumber)).toEqual(['410040-01', '411000-02']);
    expect(consumeSalesStockHandoff()).toEqual([]);
    expect(configuratorSalesSourceType(restored)).toBe('SALES_STOCK_DEMO');
  });

  it('treats a shared Brik as one physical sales group without merging source rows', () => {
    const componentA = { ...asset('asset-a', '410040-01', '410040-01'), serial_number: null,
      serial_number_normalized: null, brik_number: 96, physical_asset_group_key: 'DAT:BRIK:96' };
    const componentB = { ...asset('asset-b', '411000-04', '411000-02'), serial_number: null,
      serial_number_normalized: null, brik_number: 96, physical_asset_group_key: 'DAT:BRIK:96' };
    expect(salesStockSelectedGroupIssue(componentB, [componentA])).toBe('Samme fysiske redskab er allerede valgt');
    expect(salesStockSelectedGroupIssue(componentA, [componentA])).toBeNull();
    expect(componentA.asset_instance_id).not.toBe(componentB.asset_instance_id);
  });

  it('keeps adjusted base price transaction-only and leaves Product Master unchanged', () => {
    const canonicalPrice = PRODUCTS['RC-751'].priceDKK;
    let state = buildSalesStockConfiguratorState([asset('asset-a', '410040-01', '410040-01')], 'da', 'DKK');
    state = updateSalesStockAssetPricing(state, 'asset-a', {
      pricingMethod: 'adjusted_base',
      adjustedBasePrice: 150000,
      pricingReason: 'Kontrolleret demo-brug',
    });
    assertValidSalesStockState(state);
    const result = calculateConfiguration({ ...state, manualDealerDiscountPct: 5 });
    expect(PRODUCTS['RC-751'].priceDKK).toBe(canonicalPrice);
    expect(result.discountDetails.some((row) => row.kind === 'sales_stock_base')).toBe(true);
    expect(result.discountDetails.some((row) => row.kind === 'dealer')).toBe(true);
    expect(result.currentPrice).toBeLessThan(150000);
  });

  it('keeps sales-stock discount and extra dealer discount as separate canonical layers', () => {
    let state = buildSalesStockConfiguratorState([asset('asset-a', '410040-01', '410040-01')], 'da', 'DKK');
    state = updateSalesStockAssetPricing(state, 'asset-a', {
      pricingMethod: 'sales_stock_discount',
      salesStockDiscountPct: 32.5,
      pricingReason: 'Demo-maskine',
    });
    const result = calculateConfiguration({ ...state, manualDealerDiscountPct: 4 });
    expect(result.discountDetails.map((row) => row.kind)).toEqual(expect.arrayContaining(['sales_stock', 'dealer']));
    expect(result.discountDetails.find((row) => row.kind === 'sales_stock')?.percent).toBe(32.5);
    expect(result.discountDetails.find((row) => row.kind === 'dealer')?.percent).toBe(4);
  });

  it('enforces mutually exclusive methods and required reasons across save/reopen normalization', () => {
    const state = buildSalesStockConfiguratorState([asset('asset-a', '410040-01', '410040-01')], 'da', 'DKK');
    const adjusted = updateSalesStockAssetPricing(state, 'asset-a', {
      pricingMethod: 'adjusted_base',
      adjustedBasePrice: 145000,
      pricingReason: 'Brugt aktiv',
    });
    expect(adjusted.salesStockAssets?.[0].salesStockDiscountPct).toBeNull();
    const reopened = normalizeConfiguratorState(JSON.parse(JSON.stringify(adjusted)));
    expect(reopened.salesStockAssets?.[0]).toMatchObject({ sourceAssetId: 'asset-a', adjustedBasePrice: 145000 });
    expect(() => assertValidSalesStockState({
      ...reopened,
      salesStockAssets: reopened.salesStockAssets?.map((row) => ({ ...row, salesStockDiscountPct: 10 })),
    })).toThrow('SALES_STOCK_PRICING_METHOD_CONFLICT');
  });

  it('builds Lead/PDF context from the same physical snapshots', () => {
    const state = buildSalesStockConfiguratorState([asset('asset-a', '410040-01', '410040-01')], 'da', 'DKK');
    expect(salesStockAssetContextLines(state).join('\n')).toContain('Serienr.: 410040-01');
    expect(salesStockAssetContextLines(state).join('\n')).toContain('Brik nr.: 1');
    expect(salesStockAssetContextLines(normalizeConfiguratorState({ salesChannel: 'standard' }))).toEqual([]);
  });
});
