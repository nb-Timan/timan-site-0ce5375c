import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, FileText, Film, Image, Minus, Plus, Save, Send, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { MARKETING_BADGE_PRESETS, MarketingConfiguratorBadge, MarketingConfiguratorBadgeOption } from '@/components/configurator/MarketingConfiguratorBadge';
import { MarketingConfiguratorProductCard } from '@/components/configurator/MarketingConfiguratorProductCard';
import { getPrice } from '@/data/machines';
import { itemNoLabel } from '@/data/translations';
import { convertCurrency, currencyFromLanguage, formatMoney } from '@/lib/currency';
import {
  mergeMarketingConfiguratorContent,
  saveMarketingConfiguratorContent,
  uploadMarketingConfiguratorImage,
  type MarketingConfiguratorCatalogItem,
  type MarketingConfiguratorContentFields,
  type MarketingConfiguratorContentRecord,
} from '@/lib/marketingConfiguratorContentService';
import { usePortalCurrency } from '@/lib/usePortalCurrency';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { Language, TechSpec } from '@/types/configurator';
import { t } from '@/data/translations';
import { t as portalT } from '@/lib/i18n/translations';
import { addMarketingBadgeDuration, formatMarketingBadgeDateTime, marketingBadgeScheduleState, type MarketingBadgeDurationUnit } from '@/lib/marketingBadgeSchedule';

export const MARKETING_BADGE_OPTIONS = ['', ...MARKETING_BADGE_PRESETS.map((option) => option.value), 'Egen tekst'] as const;

type Props = {
  item: MarketingConfiguratorCatalogItem | null;
  records: MarketingConfiguratorContentRecord[];
  uiLanguage: PortalUiLanguage;
  priceSourceLanguage: Language;
  onClose: () => void;
  onSaved: (record: MarketingConfiguratorContentRecord) => void;
};

function asLocalDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function asIso(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fieldFor(item: MarketingConfiguratorCatalogItem, records: MarketingConfiguratorContentRecord[]) {
  const draft = records.find((record) => record.product_key === item.productKey && record.status === 'draft') || null;
  const published = records.find((record) => record.product_key === item.productKey && record.status === 'published') || null;
  return {
    draft,
    published,
    content: mergeMarketingConfiguratorContent(item.defaults, draft?.content || published?.content),
  };
}

function AssetState({ label, published, draft }: { label: string; published: boolean; draft: boolean }) {
  const state = draft ? 'text-amber-700' : published ? 'text-emerald-700' : 'text-slate-400';
  const Icon = label === 'Video' ? Film : label === 'Billede' ? Image : FileText;
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${state}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

export default function MarketingConfiguratorContentEditor({ item, records, uiLanguage, priceSourceLanguage, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<MarketingConfiguratorContentFields | null>(null);
  const [customBadge, setCustomBadge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<'now' | 'specific'>('now');
  const [endMode, setEndMode] = useState<'duration' | 'specific'>('duration');
  const [durationAmount, setDurationAmount] = useState(7);
  const [durationUnit, setDurationUnit] = useState<MarketingBadgeDurationUnit>('days');
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const displayCurrency = usePortalCurrency();
  const previewPrice = item
    ? formatMoney(
      convertCurrency(
        getPrice(item.item, priceSourceLanguage),
        currencyFromLanguage(priceSourceLanguage),
        displayCurrency,
      ),
      displayCurrency,
    )
    : '';

  useEffect(() => {
    setError(null);
    const next = item ? fieldFor(item, records).content : null;
    setDraft(next);
    setCustomBadge(Boolean(next?.badge && !MARKETING_BADGE_OPTIONS.includes(next.badge as typeof MARKETING_BADGE_OPTIONS[number])));
    setStartMode(next?.badge_starts_at ? 'specific' : 'now');
    setEndMode(next?.badge_ends_at ? 'specific' : 'duration');
  }, [item, records]);

  const save = async (status: 'draft' | 'published') => {
    if (!item || !draft) return;
    setSaving(true);
    setError(null);
    const result = await saveMarketingConfiguratorContent(item, draft, status);
    setSaving(false);
    if (result.error || !result.row) {
      setError(result.error || 'Indholdet kunne ikke gemmes.');
      return;
    }
    onSaved(result.row);
    onClose();
  };

  const uploadImage = async (file: File | null | undefined) => {
    if (!file || !draft) return;
    const result = await uploadMarketingConfiguratorImage(file);
    if (!result.url || result.error) {
      setError(result.error || 'Billedet kunne ikke uploades.');
      return;
    }
    setDraft({ ...draft, image_url: result.url });
  };

  const updateSpec = (index: number, key: keyof TechSpec, value: string) => {
    if (!draft) return;
    const specs = draft.specs.map((spec, itemIndex) => itemIndex === index ? { ...spec, [key]: value } : spec);
    setDraft({ ...draft, specs });
  };

  const updateFeature = (index: number, value: string) => {
    if (!draft) return;
    const key_features = draft.key_features.map((feature, featureIndex) => featureIndex === index ? value : feature);
    setDraft({ ...draft, key_features });
  };

  const updateDuration = (amount: number, unit: MarketingBadgeDurationUnit) => {
    if (!draft) return;
    const start = new Date(draft.badge_starts_at || Date.now());
    setDurationAmount(amount);
    setDurationUnit(unit);
    setDraft({ ...draft, badge_starts_at: start.toISOString(), badge_ends_at: addMarketingBadgeDuration(start, amount, unit).toISOString() });
  };

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-5xl xl:max-w-6xl">
        <DialogHeader><DialogTitle>Redigér præsentationsindhold</DialogTitle></DialogHeader>
        {item && draft && <div className="space-y-5">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <strong>{item.defaults.title}</strong><br />
            <span className="text-slate-500">{item.machineKey} · Varenr. {item.itemNumber}. Varenummer, pris, rabat og afhængigheder er låst canonical data.</span>
          </div>
          <div className="flex flex-wrap gap-4 rounded-md border border-slate-200 px-3 py-2">
            <AssetState label="Video" published={Boolean(item.defaults.video_url)} draft={Boolean(draft.video_url && draft.video_url !== item.defaults.video_url)} />
            <AssetState label="Billede" published={Boolean(item.defaults.image_url)} draft={Boolean(draft.image_url && draft.image_url !== item.defaults.image_url)} />
            <AssetState label="Specifikationer" published={Boolean(item.defaults.specs.length)} draft={Boolean(draft.specs.length || draft.key_features.length)} />
          </div>
          {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
            <div className="space-y-5">
              <Field label="Visningstitel"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
              <Field label="Hovedinformation"><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
              <section className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Nøglefunktioner</p><Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, key_features: [...draft.key_features, ''] })}><Plus className="mr-1 h-4 w-4" />Tilføj</Button></div>{draft.key_features.map((feature, index) => <div key={`${index}-${feature}`} className="grid grid-cols-[1fr_auto] gap-2"><Input value={feature} onChange={(event) => updateFeature(index, event.target.value)} placeholder="Fx kompakt og driftssikker" /><Button type="button" variant="ghost" size="icon" onClick={() => setDraft({ ...draft, key_features: draft.key_features.filter((_, featureIndex) => featureIndex !== index) })} aria-label="Fjern nøglefunktion"><X className="h-4 w-4" /></Button></div>)}</section>
              <Field label="Videolink"><Input value={draft.video_url} onChange={(event) => setDraft({ ...draft, video_url: event.target.value })} placeholder="https://..." /></Field>
              <Field label="Billede"><div className="flex gap-2"><Input value={draft.image_url} onChange={(event) => setDraft({ ...draft, image_url: event.target.value })} placeholder="https://..." /><Button type="button" variant="outline" onClick={() => uploadInput.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Upload</Button><input ref={uploadInput} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadImage(event.target.files?.[0])} /></div></Field>
              <Field label="Badge"><Select value={customBadge ? 'custom' : (draft.badge || 'none')} onValueChange={(selected) => { const isCustom = selected === 'custom'; setCustomBadge(isCustom); setDraft({ ...draft, badge: isCustom || selected === 'none' ? '' : selected, ...(selected === 'none' ? { badge_starts_at: null, badge_ends_at: null, badge_show_countdown: false } : {}) }); }}><SelectTrigger><MarketingConfiguratorBadgeOption badge={customBadge ? (draft.badge || 'Egen tekst') : draft.badge} /></SelectTrigger><SelectContent><SelectItem value="none">Ingen</SelectItem>{MARKETING_BADGE_PRESETS.map((option) => <SelectItem key={option.value} value={option.value}><MarketingConfiguratorBadgeOption badge={option.value} /></SelectItem>)}<SelectItem value="custom"><MarketingConfiguratorBadgeOption badge="Egen tekst" /></SelectItem></SelectContent></Select></Field>
              {customBadge && <Field label="Egen badge-tekst"><Input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} /></Field>}
              {draft.badge && <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-emerald-700" /><p className="text-sm font-semibold text-slate-800">{portalT('marketingBadgeDisplayPeriod', uiLanguage)}</p></div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={portalT('marketingBadgeDisplayPeriod', uiLanguage)}>
                  <Button type="button" size="sm" variant={!draft.badge_ends_at ? 'default' : 'outline'} onClick={() => setDraft({ ...draft, badge_starts_at: null, badge_ends_at: null, badge_show_countdown: false })}>{portalT('marketingBadgePermanent', uiLanguage)}</Button>
                  <Button type="button" size="sm" variant={draft.badge_ends_at ? 'default' : 'outline'} onClick={() => { const start = new Date(); setStartMode('now'); setEndMode('duration'); setDraft({ ...draft, badge_starts_at: start.toISOString(), badge_ends_at: addMarketingBadgeDuration(start, durationAmount, durationUnit).toISOString() }); }}>{portalT('marketingBadgeLimited', uiLanguage)}</Button>
                </div>
                {draft.badge_ends_at && <div className="space-y-3 border-t border-slate-200 pt-3">
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center"><span className="text-sm font-medium text-slate-700">{portalT('marketingBadgeStart', uiLanguage)}</span><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={startMode === 'now' ? 'default' : 'outline'} onClick={() => { const start = new Date(); setStartMode('now'); setDraft({ ...draft, badge_starts_at: start.toISOString(), badge_ends_at: endMode === 'duration' ? addMarketingBadgeDuration(start, durationAmount, durationUnit).toISOString() : draft.badge_ends_at }); }}>{portalT('marketingBadgeStartNow', uiLanguage)}</Button><Button type="button" size="sm" variant={startMode === 'specific' ? 'default' : 'outline'} onClick={() => setStartMode('specific')}>{portalT('marketingBadgeStartDateTime', uiLanguage)}</Button></div></div>
                  {startMode === 'specific' && <Input type="datetime-local" value={asLocalDateTime(draft.badge_starts_at)} onChange={(event) => { const start = asIso(event.target.value); if (!start) return; setDraft({ ...draft, badge_starts_at: start, badge_ends_at: endMode === 'duration' ? addMarketingBadgeDuration(new Date(start), durationAmount, durationUnit).toISOString() : draft.badge_ends_at }); }} />}
                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center"><span className="text-sm font-medium text-slate-700">{portalT('marketingBadgeEnd', uiLanguage)}</span><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={endMode === 'duration' ? 'default' : 'outline'} onClick={() => { const start = new Date(draft.badge_starts_at || Date.now()); setEndMode('duration'); setDraft({ ...draft, badge_starts_at: start.toISOString(), badge_ends_at: addMarketingBadgeDuration(start, durationAmount, durationUnit).toISOString() }); }}>{portalT('marketingBadgeEndsAfter', uiLanguage)}</Button><Button type="button" size="sm" variant={endMode === 'specific' ? 'default' : 'outline'} onClick={() => setEndMode('specific')}>{portalT('marketingBadgeSpecificEnd', uiLanguage)}</Button></div></div>
                  {endMode === 'duration' ? <div className="grid grid-cols-[7rem_1fr] gap-2"><Input type="number" min="1" value={durationAmount} onChange={(event) => updateDuration(Number(event.target.value), durationUnit)} /><Select value={durationUnit} onValueChange={(value) => updateDuration(durationAmount, value as MarketingBadgeDurationUnit)}><SelectTrigger>{portalT(`marketingBadgeDuration${durationUnit[0].toUpperCase()}${durationUnit.slice(1)}`, uiLanguage)}</SelectTrigger><SelectContent>{(['hours', 'days', 'weeks', 'months', 'years'] as MarketingBadgeDurationUnit[]).map((unit) => <SelectItem key={unit} value={unit}>{portalT(`marketingBadgeDuration${unit[0].toUpperCase()}${unit.slice(1)}`, uiLanguage)}</SelectItem>)}</SelectContent></Select></div> : <Input type="datetime-local" value={asLocalDateTime(draft.badge_ends_at)} onChange={(event) => { const end = asIso(event.target.value); if (end) setDraft({ ...draft, badge_ends_at: end }); }} />}
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={draft.badge_show_countdown === true} onChange={(event) => setDraft({ ...draft, badge_show_countdown: event.target.checked })} className="h-4 w-4 accent-emerald-600" />{portalT('marketingBadgeShowCountdown', uiLanguage)}</label>
                  <div className="rounded border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-600"><div>{portalT('marketingBadgeVisibleFrom', uiLanguage)}: {formatMarketingBadgeDateTime(draft.badge_starts_at || new Date().toISOString(), uiLanguage)}</div><div>{portalT('marketingBadgeExpires', uiLanguage)}: {formatMarketingBadgeDateTime(draft.badge_ends_at, uiLanguage)}</div></div>
                </div>}
              </section>}
              <section className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Dimensioner & tekniske specifikationer</p><Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, specs: [...draft.specs, { label: '', value: '' }] })}>Tilføj felt</Button></div>{draft.specs.map((spec, index) => <div key={`${index}-${spec.label}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input value={spec.label} onChange={(event) => updateSpec(index, 'label', event.target.value)} placeholder="Label" /><Input value={typeof spec.value === 'string' ? spec.value : ''} onChange={(event) => updateSpec(index, 'value', event.target.value)} placeholder="Værdi" /><Button type="button" variant="ghost" size="icon" onClick={() => setDraft({ ...draft, specs: draft.specs.filter((_, specIndex) => specIndex !== index) })} aria-label="Fjern felt"><X className="h-4 w-4" /></Button></div>)}</section>
            </div>
            <aside className="space-y-3 lg:sticky lg:top-0">
              <p className="text-sm font-semibold text-slate-700">Live preview</p>
              {draft.badge && marketingBadgeScheduleState(draft) !== 'active' && <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">{marketingBadgeScheduleState(draft) === 'scheduled' ? `${portalT('marketingBadgeScheduled', uiLanguage)} – ${portalT('marketingBadgeStart', uiLanguage)} ${formatMarketingBadgeDateTime(draft.badge_starts_at, uiLanguage)}` : portalT('marketingBadgeExpired', uiLanguage)}</p>}
              <MarketingConfiguratorProductCard
                title={draft.title || item.defaults.title}
                itemNumber={item.itemNumber}
                itemNumberLabel={itemNoLabel(uiLanguage)}
                price={previewPrice}
                description={draft.description}
                specs={draft.specs.filter((spec) => spec.label && spec.value).map((spec) => ({ label: spec.label, value: typeof spec.value === 'string' ? spec.value : '' }))}
                badge={draft.badge}
                badgeSchedule={draft}
                language={uiLanguage}
                actions={<><span className="flex items-center gap-1 text-sm font-medium text-emerald-600"><Film className="h-4 w-4" />{t('videoLink', uiLanguage)}</span><span className="flex items-center gap-1 text-sm font-medium text-emerald-600"><Image className="h-4 w-4" />{t('imageLink', uiLanguage)}</span><span className="flex items-center gap-1 text-sm font-medium text-blue-600"><FileText className="h-4 w-4" />{t('infoSpecs', uiLanguage)}</span></>}
                footer={<div className="flex items-center justify-between rounded-lg border-t border-gray-200 bg-gray-100 px-3 py-2"><span className="font-medium text-gray-700">{t('quantity', uiLanguage)}</span><div className="flex items-center"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-300 text-gray-500"><Minus className="h-4 w-4" /></span><span className="mx-1 flex h-8 w-8 items-center justify-center rounded-md border-2 border-gray-300 font-bold">0</span><span className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500 text-white"><Plus className="h-4 w-4" /></span></div></div>}
              />
            </aside>
          </div>
        </div>}
        <DialogFooter className="gap-2 sm:justify-between"><Button type="button" variant="outline" onClick={onClose}><X className="mr-1.5 h-4 w-4" />Annuller</Button><div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => void save('draft')}><Save className="mr-1.5 h-4 w-4" />Gem kladde</Button><Button type="button" disabled={saving} onClick={() => void save('published')}><Send className="mr-1.5 h-4 w-4" />Publicér</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}
