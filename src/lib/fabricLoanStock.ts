export interface FabricLoanAsset {
  asset_id: string;
  asset_instance_id: string;
  instance_ordinal: number;
  company: string;
  account_number: string | null;
  order_number: string | null;
  line_number: number | null;
  item_number: string;
  item_name: string | null;
  line_text: string | null;
  serial_number: string | null;
  serial_number_normalized: string | null;
  warehouse_location_code: string;
  warehouse_location_name: string | null;
  inventory_qty: number | null;
  reserved_qty: number | null;
  stock_last_changed: string | null;
  classification: string;
  review_required: boolean;
  review_reason: string | null;
  identity_conflict: boolean;
  source_present: boolean;
  item_type: 'machine' | 'equipment' | null;
  allocated: boolean;
  sales_committed?: boolean;
  brik_number: number | null;
}

export interface FabricLoanSyncStatus {
  configured: boolean;
  running: boolean;
  failed: boolean;
  stale: boolean;
  source_as_of: string | null;
  last_success_at: string | null;
  stale_after_seconds: number;
}
export interface FabricLoanStock { assets: FabricLoanAsset[]; sync: FabricLoanSyncStatus; }

export function isFabricStockFresh(sync: FabricLoanSyncStatus, now = Date.now()): boolean {
  const sourceTime = sync.source_as_of ? Date.parse(sync.source_as_of) : NaN;
  return sync.configured && !sync.stale && Number.isFinite(sourceTime)
    && Number.isFinite(sync.stale_after_seconds) && now - sourceTime <= sync.stale_after_seconds * 1000;
}

export function canSelectFabricLoanAsset(asset: FabricLoanAsset, sync: FabricLoanSyncStatus, now = Date.now()): boolean {
  return isFabricStockFresh(sync, now) && asset.source_present && asset.classification === 'LOAN_CANDIDATE'
    && !asset.review_required && !asset.identity_conflict && !asset.allocated && asset.item_type !== null
    && Boolean(asset.serial_number?.trim() || asset.brik_number)
    && ['2', '4'].includes(asset.warehouse_location_code);
}

export function fabricLoanAssetDisplayIdentity(asset: FabricLoanAsset): string {
  if (asset.serial_number?.trim()) return asset.serial_number.trim();
  if (asset.brik_number) return `Brik ${asset.brik_number}`;
  return `${asset.item_number} #${asset.instance_ordinal}`;
}

export function filterFabricLoanStock(assets: FabricLoanAsset[], warehouse: string, search: string, account: string) {
  const needle = search.trim().toLocaleLowerCase();
  return assets.filter((asset) => asset.source_present
    && ['2', '4'].includes(asset.warehouse_location_code)
    && ['1010', '1020'].includes(asset.account_number ?? '')
    && (warehouse === 'all' || asset.warehouse_location_code === warehouse)
    && (account === 'all' || asset.account_number === account)
    && (!needle || [asset.item_number, asset.item_name, asset.line_text, asset.serial_number, asset.account_number,
      asset.asset_instance_id,
      asset.order_number, asset.brik_number?.toString()]
      .some((value) => value?.toLocaleLowerCase().includes(needle))));
}
