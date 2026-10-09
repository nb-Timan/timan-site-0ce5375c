import type { ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  fabricLoanAssetDisplayIdentity,
  filterFabricLoanStock,
  type FabricLoanAsset,
} from '@/lib/fabricLoanStock';
import { resolveSalesStockCatalogItem } from '@/lib/salesStockConfigurator';
import { t } from '@/lib/i18n/translations';

export type FabricStockBrowserFilters = {
  warehouse: string;
  account: string;
  search: string;
};

type SelectionProps = {
  selectedIds: ReadonlySet<string>;
  onToggle: (asset: FabricLoanAsset) => void;
  issueFor: (asset: FabricLoanAsset) => string | null;
};

type Props = {
  assets: FabricLoanAsset[];
  filters: FabricStockBrowserFilters;
  onFiltersChange: (filters: FabricStockBrowserFilters) => void;
  loading?: boolean;
  countsReady?: boolean;
  selection?: SelectionProps;
  renderBrik?: (asset: FabricLoanAsset) => ReactNode;
  statusFor?: (asset: FabricLoanAsset) => ReactNode;
};

export default function FabricStockAssetBrowser({
  assets,
  filters,
  onFiltersChange,
  loading = false,
  countsReady = true,
  selection,
  renderBrik,
  statusFor,
}: Props) {
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const canonicalMatch = (asset: FabricLoanAsset) => resolveSalesStockCatalogItem(asset.item_number, 'DKK');
  const visible = filterFabricLoanStock(assets, filters.warehouse, filters.search, filters.account,
    (asset) => [canonicalMatch(asset)?.catalogItemNumber]);
  const warehouseCount = (value: 'all' | '2' | '4') => countsReady
    ? filterFabricLoanStock(assets, value, '', 'all').length
    : '—';
  const warehouseCodes = filters.warehouse === 'all' ? ['2', '4'] : [filters.warehouse];
  const date = (value: string | null) => value ? new Date(value).toLocaleString(uiLanguage) : '—';
  const setFilter = (patch: Partial<FabricStockBrowserFilters>) => onFiltersChange({ ...filters, ...patch });

  return <div className="min-w-0 space-y-4">
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-semibold text-slate-700">{label('loansWarehouse')}</legend>
        <div className="grid min-w-0 grid-cols-3 gap-1.5">
          {(['all', '2', '4'] as const).map((code) => <button type="button" key={code} aria-pressed={filters.warehouse === code}
            onClick={() => setFilter({ warehouse: code })}
            className={`flex min-h-10 min-w-0 items-center justify-between gap-1 rounded-md border px-2 py-1.5 text-left text-sm font-medium ${filters.warehouse === code ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <span className="min-w-0 break-words">{code === 'all' ? label('loansAllWarehouses') : label(`loansWarehouse${code}`)}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500" aria-hidden="true">{warehouseCount(code)}</span>
          </button>)}
        </div>
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs font-semibold text-slate-700">{label('loansStockAccount')}</legend>
        <div className="grid min-w-0 grid-cols-3 gap-1.5">
          {(['all', '1010', '1020'] as const).map((value) => <button type="button" key={value} aria-pressed={filters.account === value}
            onClick={() => setFilter({ account: value })}
            className={`min-h-10 min-w-0 rounded-md border px-2 py-1.5 text-sm font-medium ${filters.account === value ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <span className="break-words">{value === 'all' ? label('loansAllAccounts') : value}</span>
          </button>)}
        </div>
      </fieldset>
    </div>
    <label className="flex min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="sr-only">{label('loansStockSearch')}</span>
      <input className="h-10 min-w-0 w-full bg-transparent text-sm outline-none" value={filters.search}
        onChange={(event) => setFilter({ search: event.target.value })} placeholder={label('loansStockSearch')} />
    </label>
    {loading && <p role="status" className="text-sm text-slate-600">{label('loansLoading')}</p>}
    {warehouseCodes.map((warehouseCode) => {
      const rows = visible.filter((asset) => asset.warehouse_location_code === warehouseCode);
      return <section key={warehouseCode} className="min-w-0" aria-label={`${label(`loansWarehouse${warehouseCode}`)} ${label(warehouseCode === '2' ? 'loansStockNew' : 'loansStockUsed')}`}>
        <div className="border-b border-slate-300 pb-2">
          <h3 className="font-semibold text-slate-950">{label(`loansWarehouse${warehouseCode}`)}</h3>
          <p className="text-sm text-slate-600">{label(warehouseCode === '2' ? 'loansStockNew' : 'loansStockUsed')}</p>
        </div>
        {rows.length === 0 ? <p className="py-4 text-sm text-slate-600">{label('loansStockNoMatch')}</p> : <div className="divide-y divide-slate-200">
          {rows.map((asset) => {
            const match = canonicalMatch(asset);
            const selected = selection?.selectedIds.has(asset.asset_id) ?? false;
            const issue = selection?.issueFor(asset) ?? null;
            const title = asset.line_text?.trim() || asset.item_name || asset.item_number;
            return <article key={asset.asset_id} data-asset-id={asset.asset_id}
              className={`min-w-0 border-x px-3 py-3 transition-colors ${selected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex min-w-0 items-start gap-3">
                {selection && <button type="button" disabled={Boolean(issue)} onClick={() => selection.onToggle(asset)}
                  aria-pressed={selected} aria-label={`${selected ? 'Fjern' : 'Vælg'} aktiv: ${fabricLoanAssetDisplayIdentity(asset)}`}
                  title={issue ?? (selected ? 'Fjern aktiv' : 'Vælg aktiv')}
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center border ${selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white'} disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}>
                  {selected && <Check className="h-4 w-4" />}
                </button>}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-950">{title}</p>
                  <p className="mt-1 break-all text-xs text-slate-600"><span className="text-slate-500">{label('loansSerialNumber')}:</span> <span className="font-mono">{asset.serial_number ?? '—'}</span></p>
                </div>
              </div>
              <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-5">
                {[
                  [label('loansItemNumber'), asset.item_number],
                  ['Canonical SKU', match?.catalogItemNumber ?? '—'],
                  [label('loansWarehouse'), asset.warehouse_location_code],
                  [label('loansStockAccount'), asset.account_number ?? '—'],
                  [label('loansStockQuantity'), asset.inventory_qty ?? '—'],
                  [label('loansStockOrder'), asset.order_number ?? '—'],
                  [label('loansStockDate'), date(asset.stock_last_changed)],
                  ['Type', match?.itemType ?? asset.item_type ?? '—'],
                  ['Classification', asset.classification],
                ].map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-slate-500">{key}</dt><dd className="mt-0.5 break-words text-slate-900">{value}</dd></div>)}
                <div className="min-w-0"><dt className="text-slate-500">{label('loansStockBrikNumber')}</dt><dd className="mt-0.5 min-h-6 text-slate-900">{renderBrik ? renderBrik(asset) : asset.brik_number ?? '—'}</dd></div>
              </dl>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {issue && <span className="font-medium text-amber-800">{issue}</span>}
                {!issue && statusFor && <span className="text-slate-600">{statusFor(asset)}</span>}
                {!issue && asset.account_number === '1020' && <span className="text-slate-600">{label('loansStockExternal')}</span>}
                {asset.review_reason && <span className="break-words text-slate-600">{asset.review_reason}</span>}
              </div>
            </article>;
          })}
        </div>}
      </section>;
    })}
  </div>;
}
