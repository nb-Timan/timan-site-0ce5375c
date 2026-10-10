import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronRight, Info, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLanguage } from '@/context/LanguageContext';
import {
  fabricLoanAssetDisplayIdentity,
  fabricLoanPhysicalGroupKey,
  fabricLoanSharedBrikRows,
  filterFabricLoanStock,
  type FabricLoanAssignment,
  type FabricLoanAsset,
} from '@/lib/fabricLoanStock';
import { loanStatusTranslationKey, type LoanStatus } from '@/lib/loanDomain';
import { resolveSalesStockCatalogItem } from '@/lib/salesStockConfigurator';
import { t } from '@/lib/i18n/translations';

export type FabricStockBrowserFilters = { warehouse: string; account: string; search: string };

type SelectionProps = {
  mode?: 'checkbox';
  selectedIds: ReadonlySet<string>;
  onToggle: (asset: FabricLoanAsset) => void;
  issueFor: (asset: FabricLoanAsset) => string | null;
};

type Props = {
  assets: FabricLoanAsset[];
  activeAssignments?: FabricLoanAssignment[];
  filters: FabricStockBrowserFilters;
  onFiltersChange: (filters: FabricStockBrowserFilters) => void;
  loading?: boolean;
  countsReady?: boolean;
  selection?: SelectionProps;
  renderBrik?: (asset: FabricLoanAsset) => ReactNode;
  statusFor?: (asset: FabricLoanAsset) => ReactNode;
  informationFor?: (asset: FabricLoanAsset) => ReactNode;
  renderSummary?: (visible: FabricLoanAsset[], onFindAsset: (assetId: string) => void) => ReactNode;
};

const detailGridClass = 'grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3 lg:grid-cols-5';
const rowGridClass = 'grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-[minmax(0,40fr)_minmax(0,20fr)_minmax(0,15fr)_minmax(0,25fr)] md:items-center md:gap-x-4';

