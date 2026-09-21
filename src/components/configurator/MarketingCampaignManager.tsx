import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { MarketingConfiguratorBadge } from '@/components/configurator/MarketingConfiguratorBadge';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { MarketingConfiguratorCatalogItem } from '@/lib/marketingConfiguratorContentService';
import { deleteMarketingCampaign, emptyMarketingCampaign, listMarketingCampaigns, loadPublishedMarketingCampaigns, saveMarketingCampaign } from '@/lib/marketingCampaignService';
import type { CampaignProductLink, CampaignProductRole, CampaignType, ProductCampaign } from '@/lib/configuratorCampaigns';

type Props = {
  catalog: MarketingConfiguratorCatalogItem[];
  language: PortalUiLanguage;
  initialProduct?: MarketingConfiguratorCatalogItem;
  onSaved?: (campaign: ProductCampaign) => void;
  closeOnPublish?: boolean;
};
const localDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const isoDate = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '';

export default function MarketingCampaignManager({ catalog, language, initialProduct, onSaved, closeOnPublish = false }: Props) {
  const T = (key: string) => t(key, language);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductCampaign[]>([]);
  const [draft, setDraft] = useState<ProductCampaign | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = async (selectedId?: string | null) => {
    const result = await listMarketingCampaigns();
    setRows(result.rows);
    if (result.error) setMessage(result.error);
    const selected = result.rows.find(row => row.id === selectedId) ?? null;
    if (selectedId) setDraft(selected);
    return selected;
  };
  const newDraft = () => ({ ...emptyMarketingCampaign(), products: initialProduct ? [{ campaignId: '', productKey: initialProduct.productKey, machineKey: initialProduct.machineKey, itemNumber: initialProduct.itemNumber, role: 'linked' as const, quantity: 1 }] : [] });
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listMarketingCampaigns().then(result => {
      if (cancelled) return;
      setRows(result.rows); setMessage(result.error);
      if (initialProduct) setDraft(result.rows.find(row => row.products.some(product => product.productKey === initialProduct.productKey)) ?? { ...emptyMarketingCampaign(), products: [{ campaignId: '', productKey: initialProduct.productKey, machineKey: initialProduct.machineKey, itemNumber: initialProduct.itemNumber, role: 'linked', quantity: 1 }] });
    });
    return () => { cancelled = true; };
  }, [open, initialProduct]);
  const catalogByKey = useMemo(() => new Map(catalog.map(item => [item.productKey, item])), [catalog]);
  const results = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return [];
    return catalog.filter(item => `${item.itemNumber} ${item.defaults.title} ${item.machineKey}`.toLocaleLowerCase().includes(needle)).slice(0, 8);
  }, [catalog, search]);
  const updateType = (type: CampaignType) => setDraft(current => current ? {
    ...current, type,
    benefitPricingType: type === 'conditional' ? current.benefitPricingType ?? 'fixed' : null,
    products: current.products.map(product => ({ ...product, role: type === 'conditional' ? (product.role === 'linked' ? 'benefit' : product.role) : 'linked' })),
  } : current);
  const addProduct = (item: MarketingConfiguratorCatalogItem, role: CampaignProductRole) => setDraft(current => {
    if (!current || current.products.some(product => product.productKey === item.productKey && product.role === role)) return current;
    return { ...current, products: [...current.products, { campaignId: current.id, productKey: item.productKey, machineKey: item.machineKey, itemNumber: item.itemNumber, role, quantity: 1 }] };
  });
  const removeProduct = (productKey: string, role: CampaignProductRole) => setDraft(current => current ? { ...current, products: current.products.filter(product => product.productKey !== productKey || product.role !== role) } : current);
  const updateProduct = (productKey: string, role: CampaignProductRole, patch: Partial<CampaignProductLink>) => setDraft(current => current ? { ...current, products: current.products.map(product => product.productKey === productKey && product.role === role ? { ...product, ...patch } : product) } : current);
  const save = async (status: 'draft' | 'published') => {
    if (!draft) return;
    setSaving(true); setMessage(null);
    const result = await saveMarketingCampaign(draft, status);
    setSaving(false);
    if (result.error || !result.id) { setMessage(result.error || T('campaignSaveError')); return; }
    const saved = await refresh(result.id);
    await loadPublishedMarketingCampaigns();
    if (saved) onSaved?.(saved);
    if (status === 'published' && closeOnPublish) {
      setOpen(false);
      setMessage(null);
      return;
    }
    setMessage(T(status === 'published' ? 'campaignPublishedSuccess' : 'campaignSaved'));
  };
  const deleteDraft = async () => {
    if (!draft?.id || draft.status === 'published') return;
    const result = await deleteMarketingCampaign(draft.id);
    if (result.error) { setMessage(result.error); return; }
    setDraft(null); await refresh();
  };
  const roleTitle = (role: CampaignProductRole) => role === 'trigger' ? T('campaignTriggerProducts') : role === 'benefit' ? T('campaignBenefitProducts') : T('campaignLinkedProducts');

  return <>
    <div className={initialProduct ? 'py-2' : 'mx-auto mb-4 flex max-w-6xl justify-end'}>
      <Button type="button" onClick={() => { setMessage(null); setOpen(true); }}><Megaphone className="mr-2 h-4 w-4" />{T(initialProduct ? 'campaignSetup' : 'campaignManager')}</Button>
    </div>
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setMessage(null); }}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[94vh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader><DialogTitle>{T('campaignManager')}</DialogTitle></DialogHeader>
        {message && <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{message}</div>}
        <div className="grid min-h-0 gap-5 overflow-y-auto lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="min-h-0 space-y-2 overflow-y-auto border-r pr-4">
            <Button className="w-full" variant="outline" onClick={() => { setDraft(newDraft()); setMessage(null); }}><Plus className="mr-2 h-4 w-4" />{T('campaignNew')}</Button>
            {rows.map(row => <button key={row.id} type="button" onClick={() => { setDraft(row); setMessage(null); }} className={`w-full rounded-md border px-3 py-2 text-left ${draft?.id === row.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <div className="font-mono text-xs text-slate-500">{row.code}</div><div className="truncate text-sm font-semibold">{row.name}</div><div className="mt-1 text-xs text-slate-500">{row.status === 'published' ? T('campaignPublished') : T('campaignDraft')}</div>
            </button>)}
          </aside>
          <section className="min-h-0 overflow-y-auto pr-1">
            {!draft ? <div className="py-16 text-center text-sm text-slate-500">{T('campaignNew')}</div> : <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span>{T('campaignCode')}</span><Input value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} placeholder={T('campaignCodeAutomatic')} /></label>
                <label className="space-y-1 text-sm"><span>{T('campaignName')}</span><Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="space-y-1 text-sm"><span>{T('campaignStart')}</span><Input type="datetime-local" value={localDate(draft.startsAt)} onChange={event => setDraft({ ...draft, startsAt: isoDate(event.target.value), badge_starts_at: isoDate(event.target.value) })} /></label>
                <label className="space-y-1 text-sm"><span>{T('campaignEnd')}</span><Input type="datetime-local" value={localDate(draft.endsAt)} onChange={event => setDraft({ ...draft, endsAt: isoDate(event.target.value), badge_ends_at: isoDate(event.target.value) })} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.audience === 'qa'} onChange={event => setDraft({ ...draft, audience: event.target.checked ? 'qa' : 'public' })} />{T('campaignQaOnly')}</label>
              <label className="block space-y-1 text-sm"><span>{T('campaignType')}</span><Select value={draft.type} onValueChange={value => updateType(value as CampaignType)}><SelectTrigger>{T({ badge: 'campaignBadgeOnly', percentage: 'campaignPercentage', fixed: 'campaignFixed', conditional: 'campaignConditional' }[draft.type])}</SelectTrigger><SelectContent>{(['badge', 'percentage', 'fixed', 'conditional'] as CampaignType[]).map(type => <SelectItem key={type} value={type}>{T({ badge: 'campaignBadgeOnly', percentage: 'campaignPercentage', fixed: 'campaignFixed', conditional: 'campaignConditional' }[type])}</SelectItem>)}</SelectContent></Select></label>
              <div className="flex min-h-12 items-center rounded-md border border-slate-200 bg-slate-50 px-3">
                <MarketingConfiguratorBadge badge="Kampagne" language={language} campaign={draft} preview />
              </div>
              {draft.type === 'conditional' && <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{T('campaignTriggerQuantity')}</span><Input type="number" min="1" value={draft.triggerMinQuantity} onChange={event => setDraft({ ...draft, triggerMinQuantity: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="space-y-1 text-sm"><span>{T('campaignBenefitQuantity')}</span><Input type="number" min="1" value={draft.benefitQuantity} onChange={event => setDraft({ ...draft, benefitQuantity: Math.max(1, Number(event.target.value) || 1) })} /></label><label className="space-y-1 text-sm"><span>{T('campaignTriggerMatch')}</span><Select value={draft.triggerMatchMode} onValueChange={value => setDraft({ ...draft, triggerMatchMode: value as 'any' | 'all' })}><SelectTrigger>{T(draft.triggerMatchMode === 'all' ? 'campaignMatchAll' : 'campaignMatchAny')}</SelectTrigger><SelectContent><SelectItem value="any">{T('campaignMatchAny')}</SelectItem><SelectItem value="all">{T('campaignMatchAll')}</SelectItem></SelectContent></Select></label><label className="space-y-1 text-sm"><span>{T('campaignScaleBenefit')}</span><Select value={draft.scaleBenefitWithTrigger ? 'repeat' : 'once'} onValueChange={value => setDraft({ ...draft, scaleBenefitWithTrigger: value === 'repeat' })}><SelectTrigger>{T(draft.scaleBenefitWithTrigger ? 'campaignScaleRepeat' : 'campaignScaleOnce')}</SelectTrigger><SelectContent><SelectItem value="once">{T('campaignScaleOnce')}</SelectItem><SelectItem value="repeat">{T('campaignScaleRepeat')}</SelectItem></SelectContent></Select></label><label className="space-y-1 text-sm sm:col-span-2"><span>{T('campaignBenefitType')}</span><Select value={draft.benefitPricingType || 'fixed'} onValueChange={value => setDraft({ ...draft, benefitPricingType: value as 'percentage' | 'fixed' })}><SelectTrigger>{T(draft.benefitPricingType === 'percentage' ? 'campaignPercentage' : 'campaignFixed')}</SelectTrigger><SelectContent><SelectItem value="percentage">{T('campaignPercentage')}</SelectItem><SelectItem value="fixed">{T('campaignFixed')}</SelectItem></SelectContent></Select></label></div>}
              {(draft.type === 'percentage' || (draft.type === 'conditional' && draft.benefitPricingType === 'percentage')) && <label className="block space-y-1 text-sm"><span>{T('campaignDiscountPct')}</span><Input type="number" min="0.01" max="100" step="0.01" value={draft.discountPct ?? ''} onChange={event => setDraft({ ...draft, discountPct: event.target.value === '' ? null : Number(event.target.value) })} /></label>}
              {(draft.type === 'fixed' || (draft.type === 'conditional' && draft.benefitPricingType === 'fixed')) && <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{T('campaignTargetDkk')}</span><Input type="number" min="0" step="0.01" value={draft.targetPriceDkk ?? ''} onChange={event => setDraft({ ...draft, targetPriceDkk: event.target.value === '' ? null : Number(event.target.value) })} /></label><label className="space-y-1 text-sm"><span>{T('campaignTargetEur')}</span><Input type="number" min="0" step="0.01" value={draft.targetPriceEur ?? ''} onChange={event => setDraft({ ...draft, targetPriceEur: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>}
              <div className="space-y-2"><label className="relative block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={T('campaignSearchProducts')} /></label>{search && <div className="max-h-48 overflow-y-auto rounded-md border">{results.length ? results.map(item => <div key={item.productKey} className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0"><span><strong>{item.itemNumber}</strong> · {item.defaults.title}<span className="ml-1 text-slate-400">({item.machineKey})</span></span><span className="flex gap-1">{draft.type === 'conditional' ? <><Button size="sm" variant="outline" onClick={() => addProduct(item, 'trigger')}>{T('campaignAddTrigger')}</Button><Button size="sm" variant="outline" onClick={() => addProduct(item, 'benefit')}>{T('campaignAddBenefit')}</Button></> : <Button size="sm" variant="outline" onClick={() => addProduct(item, 'linked')}>{T('campaignAddProduct')}</Button>}</span></div>) : <div className="p-3 text-sm text-slate-500">{T('campaignNoResults')}</div>}</div>}</div>
              {(['trigger', 'benefit', 'linked'] as CampaignProductRole[]).map(role => {
                const products = draft.products.filter(product => product.role === role);
                if (!products.length) return null;
                return <div key={role} className="space-y-2"><h3 className="text-sm font-semibold">{roleTitle(role)}</h3>{products.map(product => {
                  const item = catalogByKey.get(product.productKey);
                  return <div key={`${role}-${product.productKey}`} className="space-y-2 border-b py-3 text-sm" aria-label={`${roleTitle(role)} ${product.itemNumber}`}>
                    <div className="flex items-center justify-between gap-2"><span><strong>{product.itemNumber}</strong> · {item?.defaults.title || product.productKey}</span><Button size="icon" variant="ghost" onClick={() => removeProduct(product.productKey, role)} aria-label={`${T('campaignRemoveProduct')} ${product.itemNumber}`}><X className="h-4 w-4" /></Button></div>
                    {role !== 'trigger' && draft.type !== 'badge' && <ProductPricing product={product} campaign={draft} language={language} onChange={patch => updateProduct(product.productKey, role, patch)} />}
                  </div>;
                })}</div>;
              })}
            </div>}
          </section>
        </div>
        {draft && <DialogFooter className="gap-2 sm:justify-between"><div>{draft.status !== 'published' && draft.id && <Button variant="ghost" className="text-rose-700" onClick={() => void deleteDraft()}><Trash2 className="mr-2 h-4 w-4" />{T('campaignDeleteDraft')}</Button>}</div><div className="flex gap-2">{draft.status !== 'published' && <Button variant="outline" disabled={saving} onClick={() => void save('draft')}>{T('campaignSaveDraft')}</Button>}<Button disabled={saving} onClick={() => void save('published')}>{T('campaignPublish')}</Button></div></DialogFooter>}
      </DialogContent>
    </Dialog>
  </>;
}

function ProductPricing({ product, campaign, language, onChange }: { product: CampaignProductLink; campaign: ProductCampaign; language: PortalUiLanguage; onChange: (patch: Partial<CampaignProductLink>) => void }) {
  const T = (key: string) => t(key, language);
  const type = product.discountPct != null ? 'percentage' : product.targetPriceDkk != null || product.targetPriceEur != null ? 'fixed' : 'default';
  const value = (text: string) => text === '' ? null : Number(text);
  return <div className="grid gap-2 sm:grid-cols-2">
    <label className="space-y-1 sm:col-span-2"><span>{T('campaignBenefitType')}</span>
      <Select value={type} onValueChange={next => onChange({ discountPct: next === 'percentage' ? campaign.discountPct ?? 1 : null, targetPriceDkk: next === 'fixed' ? campaign.targetPriceDkk ?? 0 : null, targetPriceEur: next === 'fixed' ? campaign.targetPriceEur ?? 0 : null })}>
        <SelectTrigger aria-label={`${T('campaignBenefitType')} ${product.itemNumber}`}>{T(type === 'default' ? 'campaignDefaultPricing' : type === 'fixed' ? 'campaignFixed' : 'campaignPercentage')}</SelectTrigger>
        <SelectContent><SelectItem value="default">{T('campaignDefaultPricing')}</SelectItem><SelectItem value="percentage">{T('campaignPercentage')}</SelectItem><SelectItem value="fixed">{T('campaignFixed')}</SelectItem></SelectContent>
      </Select>
    </label>
    {type === 'percentage' && <label className="space-y-1"><span>{T('campaignDiscountPct')}</span><Input type="number" min="0.01" max="100" step="0.01" value={product.discountPct ?? ''} onChange={event => onChange({ discountPct: value(event.target.value) })} /></label>}
    {type === 'fixed' && <>
      <label className="space-y-1"><span>{T('campaignTargetDkk')}</span><Input type="number" min="0" step="0.01" value={product.targetPriceDkk ?? ''} onChange={event => onChange({ targetPriceDkk: value(event.target.value) })} /></label>
      <label className="space-y-1"><span>{T('campaignTargetEur')}</span><Input type="number" min="0" step="0.01" value={product.targetPriceEur ?? ''} onChange={event => onChange({ targetPriceEur: value(event.target.value) })} /></label>
    </>}
  </div>;
}
