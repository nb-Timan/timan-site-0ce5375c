import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, GitCompare, ListChecks, Play, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { getSupportEvaluationCopy } from '@/lib/i18n/supportEvaluationTranslations';
import { approveSupportEvaluationBaseline, fetchSupportEvaluationDashboard, startSupportEvaluation, type SupportEvaluationDashboardData } from '@/lib/supportEvaluationService';
import type { SupportEvaluationCaseResult, SupportEvaluationMetrics, SupportEvaluationTier } from '@/lib/supportEvaluationTypes';
import { cn } from '@/lib/utils';

type EvaluationView = 'overview' | 'suites' | 'runs' | 'failures' | 'security' | 'comparison';

const pct = (value: number | undefined) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const metric = (metrics: SupportEvaluationMetrics | null | undefined, key: keyof SupportEvaluationMetrics) => Number(metrics?.[key] || 0);
const signed = (value: number, digits = 2) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

function EvaluationMetric({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return (
    <div className="min-w-0 border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums', good === true ? 'text-emerald-700' : good === false ? 'text-rose-700' : 'text-slate-950')}>{value}</p>
    </div>
  );
}
function FailureList({ rows, empty }: { rows: SupportEvaluationCaseResult[]; empty: string }) {
  if (!rows.length) return <div className="rounded-md border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm text-slate-500">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {rows.map((row) => (
        <article key={row.caseKey} className="border-b border-slate-200 p-4 last:border-b-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="font-semibold text-slate-950">{row.caseKey}</h3><p className="mt-1 text-xs text-slate-500">{row.category} · {row.language.toUpperCase()}</p></div>
            <span className={cn('rounded px-2 py-1 text-xs font-bold', row.severity === 'SEV-0' || row.severity === 'SEV-1' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')}>{row.severity}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.assertions.filter((assertion) => !assertion.passed).map((assertion, index) => <span key={`${assertion.type}-${index}`} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{assertion.type}</span>)}
          </div>
        </article>
      ))}
    </div>
  );
}
export function SupportEvaluationPanel() {
  const { uiLanguage } = useLanguage();
  const { toast } = useToast();
  const copy = getSupportEvaluationCopy(uiLanguage);
  const [view, setView] = useState<EvaluationView>('overview');
  const [data, setData] = useState<SupportEvaluationDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<SupportEvaluationTier | null>(null);
  const [approvingBaseline, setApprovingBaseline] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchSupportEvaluationDashboard()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (tier: SupportEvaluationTier) => {
    setRunning(tier);
    try { await startSupportEvaluation(tier); toast({ title: copy.runStarted }); await load(); }
    catch (reason) { toast({ title: copy.runFailed, description: reason instanceof Error ? reason.message : String(reason), variant: 'destructive' }); }
    finally { setRunning(null); }
  };
  const approveBaseline = async () => {
    if (!data?.latestRun) return;
    setApprovingBaseline(true);
    try {
      await approveSupportEvaluationBaseline(
        data.latestRun.id,
        `Phase 8 approved baseline: ${data.latestRun.suite_key} v${data.latestRun.suite_version} passed all release gates.`,
      );
      toast({ title: copy.baselineApproved });
      await load();
    } catch (reason) {
      toast({ title: copy.baselineFailed, description: reason instanceof Error ? reason.message : String(reason), variant: 'destructive' });
    } finally {
      setApprovingBaseline(false);
    }
  };
  const tabs = useMemo(() => [
    ['overview', copy.overview, BarChart3], ['suites', copy.suites, ListChecks], ['runs', copy.runs, Play],
    ['failures', copy.failures, XCircle], ['security', copy.security, ShieldAlert], ['comparison', copy.comparison, GitCompare],
  ] as const, [copy]);

  if (loading) return <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{copy.loading}</div>;
  if (error) return <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}<Button variant="outline" size="sm" className="ml-3" onClick={() => void load()}>{copy.refresh}</Button></div>;
  if (!data) return null;
  const current = data.latestRun;
  const metrics = current?.metrics;
  const passed = current?.release_decision === 'RELEASE_PASS';
  const baseline = data.baselineRun;
  const comparisonRows = baseline && current ? [
    { label: copy.security, base: metric(baseline.metrics, 'authorizedRetrievalRate'), candidate: metric(current.metrics, 'authorizedRetrievalRate'), unit: '%', digits: 2 },
    { label: copy.grounding, base: metric(baseline.metrics, 'groundingPassRate'), candidate: metric(current.metrics, 'groundingPassRate'), unit: '%', digits: 2 },
    { label: 'Recall@5', base: metric(baseline.metrics, 'recallAt5'), candidate: metric(current.metrics, 'recallAt5'), unit: '%', digits: 2 },
    { label: copy.actions, base: metric(baseline.metrics, 'criticalActionCorrectness'), candidate: metric(current.metrics, 'criticalActionCorrectness'), unit: '%', digits: 2 },
    { label: copy.latency, base: metric(baseline.metrics, 'p95LatencyMs'), candidate: metric(current.metrics, 'p95LatencyMs'), unit: ' ms', digits: 0 },
    { label: copy.cost, base: metric(baseline.metrics, 'totalCost'), candidate: metric(current.metrics, 'totalCost'), unit: '', digits: 6 },
  ] : [];
  const roleReadiness = current?.machine_result?.roleReadiness || {};
  const readinessRoles = [
    ['Backend', 'BACKEND'], ['Sales', 'SALES'], ['Dealer', 'DEALER'], ['Importer', 'IMPORTER'],
    ['Service Partner', 'SERVICE_PARTNER'], ['Technical & Service', 'TECHNICAL_SERVICE'],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {tabs.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setView(id)} className={cn('inline-flex min-h-10 shrink-0 items-center gap-2 rounded px-3 text-sm font-semibold', view === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}><Icon className="h-4 w-4" />{label}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void run('SMOKE')} disabled={!!running}><Play className="mr-2 h-4 w-4" />{copy.runSmoke}</Button>
          <Button size="sm" variant="outline" onClick={() => void run('SECURITY')} disabled={!!running}><ShieldCheck className="mr-2 h-4 w-4" />{copy.runSecurity}</Button>
          <Button size="sm" onClick={() => void run('FULL')} disabled={!!running}><Play className="mr-2 h-4 w-4" />{copy.runFull}</Button>
          {current?.tier === 'FULL' && current.release_decision === 'RELEASE_PASS' && baseline?.id !== current.id && (
            <Button size="sm" variant="outline" onClick={() => void approveBaseline()} disabled={approvingBaseline || !!running}>
              <ShieldCheck className="mr-2 h-4 w-4" />{copy.approveBaseline}
            </Button>
          )}
          <Button size="icon" variant="ghost" title={copy.refresh} onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {view === 'overview' && (!current ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{copy.noRuns}</div> : <>
        <div className={cn('flex items-center gap-3 rounded-md border px-4 py-3', passed ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>
          {passed ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}<strong>{passed ? copy.releasePass : copy.releaseBlocked}</strong><span className="text-sm">{current.suite_key} v{current.suite_version}</span>
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <EvaluationMetric label={copy.passRate} value={pct(metric(metrics, 'passRate'))} good={metric(metrics, 'failed') === 0} />
          <EvaluationMetric label={copy.hardGates} value={passed ? 'PASS' : 'FAIL'} good={passed} />
          <EvaluationMetric label={copy.grounding} value={pct(metric(metrics, 'groundingPassRate'))} />
          <EvaluationMetric label={copy.citations} value={pct(metric(metrics, 'citationValidity'))} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          <EvaluationMetric label={copy.confidence} value={pct(metric(metrics, 'confidenceAccuracy'))} />
          <EvaluationMetric label={copy.unsafeHigh} value={metric(metrics, 'unsafeHighCount')} good={metric(metrics, 'unsafeHighCount') === 0} />
          <EvaluationMetric label={copy.actions} value={pct(metric(metrics, 'criticalActionCorrectness'))} />
          <EvaluationMetric label={copy.regressions} value={data.failures.filter((item) => item.newRegression).length} good={!data.failures.some((item) => item.newRegression)} />
        </div>
        <div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-3">
          <EvaluationMetric label={copy.latency} value={`${metric(metrics, 'p95LatencyMs')} ms`} />
          <EvaluationMetric label={copy.cost} value={metric(metrics, 'totalCost').toFixed(6)} />
          <EvaluationMetric label={copy.review} value={data.openReviews} good={data.openReviews === 0} />
        </div>
      </>)}

      {view === 'suites' && <div className="overflow-hidden rounded-md border border-slate-200 bg-white">{data.suites.map((suite) => <div key={suite.id} className="flex flex-col gap-2 border-b border-slate-200 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-950">{suite.suite_key}</h3><p className="text-sm text-slate-600">{suite.title}</p></div><div className="text-sm text-slate-500">{(suite.versions || []).map((version) => `v${version.version_number} · ${version.case_count} ${copy.cases}`).join(' | ') || '—'}</div></div>)}</div>}
      {view === 'runs' && (!data.recentRuns.length ? <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{copy.noRuns}</div> : <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Suite</th><th className="px-4 py-3">{copy.version}</th><th className="px-4 py-3">{copy.status}</th><th className="px-4 py-3">{copy.model}</th><th className="px-4 py-3">{copy.passRate}</th><th className="px-4 py-3">{copy.latency}</th></tr></thead><tbody>{data.recentRuns.map((run) => <tr key={run.id} className="border-t border-slate-200"><td className="px-4 py-3 font-semibold">{run.suite_key}</td><td className="px-4 py-3">{run.suite_version}</td><td className="px-4 py-3">{run.release_decision || run.status}</td><td className="px-4 py-3">{run.model}</td><td className="px-4 py-3">{pct(run.metrics?.passRate)}</td><td className="px-4 py-3">{run.metrics?.p95LatencyMs || 0} ms</td></tr>)}</tbody></table></div>)}
      {view === 'failures' && <FailureList rows={data.failures} empty={copy.noFailures} />}
      {view === 'security' && <><div className="grid overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5"><EvaluationMetric label="Authorization" value={data.securityFailures.filter((item) => item.assertions.some((a) => a.type.startsWith('AUTHORIZATION'))).length} /><EvaluationMetric label="Restricted-source leakage" value={data.securityFailures.filter((item) => item.assertions.some((a) => a.type.includes('FORBIDDEN_SOURCE'))).length} /><EvaluationMetric label="Prompt injection" value={data.securityFailures.filter((item) => item.caseKey.includes('prompt') || item.caseKey.includes('unicode')).length} /><EvaluationMetric label="Partner isolation" value={data.securityFailures.filter((item) => item.caseKey.includes('partner')).length} /><EvaluationMetric label="Action authorization" value={data.securityFailures.filter((item) => item.assertions.some((a) => a.type === 'ACTION_NOT_EXECUTED')).length} /></div><FailureList rows={data.securityFailures} empty={copy.noSecurityFailures} /></>}
      {view === 'comparison' && <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-md border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">{copy.baseline}</p><h3 className="mt-2 font-semibold text-slate-950">{baseline ? `${baseline.suite_key} v${baseline.suite_version}` : '—'}</h3><p className="mt-1 text-sm text-slate-500">{baseline?.model || '—'} · {pct(baseline?.metrics?.passRate)}</p><p className="mt-2 text-xs text-slate-500">{copy.promptVersion}: {baseline?.prompt_version || '—'} · {copy.knowledgeVersion}: {baseline?.knowledge_snapshot || '—'}</p><p className="mt-1 break-all font-mono text-xs text-slate-400">{baseline?.git_commit || '—'}</p></section><section className="rounded-md border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase text-slate-500">{copy.candidate}</p><h3 className="mt-2 font-semibold text-slate-950">{current ? `${current.suite_key} v${current.suite_version}` : '—'}</h3><p className="mt-1 text-sm text-slate-500">{current?.model || '—'} · {pct(current?.metrics?.passRate)}</p><p className="mt-2 text-xs text-slate-500">{copy.promptVersion}: {current?.prompt_version || '—'} · {copy.knowledgeVersion}: {current?.knowledge_snapshot || '—'}</p><p className="mt-1 break-all font-mono text-xs text-slate-400">{current?.git_commit || '—'}</p>{baseline && current && Number(current.metrics?.totalCost || 0) > Number(baseline.metrics?.totalCost || 0) * 1.15 && <p className="mt-3 text-sm font-medium text-amber-700">{copy.costReview}</p>}</section>{comparisonRows.length > 0 && <section className="overflow-x-auto rounded-md border border-slate-200 bg-white lg:col-span-2"><table className="min-w-[620px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{copy.metricLabel}</th><th className="px-4 py-3">{copy.baseline}</th><th className="px-4 py-3">{copy.candidate}</th><th className="px-4 py-3">{copy.delta}</th></tr></thead><tbody>{comparisonRows.map((row) => <tr key={row.label} className="border-t border-slate-200"><td className="px-4 py-3 font-medium">{row.label}</td><td className="px-4 py-3 tabular-nums">{row.base.toFixed(row.digits)}{row.unit}</td><td className="px-4 py-3 tabular-nums">{row.candidate.toFixed(row.digits)}{row.unit}</td><td className="px-4 py-3 tabular-nums">{signed(row.candidate - row.base, row.digits)}{row.unit}</td></tr>)}</tbody></table></section>}<section className="rounded-md border border-slate-200 bg-white p-4 lg:col-span-2"><p className="text-xs font-semibold uppercase text-slate-500">{copy.roleReadiness}</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{readinessRoles.map(([label, key]) => { const state = roleReadiness[key] || 'NOT_READY'; return <div key={key} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm"><span>{label}</span><strong className={state === 'READY_FOR_CONTROLLED_ROLLOUT' ? 'text-emerald-700' : 'text-slate-500'}>{state === 'READY_FOR_CONTROLLED_ROLLOUT' ? copy.controlledRollout : copy.notReady}</strong></div>; })}</div></section></div>}
    </div>
  );
}
