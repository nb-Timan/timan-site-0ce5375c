import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFabricLoanStock } from '@/hooks/useFabricLoanStock';
import { useLanguage } from '@/context/LanguageContext';
import { canSelectFabricLoanAsset, fabricLoanAssetDisplayIdentity, filterFabricLoanStock, type FabricLoanAsset } from '@/lib/fabricLoanStock';
import { canLaunchSalesStockAsset, resolveSalesStockCatalogItem, storeSalesStockHandoff } from '@/lib/salesStockConfigurator';
import { t } from '@/lib/i18n/translations';

export default function SalesStockSalePanel() {
  const { uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const { query, enabled } = useFabricLoanStock();
  const [warehouse, setWarehouse] = useState('all');
  const [account, setAccount] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FabricLoanAsset[]>([]);
  const label = (key: string) => t(key, uiLanguage);
  const stock = query.data;
  const visible = filterFabricLoanStock(stock?.assets ?? [], warehouse, search, account);
  const selectedIds = useMemo(() => new Set(selected.map((asset) => asset.asset_id)), [selected]);
  if (!enabled) return null;

  const selectable = (asset: FabricLoanAsset) => Boolean(stock)
    && canSelectFabricLoanAsset(asset, stock!.sync)
    && canLaunchSalesStockAsset(asset, 'DKK');
  const toggle = (asset: FabricLoanAsset) => {
    if (!selectable(asset)) return;
    setSelected((current) => current.some((item) => item.asset_id === asset.asset_id)
      ? current.filter((item) => item.asset_id !== asset.asset_id)
      : [...current, asset]);
  };
  const openConfigurator = () => {
    if (!selected.length) return;
    storeSalesStockHandoff(selected);
    navigate('/configurator?salesStock=1');
  };

  return <section className="min-w-0 space-y-4" aria-label="Sælg salgslagermaskine">
    <div className="border-l-4 border-emerald-700 bg-emerald-50 p-4">
      <h2 className="font-semibold text-slate-950">Sælg salgslagermaskine</h2>
      <p className="mt-1 text-sm text-slate-700">Vælg de konkrete fysiske aktiver, som skal følge samme salgssag til tilbud og ordre.</p>
    </div>
    {!stock?.sync.last_success_at && !query.isPending && <p role="alert" className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Salgslagerdata er ikke klar.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {(['2', '4'] as const).map((code) => <button key={code} type="button" aria-pressed={warehouse === code} onClick={() => setWarehouse(warehouse === code ? 'all' : code)}
        className={`border-b-2 p-3 text-left ${warehouse === code ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
        <span className="font-semibold">{label(`loansWarehouse${code}`)}</span><span className="ml-2 text-sm text-slate-600">{label(code === '2' ? 'loansStockNew' : 'loansStockUsed')}</span>
      </button>)}
    </div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3"><Search className="h-4 w-4 text-slate-500" />
        <span className="sr-only">{label('loansStockSearch')}</span><input className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={label('loansStockSearch')} /></label>
      <select aria-label={label('loansStockAccount')} value={account} onChange={(event) => setAccount(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="all">{label('loansStockAccount')}: {label('loansAll')}</option><option value="1010">1010</option><option value="1020">1020</option></select>
    </div>
    {query.isPending && <p className="text-sm text-slate-600">{label('loansLoading')}</p>}
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {visible.map((asset) => {
        const isSelected = selectedIds.has(asset.asset_id);
        const catalogMatch = resolveSalesStockCatalogItem(asset.item_number, 'DKK');
        const disabled = !selectable(asset);
        return <article key={asset.asset_id} className={`grid min-w-0 gap-3 bg-white py-3 sm:grid-cols-[1fr_auto] ${disabled ? 'opacity-60' : ''}`}>
          <button type="button" disabled={disabled} onClick={() => toggle(asset)} className="min-w-0 text-left disabled:cursor-not-allowed" aria-pressed={isSelected}>
            <span className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border ${isSelected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-400 bg-white'}`}>{isSelected && <Check className="h-4 w-4" />}</span>
              <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-950">{asset.line_text?.trim() || asset.item_name || asset.item_number}</span><span className="mt-1 block break-all font-mono text-xs text-slate-600">{fabricLoanAssetDisplayIdentity(asset)}</span></span></span>
          </button>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:min-w-[380px] sm:grid-cols-4">
            <div><dt className="text-slate-500">{label('loansItemNumber')}</dt><dd>{asset.item_number}</dd></div><div><dt className="text-slate-500">Brik nr.</dt><dd>{asset.brik_number ?? '—'}</dd></div>
            <div><dt className="text-slate-500">{label('loansWarehouse')}</dt><dd>{asset.warehouse_location_code}</dd></div><div><dt className="text-slate-500">{label('loansStockAccount')}</dt><dd>{asset.account_number ?? '—'}</dd></div>
            <div><dt className="text-slate-500">{label('loansStockOrder')}</dt><dd>{asset.order_number ?? '—'}</dd></div><div><dt className="text-slate-500">Type</dt><dd>{catalogMatch?.itemType ?? asset.item_type ?? '—'}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Classification</dt><dd>{asset.sales_committed ? 'Allerede reserveret til salg' : asset.classification}</dd></div>
          </dl>
        </article>;
      })}
    </div>
    <section className="border border-slate-200 bg-white p-4" aria-label="Valgte salgslageraktiver">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Valgte salgslageraktiver</h3><p className="text-sm text-slate-600">{selected.length} valgt</p></div>
        <button type="button" disabled={!selected.length} onClick={openConfigurator} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Åbn i konfigurator<ArrowRight className="h-4 w-4" /></button></div>
      {selected.length === 0 ? <p className="mt-3 text-sm text-slate-600">Vælg mindst ét salgslageraktiv.</p> : <div className="mt-3 divide-y divide-slate-200">{selected.map((asset) => <div key={asset.asset_id} className="flex min-w-0 items-start justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-950">{asset.item_number} · {asset.line_text?.trim() || asset.item_name}</p><p className="mt-1 break-words text-xs text-slate-600">Serienr. {asset.serial_number || '—'} · Brik {asset.brik_number ?? '—'} · Lager {asset.warehouse_location_code} · Konto {asset.account_number ?? '—'} · Ordre {asset.order_number ?? '—'} · {asset.classification}</p></div>
        <button type="button" title="Fjern" aria-label={`Fjern ${asset.item_number}`} onClick={() => toggle(asset)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300"><X className="h-4 w-4" /></button>
      </div>)}</div>}
    </section>
  </section>;
}
