import { BadgeDollarSign, Box, Hash } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { formatMoney } from '@/lib/currency';
import { updateSalesStockAssetPricing } from '@/lib/salesStockConfigurator';
import type { ConfiguratorState } from '@/types/configurator';

export function SalesStockPricingPanel({ state, setState, canEdit }: {
  state: ConfiguratorState;
  setState: Dispatch<SetStateAction<ConfiguratorState>>;
  canEdit: boolean;
}) {
  if (state.salesChannel !== 'sales_stock_demo' || !state.salesStockAssets?.length) return null;
  return <section className="mb-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-left" aria-label="Salgslager / Demo">
    <div className="flex items-center gap-2">
      <BadgeDollarSign className="h-5 w-5 text-amber-800" />
      <h3 className="font-semibold text-slate-950">Salgslager / Demo</h3>
    </div>
    <p className="mt-1 text-sm text-slate-700">Prisændringer gælder kun denne fysiske salgssag. Product Master ændres ikke.</p>
    <div className="mt-4 space-y-4">
      {state.salesStockAssets.map((asset) => {
        const manualValue = asset.pricingMethod === 'adjusted_base'
          ? asset.adjustedBasePrice
          : asset.salesStockDiscountPct;
        const reasonRequired = manualValue !== null;
        return <article key={asset.sourceAssetId} className="border-t border-amber-200 pt-4 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-950">{asset.itemText}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                <span><Box className="mr-1 inline h-3.5 w-3.5" />{asset.itemNumber}</span>
                <span><Hash className="mr-1 inline h-3.5 w-3.5" />{asset.serialNumber || (asset.brikNumber ? `Brik ${asset.brikNumber}` : asset.assetInstanceId)}</span>
              </p>
            </div>
            <div className="text-right text-sm"><span className="block text-xs text-slate-500">Canonical list price</span><strong>{formatMoney(asset.originalListPrice, asset.pricingCurrency)}</strong></div>
          </div>
          <fieldset className="mt-3 grid gap-3 sm:grid-cols-2" disabled={!canEdit}>
            <label className={`border p-3 ${asset.pricingMethod === 'adjusted_base' ? 'border-emerald-600 bg-white' : 'border-amber-200'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name={`pricing-${asset.sourceAssetId}`} checked={asset.pricingMethod === 'adjusted_base'} onChange={() => setState((current) => updateSalesStockAssetPricing(current, asset.sourceAssetId, { pricingMethod: 'adjusted_base' }))} />Nedskrevet grundpris</span>
              <input aria-label={`Nedskrevet grundpris ${asset.itemNumber}`} type="number" min="0" max={asset.originalListPrice} step="0.01"
                value={asset.adjustedBasePrice ?? ''} onChange={(event) => setState((current) => updateSalesStockAssetPricing(current, asset.sourceAssetId, { adjustedBasePrice: event.target.value === '' ? null : Number(event.target.value) }))}
                className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder={formatMoney(asset.originalListPrice, asset.pricingCurrency)} />
            </label>
            <label className={`border p-3 ${asset.pricingMethod === 'sales_stock_discount' ? 'border-emerald-600 bg-white' : 'border-amber-200'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name={`pricing-${asset.sourceAssetId}`} checked={asset.pricingMethod === 'sales_stock_discount'} onChange={() => setState((current) => updateSalesStockAssetPricing(current, asset.sourceAssetId, { pricingMethod: 'sales_stock_discount' }))} />Salgslager-/demo-rabat</span>
              <div className="mt-2 flex items-center gap-2"><input aria-label={`Salgslager-/demo-rabat ${asset.itemNumber}`} type="number" min="0" max="100" step="0.1"
                value={asset.salesStockDiscountPct ?? ''} onChange={(event) => setState((current) => updateSalesStockAssetPricing(current, asset.sourceAssetId, { salesStockDiscountPct: event.target.value === '' ? null : Number(event.target.value) }))}
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Normal standardrabat" /><span className="text-sm">%</span></div>
            </label>
          </fieldset>
          <label className="mt-3 block text-sm font-medium text-slate-700">Årsag / note{reasonRequired ? ' *' : ''}
            <textarea aria-label={`Årsag ${asset.itemNumber}`} value={asset.pricingReason} disabled={!canEdit}
              onChange={(event) => setState((current) => updateSalesStockAssetPricing(current, asset.sourceAssetId, { pricingReason: event.target.value }))}
              className="mt-1 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          {reasonRequired && !asset.pricingReason.trim() && <p className="mt-1 text-xs font-medium text-red-700">En kort årsag er påkrævet for manuel prisændring.</p>}
        </article>;
      })}
    </div>
  </section>;
}
