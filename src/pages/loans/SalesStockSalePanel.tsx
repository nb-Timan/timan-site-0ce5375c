import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFabricLoanStock } from '@/hooks/useFabricLoanStock';
import { useLanguage } from '@/context/LanguageContext';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';
import { resolveSalesStockCatalogItem, salesStockAssetSelectionIssue, salesStockSelectedGroupIssue, storeSalesStockHandoff } from '@/lib/salesStockConfigurator';
import { t } from '@/lib/i18n/translations';
import FabricStockAssetBrowser, { type FabricStockBrowserFilters } from './FabricStockAssetBrowser';

export default function SalesStockSalePanel() {
  const { uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const { query, enabled } = useFabricLoanStock();
  const [filters, setFilters] = useState<FabricStockBrowserFilters>({ warehouse: 'all', account: 'all', search: '' });
  const [selected, setSelected] = useState<FabricLoanAsset[]>([]);
  const [handoffIssue, setHandoffIssue] = useState<string | null>(null);
  const label = (key: string) => t(key, uiLanguage);
  const stock = query.data;
  const selectedIds = useMemo(() => new Set(selected.map((asset) => asset.asset_id)), [selected]);
  if (!enabled) return null;

  const currentById = new Map(stock?.assets.map((asset) => [asset.asset_id, asset]) ?? []);
  const currentSelected = selected.map((asset) => currentById.get(asset.asset_id) ?? asset);
  const issueFor = (asset: FabricLoanAsset) => stock && !query.isError
    ? salesStockAssetSelectionIssue(asset, stock.sync, 'DKK') ?? salesStockSelectedGroupIssue(asset, currentSelected)
    : 'Salgslagerdata er ikke klar';
  const checkedSelection = selected.map((snapshot) => {
    const asset = currentById.get(snapshot.asset_id);
    return { snapshot, asset, issue: asset ? issueFor(asset) : 'Aktivet findes ikke længere i salgslageret' };
  });
  const selectionValid = selected.length > 0 && checkedSelection.every((item) => !item.issue);
  const toggle = (asset: FabricLoanAsset) => {
    setHandoffIssue(null);
    if (selected.some((item) => item.asset_id === asset.asset_id)) {
      setSelected((current) => current.filter((item) => item.asset_id !== asset.asset_id));
      return;
    }
    if (issueFor(asset)) return;
    setSelected((current) => [...current, asset]);
  };
  const openConfigurator = () => {
    if (!selectionValid) return;
    const rejected = checkedSelection.find((item) => !item.asset || issueFor(item.asset));
    if (rejected) {
      setHandoffIssue(rejected.asset ? issueFor(rejected.asset) : rejected.issue);
      return;
    }
    storeSalesStockHandoff(checkedSelection.map((item) => item.asset!));
    navigate('/configurator?salesStock=1');
  };

  return <section className="min-w-0 space-y-4" aria-label="Sælg salgslagermaskine">
    <div className="border-l-4 border-emerald-700 bg-emerald-50 p-4">
      <h2 className="font-semibold text-slate-950">Sælg salgslagermaskine</h2>
      <p className="mt-1 text-sm text-slate-700">Vælg de konkrete fysiske aktiver, som skal følge samme salgssag til tilbud og ordre.</p>
    </div>
    {!stock?.sync.last_success_at && !query.isPending && <p role="alert" className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Salgslagerdata er ikke klar.</p>}
    <FabricStockAssetBrowser assets={stock?.assets ?? []} activeAssignments={stock?.active_assignments ?? []}
      filters={filters} onFiltersChange={setFilters} loading={query.isPending}
      countsReady={Boolean(stock?.sync.last_success_at)}
      informationFor={(asset) => !resolveSalesStockCatalogItem(asset.item_number, 'DKK')
        ? 'Intet Product Master-match · Salgspris kræver fastsættelse' : null}
      selection={{ mode: 'checkbox', selectedIds, onToggle: toggle, issueFor }} />
    <section className="border border-slate-200 bg-white p-4" aria-label="Valgte salgslageraktiver">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Valgte salgslageraktiver</h3><p className="text-sm text-slate-600">Valgte aktiver: {selected.length}</p></div>
        <button type="button" disabled={!selectionValid} onClick={openConfigurator} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Til Configurator<ArrowRight className="h-4 w-4" /></button></div>
      {handoffIssue && <p role="alert" className="mt-2 text-sm text-amber-800">{handoffIssue}</p>}
      {selected.length === 0 ? <p className="mt-3 text-sm text-slate-600">Vælg mindst ét salgslageraktiv.</p> : <div className="mt-3 divide-y divide-slate-200">{checkedSelection.map(({ snapshot, asset: current, issue }) => {
        const asset = current ?? snapshot;
        return <div key={asset.asset_id} className="flex min-w-0 items-start justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-950">{asset.item_number} · {asset.line_text?.trim() || asset.item_name}</p><p className="mt-1 break-words text-xs text-slate-600">Serienr. {asset.serial_number || '—'} · Brik {asset.brik_number ?? '—'} · Lager {asset.warehouse_location_code} · Konto {asset.account_number ?? '—'} · Ordre {asset.order_number ?? '—'} · Stk. {asset.inventory_qty ?? '—'}</p>
          {issue && <p role="alert" className="mt-1 break-words text-xs font-medium text-amber-800">{issue}</p>}
        </div>
        <button type="button" title="Fjern" aria-label={`Fjern ${asset.item_number}`} onClick={() => toggle(asset)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300"><X className="h-4 w-4" /></button>
      </div>; })}</div>}
    </section>
  </section>;
}
