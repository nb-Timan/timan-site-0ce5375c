import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Film, ImagePlus, PencilLine, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  mergeMarketingConfiguratorContent,
  saveMarketingConfiguratorContent,
  uploadMarketingConfiguratorImage,
  type MarketingConfiguratorCatalogItem,
  type MarketingConfiguratorContentFields,
  type MarketingConfiguratorContentRecord,
} from '@/lib/marketingConfiguratorContentService';
import { MARKETING_BADGE_OPTIONS } from './MarketingConfiguratorContentEditor';

type ToolMode = 'image' | 'video' | 'badge' | null;

type Props = {
  catalog: MarketingConfiguratorCatalogItem[];
  records: MarketingConfiguratorContentRecord[];
  onSaved: (record: MarketingConfiguratorContentRecord) => void;
};

type CatalogState = 'missing' | 'draft' | 'published';

function recordFor(records: MarketingConfiguratorContentRecord[], item: MarketingConfiguratorCatalogItem, status: 'draft' | 'published') {
  return records.find((record) => record.product_key === item.productKey && record.status === status) || null;
}

function catalogState(records: MarketingConfiguratorContentRecord[], item: MarketingConfiguratorCatalogItem): CatalogState {
  if (recordFor(records, item, 'draft')) return 'draft';
  if (recordFor(records, item, 'published')) return 'published';
  return 'missing';
}

function effectiveContent(records: MarketingConfiguratorContentRecord[], item: MarketingConfiguratorCatalogItem) {
  return mergeMarketingConfiguratorContent(
    item.defaults,
    recordFor(records, item, 'draft')?.content || recordFor(records, item, 'published')?.content,
  );
}

export default function MarketingConfiguratorBulkTools({ catalog, records, onSaved }: Props) {
  const [filter, setFilter] = useState<'all' | 'missing' | 'draft'>('all');
  const [mode, setMode] = useState<ToolMode>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [badge, setBadge] = useState('');
  const [customBadge, setCustomBadge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const visibleCatalog = useMemo(() => catalog.filter((item) => {
    const state = catalogState(records, item);
    return filter === 'all' || state === filter;
  }), [catalog, filter, records]);

  const open = (nextMode: Exclude<ToolMode, null>) => {
    setMode(nextMode);
    setSelected(new Set(visibleCatalog.map((item) => item.productKey)));
    setImageUrl('');
    setVideoUrl('');
    setBadge('');
    setCustomBadge(false);
    setError(null);
  };

  const toggle = (key: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const upload = async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    const result = await uploadMarketingConfiguratorImage(file);
    if (result.error || !result.url) {
      setError(result.error || 'Billedet kunne ikke uploades.');
      return;
    }
    setImageUrl(result.url);
  };

  const saveDrafts = async () => {
    if (!mode) return;
    const targets = visibleCatalog.filter((item) => selected.has(item.productKey));
    if (!targets.length) {
      setError('Vælg mindst ét produkt.');
      return;
    }
    if (mode === 'image' && !imageUrl) {
      setError('Vælg eller upload et billede først.');
      return;
    }
    if (mode === 'video' && !videoUrl.trim()) {
      setError('Indtast et videolink først.');
      return;
    }
    if (mode === 'badge' && !badge.trim()) {
      setError('Vælg en badge først.');
      return;
    }

    setSaving(true);
    setError(null);
    const results = await Promise.all(targets.map(async (item) => {
      const content: MarketingConfiguratorContentFields = {
        ...effectiveContent(records, item),
        ...(mode === 'image' ? { image_url: imageUrl } : {}),
        ...(mode === 'video' ? { video_url: videoUrl.trim() } : {}),
        ...(mode === 'badge' ? { badge: badge.trim() } : {}),
      };
      return saveMarketingConfiguratorContent(item, content, 'draft');
    }));
    setSaving(false);

    const failed = results.find((result) => result.error || !result.row);
    results.forEach((result) => { if (result.row) onSaved(result.row); });
    if (failed) {
      setError(failed.error || 'En eller flere kladder kunne ikke gemmes.');
      return;
    }
    setMode(null);
  };

  const stateIcon = (item: MarketingConfiguratorCatalogItem) => {
    const state = catalogState(records, item);
    if (state === 'draft') return <span className="inline-flex items-center gap-1 text-amber-700"><Circle className="h-3.5 w-3.5 fill-amber-400" />Kladde</span>;
    if (state === 'published') return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Publiceret</span>;
    return <span className="inline-flex items-center gap-1 text-slate-500"><Circle className="h-3.5 w-3.5" />Mangler</span>;
  };

  return <>
    <div className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <Button type="button" size="sm" variant={filter === 'missing' ? 'default' : 'outline'} onClick={() => setFilter((current) => current === 'missing' ? 'all' : 'missing')}>Vis kun mangler</Button>
      <Button type="button" size="sm" variant={filter === 'draft' ? 'default' : 'outline'} onClick={() => setFilter((current) => current === 'draft' ? 'all' : 'draft')}>Vis kun kladder</Button>
      <span className="mx-1 hidden h-5 border-l border-emerald-200 sm:block" />
      <Button type="button" size="sm" variant="outline" onClick={() => open('image')}><ImagePlus className="mr-1.5 h-4 w-4" />Upload billeder</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => open('video')}><Film className="mr-1.5 h-4 w-4" />Tilføj videolinks</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => open('badge')}><PencilLine className="mr-1.5 h-4 w-4" />Batch redigér</Button>
    </div>

    <Dialog open={mode !== null} onOpenChange={(openDialog) => { if (!openDialog) setMode(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{mode === 'image' ? 'Upload billeder' : mode === 'video' ? 'Tilføj videolinks' : 'Batch redigér'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
          {mode === 'image' && <div className="flex gap-2"><Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." /><Button type="button" variant="outline" onClick={() => fileInput.current?.click()}><Upload className="mr-1.5 h-4 w-4" />Upload</Button><input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} /></div>}
          {mode === 'video' && <Input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://youtube.com/..." />}
          {mode === 'badge' && <div className="space-y-2"><select value={customBadge ? 'Egen tekst' : badge} onChange={(event) => { const value = event.target.value; setCustomBadge(value === 'Egen tekst'); setBadge(value === 'Egen tekst' ? '' : value); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{MARKETING_BADGE_OPTIONS.map((option) => <option key={option || 'none'} value={option}>{option || 'Ingen'}</option>)}</select>{customBadge && <Input value={badge} onChange={(event) => setBadge(event.target.value)} placeholder="Egen badge-tekst" />}</div>}
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-700">Produkter ({visibleCatalog.length})</p><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set(visibleCatalog.map((item) => item.productKey)))}>Vælg alle</Button></div>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {visibleCatalog.map((item) => <label key={item.productKey} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={selected.has(item.productKey)} onChange={() => toggle(item.productKey)} /><span className="min-w-0 flex-1 truncate">{item.defaults.title} <span className="text-slate-500">{item.itemNumber}</span></span>{stateIcon(item)}</label>)}
            {!visibleCatalog.length && <p className="px-2 py-3 text-sm text-slate-500">Ingen produkter matcher filteret.</p>}
          </div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setMode(null)}>Annuller</Button><Button type="button" disabled={saving} onClick={() => void saveDrafts()}>Gem kladder</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
