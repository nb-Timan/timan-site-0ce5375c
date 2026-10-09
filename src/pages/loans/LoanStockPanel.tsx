import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useFabricLoanStock } from '@/hooks/useFabricLoanStock';
import { canSelectFabricLoanAsset, fabricLoanAssetDisplayIdentity, isFabricStockFresh, type FabricLoanAsset } from '@/lib/fabricLoanStock';
import { t } from '@/lib/i18n/translations';
import FabricStockAssetBrowser, { type FabricStockBrowserFilters } from './FabricStockAssetBrowser';

export default function LoanStockPanel({ onSelect, busy = false, selectionReady = true }: {
  onSelect?: (asset: FabricLoanAsset) => void; busy?: boolean; selectionReady?: boolean;
}) {
  const { uiLanguage } = useLanguage();
  const label = (key: string) => t(key, uiLanguage);
  const { query, refresh, verify, setBrik, enabled, canRefresh, canEditBrik } = useFabricLoanStock();
  const [filters, setFilters] = useState<FabricStockBrowserFilters>({ warehouse: 'all', account: 'all', search: '' });
  const [editingBrikAssetId, setEditingBrikAssetId] = useState<string | null>(null);
  const [brikDraft, setBrikDraft] = useState('');
  if (!enabled) return null;
  const stock = query.data;
  const running = refresh.isPending || stock?.sync.running;
  const failed = query.isError || refresh.isError || stock?.sync.failed;
  const date = (value: string | null) => value ? new Date(value).toLocaleString(uiLanguage) : '—';
  const status = (asset: FabricLoanAsset) => {
    if (asset.identity_conflict || asset.classification === 'IDENTITY_CONFLICT') return 'loansStockConflict';
    if (asset.review_required || asset.classification === 'REVIEW_REQUIRED') return 'loansStockReview';
    if (asset.classification !== 'LOAN_CANDIDATE') return 'loansStockExcluded';
    if (asset.allocated) return 'loansStockAllocated';
    if (!asset.serial_number?.trim() && !asset.brik_number) return 'loansStockBrikRequired';
    return 'loansStockCandidate';
  };
  const startBrikEdit = (asset: FabricLoanAsset) => {
    setEditingBrikAssetId(asset.asset_id);
    setBrikDraft(asset.brik_number?.toString() ?? '');
  };
  const saveBrik = (asset: FabricLoanAsset) => {
    if (!/^[1-9]\d{0,5}$/.test(brikDraft)) return;
    setBrik.mutate({ assetId: asset.asset_id, brikNumber: Number(brikDraft) }, {
      onSuccess: () => setEditingBrikAssetId(null),
    });
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
    {onSelect && !selectionReady && <p className="text-sm text-slate-600">{label('loansStockHeaderRequired')}</p>}
    <FabricStockAssetBrowser assets={stock?.assets ?? []} filters={filters} onFiltersChange={setFilters} loading={query.isPending}
      countsReady={Boolean(stock?.sync.last_success_at)}
      selection={onSelect && stock ? {
        selectedIds: new Set<string>(),
        onToggle: onSelect,
        issueFor: (asset) => busy || !selectionReady || query.isError || !canSelectFabricLoanAsset(asset, stock.sync)
          ? label(status(asset))
          : null,
      } : undefined}
      statusFor={(asset) => label(status(asset))}
      renderBrik={(asset) => editingBrikAssetId === asset.asset_id ? <div className="flex min-w-0 flex-wrap items-center gap-1">
        <input type="number" min="1" max="999999" inputMode="numeric" value={brikDraft}
          aria-label={`${label('loansStockBrikNumber')}: ${fabricLoanAssetDisplayIdentity(asset)}`}
          onChange={(event) => setBrikDraft(event.target.value)} className="h-8 w-24 rounded border border-slate-300 px-2 text-sm" />
        <button type="button" disabled={setBrik.isPending || !/^[1-9]\d{0,5}$/.test(brikDraft)} onClick={() => saveBrik(asset)}
          className="h-8 rounded border border-emerald-700 px-2 font-medium text-emerald-800 disabled:opacity-50">{label('save')}</button>
        <button type="button" disabled={setBrik.isPending} onClick={() => setEditingBrikAssetId(null)}
          className="h-8 rounded border border-slate-300 px-2">{label('cancel')}</button>
        {setBrik.isError && <span role="alert" className="block text-xs text-red-700">{label('loansStockBrikDuplicate')}</span>}
      </div> : <span className="inline-flex items-center gap-1">{asset.brik_number ?? '—'}
        {canEditBrik && <button type="button" onClick={() => startBrikEdit(asset)} title={label('edit')}
          aria-label={`${label('edit')} ${label('loansStockBrikNumber')}: ${fabricLoanAssetDisplayIdentity(asset)}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>}
      </span>}
    />
  </section>;
}
