import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, Download, FileText, GitCompare, History, RefreshCw, Scissors, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { machines } from '@/data/machines';
import { FALLBACK_LANGUAGE, mapUiLanguageToLegacy, normalizePortalLanguageCode, PORTAL_LANGUAGES, portalLanguageDisplayCode } from '@/lib/portalLanguages';
import {
  createSupportKnowledgeSourceDownloadUrl,
  fetchSupportKnowledgeAssociations,
  fetchSupportKnowledgeLifecycleEvents,
  fetchSupportKnowledgeSources,
  fetchSupportProductOptions,
  indexSupportKnowledgeSource,
  replaceSupportKnowledgeAssociations,
  reprocessSupportKnowledgeSource,
  transitionSupportKnowledgeSource,
  uploadSupportKnowledgeSource,
} from '@/lib/supportAdminService';
import type { SupportKnowledgeItem, SupportKnowledgeLifecycleEvent, SupportKnowledgeSource, SupportProductOption } from '@/lib/supportAdminTypes';
import { getSupportIngestionCopy, supportIngestionStatusLabel } from '@/lib/i18n/supportIngestionTranslations';
import { cn } from '@/lib/utils';

const ACTIVE_STATUSES = new Set(['RECEIVED', 'QUEUED', 'PROCESSING']);

function machineLabel(machine: (typeof machines)[number], uiLanguage: string): string {
  if (typeof machine.name === 'string') return machine.name;
  const language = mapUiLanguageToLegacy(uiLanguage);
  return machine.name[language] || machine.name.en || machine.name.da || machine.id;
}

function operationErrorMessage(reason: unknown, fallback: string, duplicate: string): string {
  if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'DUPLICATE_SOURCE') return duplicate;
  return reason instanceof Error ? reason.message : fallback;
}

