import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Languages, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  fetchSupportKnowledgeQualityReview,
  resolveSupportKnowledgeConflict,
  resolveSupportKnowledgeDuplicate,
} from '@/lib/supportAdminService';
import type {
  SupportKnowledgeConflict,
  SupportKnowledgeDuplicateCluster,
  SupportKnowledgeQualityReview,
  SupportKnowledgeQualitySourceSummary,
} from '@/lib/supportAdminTypes';
import { portalLanguageDisplayCode } from '@/lib/portalLanguages';

function SourceSummary({ source }: { source?: SupportKnowledgeQualitySourceSummary }) {
  if (!source) return <span className="text-sm text-slate-500">Kilde ikke tilgængelig</span>;
  return (
    <div className="min-w-0 text-sm">
      <p className="truncate font-semibold text-slate-950">{source.title}</p>
      <p className="mt-1 break-all text-xs text-slate-500">{source.original_url || source.original_filename || source.id}</p>
      <p className="mt-1 text-xs text-slate-600">
        {portalLanguageDisplayCode(source.source_language)} · revision {source.revision} · {source.lifecycle_status} · Tier {source.authority_tier}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-r border-slate-200 p-3 last:border-r-0"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950">{value}</p></div>;
}

export function KnowledgeQualityPanel() {
  const { toast } = useToast();
  const [review, setReview] = useState<SupportKnowledgeQualityReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setReview(await fetchSupportKnowledgeQualityReview()); }
    catch (reason) { toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const resolveDuplicate = async (row: SupportKnowledgeDuplicateCluster, resolution: NonNullable<SupportKnowledgeDuplicateCluster['resolution']>) => {
    setBusyId(row.id);
    try { await resolveSupportKnowledgeDuplicate(row.id, resolution); await load(); }
    catch (reason) { toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusyId(null); }
  };
  const resolveConflict = async (row: SupportKnowledgeConflict, resolution: NonNullable<SupportKnowledgeConflict['resolution']>) => {
    setBusyId(row.id);
    try { await resolveSupportKnowledgeConflict(row.id, resolution); await load(); }
    catch (reason) { toast({ variant: 'destructive', title: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusyId(null); }
  };

  if (loading || !review) return <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Indlæser Knowledge Quality...</div>;
  const openDuplicates = review.duplicates.filter((row) => row.status === 'OPEN');
  const openConflicts = review.conflicts.filter((row) => row.status === 'OPEN');

  return (
    <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-slate-950">Knowledge Quality</h2><p className="mt-1 text-sm text-slate-600">Dubletter, konflikter, kildeautoritet og ingestion-kvalitet.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Opdatér</Button>
      </div>
      <div className="grid overflow-hidden rounded-md border border-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Eksakte dubletter blokeret" value={review.overview.exact_duplicates_blocked} />
        <Metric label="Mulige dubletter" value={review.overview.near_duplicates_open} />
        <Metric label="Åbne konflikter" value={review.overview.open_conflicts} />
        <Metric label="Løste konflikter" value={review.overview.resolved_conflicts} />
        <Metric label="Extraction-fejl" value={review.overview.extraction_failures} />
        <Metric label="Markup/støj" value={review.overview.markup_noise_failures} />
      </div>
      <Tabs defaultValue="duplicates">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="duplicates"><Copy className="mr-2 h-4 w-4" />Mulige dubletter</TabsTrigger>
          <TabsTrigger value="conflicts"><AlertTriangle className="mr-2 h-4 w-4" />Konflikter</TabsTrigger>
          <TabsTrigger value="languages"><Languages className="mr-2 h-4 w-4" />Sprog</TabsTrigger>
        </TabsList>
        <TabsContent value="duplicates" className="mt-4 space-y-3">
          {openDuplicates.length === 0 ? <p className="text-sm text-slate-500">Ingen åbne dubletklynger.</p> : openDuplicates.map((row) => (
            <article key={row.id} className="rounded-md border border-slate-200 p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <SourceSummary source={review.sources[row.source_a_id]} />
                <SourceSummary source={review.sources[row.source_b_id]} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>Lighed: {Math.round(Number(row.similarity_score) * 100)}%</span>
                <span>Metoder: {row.detection_methods.join(', ') || '—'}</span>
                <span>Headings: {row.matching_headings.join(', ') || '—'}</span>
                <span>Relationer: {row.shared_relations.join(', ') || '—'}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveDuplicate(row, 'KEEP_BOTH')}>Behold begge</Button>
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveDuplicate(row, 'KEEP_A')}>Behold A</Button>
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveDuplicate(row, 'KEEP_B')}>Behold B</Button>
                <Button size="sm" disabled={busyId === row.id} onClick={() => void resolveDuplicate(row, 'LINK_SAME_TOPIC')}><ShieldCheck className="mr-2 h-4 w-4" />Link som samme emne</Button>
              </div>
            </article>
          ))}
        </TabsContent>
        <TabsContent value="conflicts" className="mt-4 space-y-3">
          {openConflicts.length === 0 ? <p className="text-sm text-slate-500">Ingen åbne faktakonflikter.</p> : openConflicts.map((row) => (
            <article key={row.id} className="rounded-md border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-950">{row.subject} · {row.attribute}</h3><span className="text-xs font-medium text-amber-800">{row.severity}</span></div>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <div><SourceSummary source={review.sources[row.source_a_id]} /><p className="mt-2 font-semibold text-slate-900">{row.value_a}</p><p className="mt-1 text-xs text-slate-600">{row.context_a}</p></div>
                <div><SourceSummary source={review.sources[row.source_b_id]} /><p className="mt-2 font-semibold text-slate-900">{row.value_b}</p><p className="mt-1 text-xs text-slate-600">{row.context_b}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveConflict(row, 'KEEP_SOURCE_A')}>Behold A</Button>
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveConflict(row, 'KEEP_SOURCE_B')}>Behold B</Button>
                <Button size="sm" disabled={busyId === row.id} onClick={() => void resolveConflict(row, 'BOTH_VALID_DIFFERENT_CONTEXT')}><CheckCircle2 className="mr-2 h-4 w-4" />Begge korrekte</Button>
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => void resolveConflict(row, 'NEEDS_MORE_INFORMATION')}>Kræver afklaring</Button>
              </div>
            </article>
          ))}
        </TabsContent>
        <TabsContent value="languages" className="mt-4">
          <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 pr-4">Sprog</th><th className="py-2 pr-4">Ren</th><th className="py-2 pr-4">Kræver review</th><th className="py-2">Afvist/støj</th></tr></thead><tbody>{Object.entries(review.overview.language_quality).map(([language, values]) => <tr key={language} className="border-b border-slate-100 last:border-0"><td className="py-2 pr-4 font-medium">{portalLanguageDisplayCode(language)}</td><td className="py-2 pr-4 tabular-nums">{values.clean}</td><td className="py-2 pr-4 tabular-nums">{values.needs_review}</td><td className="py-2 tabular-nums">{values.rejected}</td></tr>)}</tbody></table></div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
