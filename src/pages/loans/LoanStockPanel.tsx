import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useFabricLoanStock } from '@/hooks/useFabricLoanStock';
import { canSelectFabricLoanAsset, filterFabricLoanStock, isFabricStockFresh, type FabricLoanAsset } from '@/lib/fabricLoanStock';
import { t } from '@/lib/i18n/translations';

export default function LoanStockPanel({ onSelect, busy = false, selectionReady = true }: {
  onSelect?: (asset: FabricLoanAsset) => void; busy?: boolean; selectionReady?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const { query, refresh, verify, enabled, canRefresh } = useFabricLoanStock();
  const [warehouse, setWarehouse] = useState('all');
  const [search, setSearch] = useState('');
  const [account, setAccount] = useState('all');
  if (!enabled) return null;
  const stock = query.data;
  const running = refresh.isPending || stock?.sync.running;
  const failed = query.isError || refresh.isError || stock?.sync.failed;
  const visible = filterFabricLoanStock(stock?.assets ?? [], warehouse, search, account);
  const date = (value: string | null) => value ? new Date(value).toLocaleString(uiLanguage) : '—';
  const status = (asset: FabricLoanAsset) => {
    if (asset.identity_conflict || asset.classification === 'IDENTITY_CONFLICT') return 'loansStockConflict';
    if (asset.review_required || asset.classification === 'REVIEW_REQUIRED') return 'loansStockReview';
    if (asset.classification !== 'LOAN_CANDIDATE') return 'loansStockExcluded';
    if (asset.allocated) return 'loansStockAllocated';
    return 'loansStockCandidate';
  };
  return <section className="min-w-0 space-y-3" aria-label={label('loansStockView')}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-slate-600">{label('loansStockUpdated')}: <time dateTime={stock?.sync.last_success_at ?? undefined}>{date(stock?.sync.last_success_at ?? null)}</time></p>
      {canRefresh && <button type="button" onClick={() => refresh.mutate()} disabled={running || !stock?.sync.configured}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">
        {running ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
        {label(running ? 'loansStockUpdating' : 'loansStockRefresh')}
      </button>}
      {running && !canRefresh && <p role="status" className="text-sm">{label('loansStockUpdating')}</p>}
    </div>
    {canRefresh && verify && (!stock?.sync.configured || verify.isSuccess || verify.isError) && <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={verify.isPending || running} onClick={() => verify.mutate()}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">
        {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{label('loansStockVerify')}
      </button>
      {verify.isSuccess && <p role="status" className="inline-flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{label('loansStockVerified')}</p>}
      {verify.isError && <p role="alert" className="min-w-0 text-sm text-red-700">{label('loansStockVerifyFailed')} <code className="break-all">{verify.error?.message}</code></p>}
    </div>}
    {failed && <p role="alert" className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" />{label(stock?.sync.last_success_at ? 'loansStockFailed' : 'loansStockNotReady')}</p>}
    {stock && (!stock.sync.configured || !isFabricStockFresh(stock.sync)) && <p role="status" className="text-sm text-amber-900">{label(!stock.sync.configured ? 'loansStockNotReady' : 'loansStockStale')}</p>}
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={label('loansWarehouse')}>
      {(['2', '4'] as const).map((code) => <button type="button" key={code} aria-pressed={warehouse === code}
        onClick={() => setWarehouse(warehouse === code ? 'all' : code)}
        className={`min-w-0 border-b-2 p-3 text-left ${warehouse === code ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
        <span className="flex items-center justify-between gap-2 font-semibold">{label(`loansWarehouse${code}`)}<span>{stock?.sync.last_success_at ? stock.assets.filter((asset) => asset.source_present && asset.warehouse_location_code === code).length : '—'}</span></span>
        <span className="mt-1 block text-sm text-slate-600">{label(code === '2' ? 'loansStockNew' : 'loansStockUsed')}</span>
      </button>)}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
        <Search className="h-4 w-4 shrink-0 text-slate-500" /><span className="sr-only">{label('loansStockSearch')}</span>
        <input className="h-10 min-w-0 w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={label('loansStockSearch')} />
      </label>
      <select aria-label={label('loansStockAccount')} value={account} onChange={(event) => setAccount(event.target.value)} className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm">
        <option value="all">{label('loansStockAccount')}: {label('loansAll')}</option><option value="1010">1010</option><option value="1020">1020</option>
      </select>
    </div>
    {onSelect && !selectionReady && <p className="text-sm text-slate-600">{label('loansStockHeaderRequired')}</p>}
    {query.isPending && <p role="status" className="text-sm text-slate-600">{label('loansLoading')}</p>}
    {stock && visible.length === 0 && <p className="py-4 text-sm text-slate-600">{label('loansStockNoMatch')}</p>}
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {visible.map((asset) => <article key={asset.asset_id} className="min-w-0 bg-white py-3" data-asset-id={asset.asset_id}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{asset.item_name ?? asset.item_number}</p>
            <p className="mt-1 break-all font-mono text-sm text-slate-700">{asset.serial_number}</p></div>
          {onSelect && <button type="button" title={label('loansStockChoose')} aria-label={`${label('loansStockChoose')}: ${asset.serial_number}`}
            disabled={busy || !selectionReady || query.isError || !canSelectFabricLoanAsset(asset, stock!.sync)} onClick={() => onSelect(asset)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-700 text-emerald-800 disabled:border-slate-200 disabled:text-slate-400"><Plus className="h-5 w-5" /></button>}
        </div>
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
          {[[label('loansItemNumber'),asset.item_number], [label('loansWarehouse'),asset.warehouse_location_name ?? asset.warehouse_location_code],
            [label('loansStockAccount'),asset.account_number ?? '—'], [label('loansStockQuantity'),asset.inventory_qty ?? '—'],
            [label('loansStockOrder'),asset.order_number ?? '—'], [label('loansStockDate'),date(asset.stock_last_changed)]].map(([key,value]) =>
            <div key={key} className="min-w-0"><dt className="text-slate-500">{key}</dt><dd className="mt-0.5 break-words text-slate-900">{value}</dd></div>)}
        </dl>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          <span>{label(status(asset))}</span>{asset.account_number === '1020' && <span>{label('loansStockExternal')}</span>}
          {asset.review_reason && <span className="break-words">{asset.review_reason}</span>}
          {!asset.item_type && <span>{label('loansStockUnclassified')}</span>}
          {asset.item_type === 'equipment' && <span>{label('loansEquipment')}</span>}
        </div>
      </article>)}
    </div>
  </section>;
}