export default function FabricStockAssetBrowser({
  assets, activeAssignments = [], filters, onFiltersChange, loading = false, countsReady = true,
  selection, renderBrik, statusFor, informationFor, renderSummary,
}: Props) {
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const canonicalMatch = (asset: FabricLoanAsset) => resolveSalesStockCatalogItem(asset.item_number, 'DKK');
  const assignmentByAssetId = new Map(activeAssignments.map((assignment) => [assignment.asset_id, assignment]));
  const assignmentFor = (asset: FabricLoanAsset) => {
    const direct = assignmentByAssetId.get(asset.asset_id);
    if (direct) return direct;
    if (!asset.brik_number) return undefined;
    const groupKey = fabricLoanPhysicalGroupKey(asset);
    const groupAsset = assets.find((candidate) => fabricLoanPhysicalGroupKey(candidate) === groupKey
      && assignmentByAssetId.has(candidate.asset_id));
    return groupAsset ? assignmentByAssetId.get(groupAsset.asset_id) : undefined;
  };
  const visible = filterFabricLoanStock(assets, filters.warehouse, filters.search, filters.account,
    (asset) => [canonicalMatch(asset)?.catalogItemNumber, assignmentFor(asset)?.loan_number]);
  const warehouseCount = (value: 'all' | '2' | '4') => countsReady
    ? filterFabricLoanStock(assets, value, '', 'all').length : '—';
  const warehouseCodes = filters.warehouse === 'all' ? ['2', '4'] : [filters.warehouse];
  const date = (value: string | null) => value ? new Date(value).toLocaleString(uiLanguage) : '—';
  const setFilter = (patch: Partial<FabricStockBrowserFilters>) => onFiltersChange({ ...filters, ...patch });
  const toggleDetails = (assetId: string) => setExpandedIds((current) => {
    const next = new Set(current);
    if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
    return next;
  });
  const rowClick = (event: MouseEvent<HTMLElement>, assetId: string) => {
    if ((event.target as HTMLElement).closest('button,input,a')) return;
    toggleDetails(assetId);
  };
  const rowKeyDown = (event: KeyboardEvent<HTMLElement>, assetId: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleDetails(assetId);
  };
  const findAsset = (assetId: string) => {
    if (!visible.some(asset => asset.asset_id === assetId)) return;
    setExpandedIds(current => new Set([...current, assetId]));
    requestAnimationFrame(() => {
      const row = rowRefs.current.get(assetId);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row?.focus({ preventScroll: true });
    });
  };

  return <>{renderSummary?.(visible, findAsset)}<div className="min-w-0 space-y-4">
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
        {rows.length === 0 ? <p className="py-4 text-sm text-slate-600">{label('loansStockNoMatch')}</p> : <div className="divide-y divide-slate-200 border-x border-slate-200">
          <div className={`${rowGridClass} hidden border-y border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 md:grid`}>
            <span>{label('loansStockName')}</span><span>{label('loansItemNumber')}</span>
            <span>{label('loansStockBrikNumber')}</span><span>{label('loansStockLoanInformation')}</span>
          </div>
          {rows.map((asset) => {
            const match = canonicalMatch(asset);
            const assignment = assignmentFor(asset);
            const sharedBrikCount = Math.max(asset.brik_group_size ?? 0, fabricLoanSharedBrikRows(assets, asset).length);
            const selected = selection?.selectedIds.has(asset.asset_id) ?? false;
            const issue = selection?.issueFor(asset) ?? null;
            const title = asset.line_text?.trim() || asset.item_name || asset.item_number;
            const expanded = expandedIds.has(asset.asset_id);
            const sharedText = asset.brik_number && sharedBrikCount > 1
              ? label('loansStockBrikSharedCompact').replace('{number}', String(asset.brik_number)).replace('{count}', String(sharedBrikCount)) : null;
            const partner = assignment ? `${assignment.partner_name}${assignment.partner_country ? ` · ${assignment.partner_country}` : ''}` : null;
            const issueText = issue && asset.allocated && !asset.sales_committed && assignment
              ? `${issue} · ${assignment.loan_number}` : issue;
            return <article key={asset.asset_id} data-asset-id={asset.asset_id} tabIndex={0}
              ref={row => { if (row) rowRefs.current.set(asset.asset_id, row); else rowRefs.current.delete(asset.asset_id); }}
              aria-expanded={expanded} onClick={(event) => rowClick(event, asset.asset_id)} onKeyDown={(event) => rowKeyDown(event, asset.asset_id)}
              className={`min-w-0 px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 ${selected ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'}`}>
              <div className={rowGridClass}>
                <div className="col-span-2 flex min-w-0 items-start gap-2 md:col-span-1">
                  <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  {selection?.mode === 'checkbox' ? <Checkbox checked={selected} disabled={Boolean(issue)}
                    onClick={(event) => event.stopPropagation()} onCheckedChange={() => selection.onToggle(asset)}
                    aria-label={`${selected ? 'Fjern' : 'Vælg'} aktiv: ${fabricLoanAssetDisplayIdentity(asset)}`}
                    aria-describedby={issue ? `sales-stock-issue-${asset.asset_id}` : undefined}
                    title={issueText ?? (selected ? 'Fjern aktiv' : 'Vælg aktiv')}
                    className="h-6 w-6 border-slate-400 data-[state=checked]:border-emerald-700 data-[state=checked]:bg-emerald-700 data-[state=checked]:text-white" />
                  : selection && <button type="button" disabled={Boolean(issue)} onClick={(event) => { event.stopPropagation(); selection.onToggle(asset); }}
                    aria-pressed={selected} aria-label={`${selected ? 'Fjern' : 'Vælg'} aktiv: ${fabricLoanAssetDisplayIdentity(asset)}`}
                    title={issue ?? (selected ? 'Fjern aktiv' : 'Vælg aktiv')}
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border ${selected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white'} disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}>
                    {selected && <Check className="h-4 w-4" />}
                  </button>}
                  <div className="min-w-0 flex-1">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">{label('loansStockName')}</span>
                    <p className="break-words text-sm font-semibold text-slate-950">{title}</p>
                    <p className="mt-0.5 break-all text-xs text-slate-600">{label('loansSerialNumber')}: <span className="font-mono">{asset.serial_number ?? '—'}</span></p>
                  </div>
                </div>
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">{label('loansItemNumber')}</span>
                  <p className="break-all text-sm font-medium text-slate-900">{asset.item_number}</p>
                  <p className="mt-0.5 break-all text-xs text-slate-600">{label('loansStockOrder')}: {asset.order_number ?? '—'}</p>
                </div>
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">{label('loansStockBrikNumber')}</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-slate-900">
                    {renderBrik ? renderBrik(asset) : asset.brik_number ?? '—'}
                    {sharedText && <Popover>
                      <PopoverTrigger asChild><button type="button" aria-label={sharedText} title={sharedText}
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-amber-700 hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-600"><Info className="h-4 w-4" /></button>
                      </PopoverTrigger>
                      <PopoverContent collisionPadding={12} className="w-64 max-w-[calc(100vw-24px)] border-amber-300 bg-amber-50 p-2 text-xs text-amber-950" onClick={(event) => event.stopPropagation()}>{sharedText}</PopoverContent>
                    </Popover>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{label('loansWarehouse')} {asset.warehouse_location_code}</p>
                </div>
                <div className="min-w-0">
                  <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden">{label('loansStockLoanInformation')}</span>
                  <p className={`break-words text-sm font-medium ${assignment ? 'text-slate-900' : 'text-emerald-800'}`}>{partner ?? label('loansStockAvailable')}</p>
                  <p className="mt-0.5 break-words text-xs text-slate-600">{assignment ? `${label('loansStockQuantity')}: 1 · ${assignment.loan_number}` : `${label('loansStockQuantity')}: ${asset.inventory_qty ?? '—'}`}</p>
                  {selection?.mode === 'checkbox' && issueText && <p id={`sales-stock-issue-${asset.asset_id}`} className="mt-1 break-words text-xs font-medium text-amber-800">{issueText}</p>}
                  {!issueText && informationFor && <p className="mt-1 break-words text-xs text-slate-600">{informationFor(asset)}</p>}
                </div>
              </div>
              {expanded && <div className="mt-3 border-t border-slate-200 pt-3">
                <dl className={detailGridClass}>
                  {[
                    [label('loansStockFullName'), title], ['Canonical SKU', match?.catalogItemNumber ?? '—'],
                    [label('loansSerialNumber'), asset.serial_number ?? '—'], [label('loansStockBrikNumber'), asset.brik_number ?? '—'],
                    [label('loansWarehouse'), asset.warehouse_location_code], [label('loansStockAccount'), asset.account_number ?? '—'],
                    [label('loansStockOrder'), asset.order_number ?? '—'], [label('loansStockDate'), date(asset.stock_last_changed)],
                    ['Classification', asset.classification],
                    [label('loansStockReservationStatus'), assignment ? label(loanStatusTranslationKey(assignment.status as LoanStatus)) : asset.allocated ? label('loansStockAllocated') : label('loansStockAvailable')],
                    [label('loansStockActiveLoanNumber'), assignment?.loan_number ?? '—'], [label('loansPartner'), partner ?? '—'],
                    [label('loansStockProductMasterMessage'), issue ?? (statusFor ? statusFor(asset) : match ? label('loansStockCanonicalMatch') : label('loansStockUnclassified'))],
                  ].map(([key, value]) => <div key={String(key)} className="min-w-0"><dt className="text-slate-500">{key}</dt><dd className="mt-0.5 break-words text-slate-900">{value}</dd></div>)}
                </dl>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {!issue && asset.account_number === '1020' && <span className="text-slate-600">{label('loansStockExternal')}</span>}
                  {asset.review_reason && <span className="break-words text-slate-600">{asset.review_reason}</span>}
                </div>
              </div>}
            </article>;
          })}
        </div>}
      </section>;
    })}
  </div></>;
}
