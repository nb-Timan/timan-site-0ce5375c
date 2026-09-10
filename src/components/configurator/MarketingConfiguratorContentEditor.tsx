import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, FileText, Film, Image, Plus, Save, Send, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { MARKETING_BADGE_PRESETS, MarketingConfiguratorBadge, MarketingConfiguratorBadgeOption } from '@/components/configurator/MarketingConfiguratorBadge';
import {
  mergeMarketingConfiguratorContent,
  saveMarketingConfiguratorContent,
  uploadMarketingConfiguratorImage,
  type MarketingConfiguratorCatalogItem,
  type MarketingConfiguratorContentFields,
  type MarketingConfiguratorContentRecord,
} from '@/lib/marketingConfiguratorContentService';
import type { TechSpec } from '@/types/configurator';

export const MARKETING_BADGE_OPTIONS = ['', ...MARKETING_BADGE_PRESETS.map((option) => option.value), 'Egen tekst'] as const;

type Props = {
  item: MarketingConfiguratorCatalogItem | null;
  records: MarketingConfiguratorContentRecord[];
  onClose: () => void;
  onSaved: (record: MarketingConfiguratorContentRecord) => void;
};

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

export default function MarketingConfiguratorContentEditor({ item, records, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<MarketingConfiguratorContentFields | null>(null);
  const [customBadge, setCustomBadge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setError(null);
    const next = item ? fieldFor(item, records).content : null;
    setDraft(next);
    setCustomBadge(Boolean(next?.badge && !MARKETING_BADGE_OPTIONS.includes(next.badge as typeof MARKETING_BADGE_OPTIONS[number])));
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
              <Field label="Badge"><Select value={customBadge ? 'custom' : (draft.badge || 'none')} onValueChange={(selected) => { const isCustom = selected === 'custom'; setCustomBadge(isCustom); setDraft({ ...draft, badge: isCustom || selected === 'none' ? '' : selected }); }}><SelectTrigger><MarketingConfiguratorBadgeOption badge={customBadge ? (draft.badge || 'Egen tekst') : draft.badge} /></SelectTrigger><SelectContent><SelectItem value="none">Ingen</SelectItem>{MARKETING_BADGE_PRESETS.map((option) => <SelectItem key={option.value} value={option.value}><MarketingConfiguratorBadgeOption badge={option.value} /></SelectItem>)}<SelectItem value="custom"><MarketingConfiguratorBadgeOption badge="Egen tekst" /></SelectItem></SelectContent></Select></Field>
              {customBadge && <Field label="Egen badge-tekst"><Input value={draft.badge} onChange={(event) => setDraft({ ...draft, badge: event.target.value })} /></Field>}
              <section className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Dimensioner & tekniske specifikationer</p><Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, specs: [...draft.specs, { label: '', value: '' }] })}>Tilføj felt</Button></div>{draft.specs.map((spec, index) => <div key={`${index}-${spec.label}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input value={spec.label} onChange={(event) => updateSpec(index, 'label', event.target.value)} placeholder="Label" /><Input value={typeof spec.value === 'string' ? spec.value : ''} onChange={(event) => updateSpec(index, 'value', event.target.value)} placeholder="Værdi" /><Button type="button" variant="ghost" size="icon" onClick={() => setDraft({ ...draft, specs: draft.specs.filter((_, specIndex) => specIndex !== index) })} aria-label="Fjern felt"><X className="h-4 w-4" /></Button></div>)}</section>
            </div>
            <aside className="space-y-3 lg:sticky lg:top-0"><p className="text-sm font-semibold text-slate-700">Live preview</p><div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">{draft.image_url ? <img src={draft.image_url} alt="Produktpreview" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">Intet billede valgt</div>}<div className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{draft.title || item.defaults.title}</h3><MarketingConfiguratorBadge badge={draft.badge} /></div>{draft.description && <p className="text-sm text-slate-600 whitespace-pre-line">{draft.description}</p>}{draft.key_features.filter(Boolean).length > 0 && <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">{draft.key_features.filter(Boolean).map((feature, index) => <li key={`${feature}-${index}`}>{feature}</li>)}</ul>}{draft.specs.filter((spec) => spec.label && spec.value).length > 0 && <div className="border-t border-slate-200 pt-3 text-sm">{draft.specs.filter((spec) => spec.label && spec.value).slice(0, 4).map((spec, index) => <div key={`${spec.label}-${index}`} className="flex justify-between gap-3 py-1"><span className="text-slate-500">{spec.label}</span><span className="text-right font-medium text-slate-800">{typeof spec.value === 'string' ? spec.value : ''}</span></div>)}</div>}</div></div></aside>
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