export function KnowledgeSourcesPanel({ item }: { item: SupportKnowledgeItem }) {
  const { uiLanguage } = useLanguage();
  const copy = getSupportIngestionCopy(uiLanguage);
  const { toast } = useToast();
  const [sources, setSources] = useState<SupportKnowledgeSource[]>([]);
  const [events, setEvents] = useState<SupportKnowledgeLifecycleEvent[]>([]);
  const [products, setProducts] = useState<SupportProductOption[]>([]);
  const [machineIds, setMachineIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState(normalizePortalLanguageCode(item.language) || FALLBACK_LANGUAGE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const [nextSources, associations, nextProducts, nextEvents] = await Promise.all([
      fetchSupportKnowledgeSources(item.id),
      fetchSupportKnowledgeAssociations(item.id),
      fetchSupportProductOptions(),
      fetchSupportKnowledgeLifecycleEvents(item.id),
    ]);
    setSources(nextSources);
    setMachineIds(associations.machineIds.length ? associations.machineIds : item.machine_id ? [item.machine_id] : []);
    setProductIds(associations.productIds.length ? associations.productIds : item.product_id ? [item.product_id] : []);
    setProducts(nextProducts);
    setEvents(nextEvents);
  }, [item.id, item.machine_id, item.product_id]);

  useEffect(() => {
    setLoading(true);
    load().catch((reason) => toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : copy.error }))
      .finally(() => setLoading(false));
  }, [copy.error, load, toast]);

  useEffect(() => {
    if (!sources.some((source) => ACTIVE_STATUSES.has(source.ingestion_status))) return;
    const timer = window.setInterval(() => { void load(); }, 2000);
    return () => window.clearInterval(timer);
  }, [load, sources]);

  const shownProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((product) => productIds.includes(product.id)
      || !query
      || product.itemNumber.toLowerCase().includes(query)
      || product.label.toLowerCase().includes(query)).slice(0, 24);
  }, [productIds, productSearch, products]);

  const toggle = (values: string[], value: string, checked: boolean) => checked
    ? Array.from(new Set([...values, value]))
    : values.filter((entry) => entry !== value);

  const saveAssociations = async () => {
    setBusy(true);
    try {
      await replaceSupportKnowledgeAssociations(item.id, { machineIds, productIds });
      toast({ title: copy.associationsSaved });
    } catch (reason) {
      toast({ variant: 'destructive', title: operationErrorMessage(reason, copy.error, copy.duplicateSource) });
    } finally { setBusy(false); }
  };

  const upload = async (duplicateDecision?: 'CONTINUE_DISTINCT' | 'NEW_REVISION') => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadSupportKnowledgeSource({ knowledgeItemId: item.id, sourceLanguage, file, duplicateDecision });
      setFile(null);
      setDuplicateWarning(null);
      toast({ title: copy.processingStarted });
      await load();
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'DUPLICATE_SOURCE' && 'details' in reason) {
        setDuplicateWarning((reason as { details?: Record<string, unknown> }).details || {});
        return;
      }
      toast({ variant: 'destructive', title: operationErrorMessage(reason, copy.error, copy.duplicateSource) });
    } finally { setBusy(false); }
  };

  const runAgain = async (sourceId: string, action: 'reprocess' | 'rechunk') => {
    setBusy(true);
    try {
      await reprocessSupportKnowledgeSource(sourceId, action);
      toast({ title: copy.processingStarted });
      await load();
    } catch (reason) {
      toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : copy.error });
    } finally { setBusy(false); }
  };

  const indexSource = async (sourceId: string, mode: 'index' | 'reindex' | 'reembed' = 'index') => {
    setBusy(true);
    try {
      let result = await indexSupportKnowledgeSource(sourceId, mode);
      while (result.has_more && result.failed === 0) result = await indexSupportKnowledgeSource(sourceId, mode);
      toast({ title: copy.indexingStarted });
      await load();
    } catch (reason) {
      toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : copy.error });
    } finally { setBusy(false); }
  };

  const transitionSource = async (sourceId: string, status: 'REVIEW' | 'APPROVED' | 'ARCHIVED') => {
    setBusy(true);
    try {
      await transitionSupportKnowledgeSource(sourceId, status);
      toast({ title: copy.lifecycleSaved });
      await load();
    } catch (reason) {
      toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : copy.error });
    } finally { setBusy(false); }
  };

  const download = async (source: SupportKnowledgeSource) => {
    const url = await createSupportKnowledgeSourceDownloadUrl(source);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{copy.loading}</div>;

  return (
    <section className="space-y-4 border-t border-slate-200 pt-5">
      <div><h3 className="font-semibold text-slate-950">{copy.heading}</h3><p className="mt-1 text-sm text-slate-600">{copy.description}</p></div>
      <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 lg:grid-cols-2">
        <div>
          <Label className="text-xs text-slate-600">{copy.machines}</Label>
          <div className="mt-2 grid max-h-40 gap-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
            {machines.map((machine) => <label key={machine.id} className="flex items-center gap-2 text-sm"><Checkbox checked={machineIds.includes(machine.id)} onCheckedChange={(checked) => setMachineIds(toggle(machineIds, machine.id, checked === true))} /><span>{machineLabel(machine, uiLanguage)}</span></label>)}
          </div>
        </div>
        <div>
          <Label className="text-xs text-slate-600">{copy.products}</Label>
          <Input className="mt-2" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={copy.productSearch} />
          <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-white p-3">
            {shownProducts.map((product) => <label key={product.id} className="flex items-start gap-2 text-sm"><Checkbox className="mt-0.5" checked={productIds.includes(product.id)} onCheckedChange={(checked) => setProductIds(toggle(productIds, product.id, checked === true))} /><span><strong>{product.itemNumber}</strong> · {product.label}</span></label>)}
          </div>
        </div>
        <div className="lg:col-span-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void saveAssociations()}>{copy.saveAssociations}</Button></div>
      </div>
      <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <div><Label className="text-xs text-slate-600">{copy.sourceFile}</Label><Input className="mt-2" type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
        <div><Label className="text-xs text-slate-600">{copy.sourceLanguage}</Label><select className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={sourceLanguage} onChange={(event) => setSourceLanguage(normalizePortalLanguageCode(event.target.value) || FALLBACK_LANGUAGE)}>{PORTAL_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.flag}</option>)}</select></div>
        <Button disabled={!file || busy} onClick={() => void upload()}><Upload className="mr-2 h-4 w-4" />{copy.uploadAndProcess}</Button>
      </div>
      {duplicateWarning && <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-slate-800">
        <p className="font-semibold">Mulig dublet fundet</p>
        <p className="mt-1">{String(duplicateWarning.existing_knowledge_item_title || duplicateWarning.existing_knowledge_item_id || '')} · revision {String(duplicateWarning.revision || '')} · {String(duplicateWarning.current_status || '')} · {Math.round(Number(duplicateWarning.similarity || 1) * 100)}%</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setDuplicateWarning(null); setFile(null); }}>Annullér upload</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void upload('NEW_REVISION')}>Opret ny revision</Button>
          <Button size="sm" disabled={busy} onClick={() => void upload('CONTINUE_DISTINCT')}>Fortsæt som særskilt viden</Button>
        </div>
      </div>}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">{copy.sources}</h4>
        {!sources.length && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600">{copy.noSources}</p>}
        {sources.map((source) => {
          const latestRun = source.runs[0];
          return <article key={source.id} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0"><p className="flex items-center gap-2 font-medium text-slate-950"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{source.original_filename || source.original_url}</span></p><p className="mt-1 text-xs text-slate-500">{copy.revision} {source.revision} · {portalLanguageDisplayCode(source.source_language)} · {copy.uploaded} {new Date(source.created_at).toLocaleString()}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">{supportIngestionStatusLabel(uiLanguage, source.lifecycle_status)}</span>{source.is_current && <span className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">{copy.currentVersion}</span>}{source.stale_states.map((state) => <span key={state} className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">{supportIngestionStatusLabel(uiLanguage, state)}</span>)}</div></div>
              <span className={cn('w-fit rounded-full px-2 py-1 text-xs font-medium', source.ingestion_status === 'FAILED' ? 'bg-red-50 text-red-700' : source.ingestion_status === 'READY_FOR_REVIEW' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{supportIngestionStatusLabel(uiLanguage, source.ingestion_status)}</span>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4"><span>{copy.pages}: {latestRun?.page_count ?? '—'}</span><span>{copy.characters}: {latestRun?.extracted_character_count ?? '—'}</span><span>{copy.chunks}: {latestRun?.chunk_count ?? '—'}</span><span>{copy.indexState}: {supportIngestionStatusLabel(uiLanguage, source.index_state?.status || 'NOT_INDEXED')}</span><span>{copy.reviewed}: {source.reviewed_at ? new Date(source.reviewed_at).toLocaleDateString() : '—'}</span><span>{copy.effectiveFrom}: {source.effective_from ? new Date(source.effective_from).toLocaleDateString() : '—'}</span><span>{copy.embeddingModel}: {source.index_state?.embedding_model_name || '—'}</span><span>{copy.supersedes}: {source.supersedes_source_id ? `${copy.revision} ${Math.max(1, source.revision - 1)}` : '—'}</span></div>
            <p className="mt-2 text-xs text-slate-600">Knowledge Quality: {source.quality_status} · {source.quality_score}/100 · Tier {source.authority_tier}</p>
            {source.content_equivalent_source_id && <p className="mt-2 text-xs text-amber-700">{copy.equivalentContent}</p>}
            {latestRun?.error_message_sanitized && <p className="mt-2 text-sm text-red-700">{latestRun.error_message_sanitized}</p>}
            <details className="mt-3 rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-800">{copy.extractionPreview}</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-slate-700">{latestRun?.extracted_text || copy.noPreview}</pre>{latestRun?.detected_sections?.length ? <p className="mt-3 text-xs text-slate-500">{copy.sections}: {latestRun.detected_sections.slice(0, 8).map((section) => `${section.heading} (p. ${section.page})`).join(' · ')}</p> : null}</details>
            <details className="mt-2"><summary className="cursor-pointer text-xs text-slate-600">{copy.previousRuns} ({source.runs.length})</summary><div className="mt-2 space-y-1 text-xs text-slate-600">{source.runs.map((run) => <div key={run.id}>{supportIngestionStatusLabel(uiLanguage, run.status)} · {run.run_reason} · {run.processor_version} · {new Date(run.created_at).toLocaleString()}</div>)}</div></details>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy || ACTIVE_STATUSES.has(source.ingestion_status)} onClick={() => void runAgain(source.id, 'reprocess')}><RefreshCw className="mr-2 h-4 w-4" />{copy.reprocess}</Button>
              <Button size="sm" variant="outline" disabled={busy || ACTIVE_STATUSES.has(source.ingestion_status)} onClick={() => void runAgain(source.id, 'rechunk')}><Scissors className="mr-2 h-4 w-4" />{copy.rechunk}</Button>
              {source.lifecycle_status === 'DRAFT' && source.ingestion_status === 'READY_FOR_REVIEW' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void transitionSource(source.id, 'REVIEW')}>{copy.submitReview}</Button>}
              {source.lifecycle_status === 'REVIEW' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void transitionSource(source.id, 'APPROVED')}>{copy.approveRevision}</Button>}
              {item.status === 'APPROVED' && source.lifecycle_status === 'APPROVED' && source.ingestion_status === 'READY_FOR_REVIEW' && (!source.is_current || source.index_state?.status !== 'INDEXED') && <Button size="sm" variant="outline" disabled={busy} onClick={() => void indexSource(source.id)}><BookOpenCheck className="mr-2 h-4 w-4" />{copy.indexApproved}</Button>}
              {source.is_current && source.lifecycle_status === 'APPROVED' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void indexSource(source.id, 'reindex')}><RefreshCw className="mr-2 h-4 w-4" />{copy.reindex}</Button>}
              {source.is_current && source.lifecycle_status === 'APPROVED' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void indexSource(source.id, 'reembed')}><RefreshCw className="mr-2 h-4 w-4" />{copy.reembed}</Button>}
              <Button size="sm" variant="ghost" onClick={() => void download(source)}><Download className="mr-2 h-4 w-4" />{copy.download}</Button>
            </div>
          </article>;
        })}
      </div>
      {sources.length > 1 && <details className="rounded-md border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900"><GitCompare className="h-4 w-4" />{copy.compareVersions}</summary><div className="mt-4 grid gap-4 lg:grid-cols-2">{sources.slice(0, 2).reverse().map((source) => <div key={source.id} className="min-w-0"><p className="mb-2 text-xs font-semibold text-slate-600">{copy.revision} {source.revision}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 font-sans text-xs text-slate-700">{source.runs[0]?.extracted_text || copy.noPreview}</pre></div>)}</div></details>}
      <details className="rounded-md border border-slate-200 bg-white p-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" />{copy.lifecycleAudit}</summary><div className="mt-3 space-y-2">{events.length ? events.map((event) => <div key={event.id} className="grid gap-1 border-b border-slate-100 pb-2 text-xs text-slate-600 last:border-0 sm:grid-cols-[12rem_1fr_auto]"><strong className="text-slate-800">{supportIngestionStatusLabel(uiLanguage, event.event_type)}</strong><span>{event.reason || [event.previous_status, event.new_status].filter(Boolean).join(' → ') || '—'}</span><time>{new Date(event.created_at).toLocaleString()}</time></div>) : <p className="text-sm text-slate-500">{copy.noAuditEvents}</p>}</div></details>
    </section>
  );
}
