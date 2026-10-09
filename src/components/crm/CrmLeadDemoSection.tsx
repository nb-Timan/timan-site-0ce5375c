import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDemoLeadsForSource, saveCrmDemoResult, formatDemoNo, type CrmDemoLead, type CrmDemoResultInput } from '@/lib/crmLeadsService';
import { listCrmCompetitors, type CrmCompetitor } from '@/lib/crmCompetitorsService';
import { CrmDemoResultControls } from '@/components/crm/CrmDemoResultControls';
import { useLanguage } from '@/context/LanguageContext';
import { crmDemoProgress, formatDemoDate } from '@/lib/crmDemoFlow';
import { demoFlowText, type DemoFlowTextKey } from '@/lib/crmDemoFlowI18n';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';

export function CrmLeadDemoSection({ leadId }: { leadId: string }) {
  const { uiLanguage } = useLanguage();
  const { appUser } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const role = derivePortalRole(effectiveUser);
  const canEdit = !resolving && (isCrmAdmin(role) || isScopedSeller(role));
  const [demos, setDemos] = useState<CrmDemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [competitors, setCompetitors] = useState<CrmCompetitor[]>([]);
  const [competitorError, setCompetitorError] = useState(false);
  const text = (key: DemoFlowTextKey) => demoFlowText(key, uiLanguage);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void listDemoLeadsForSource(leadId).then(rows => { if (!cancelled) setDemos(rows); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId]);
  useEffect(() => {
    let cancelled = false;
    void listCrmCompetitors().then(rows => { if (!cancelled) { setCompetitors(rows); setCompetitorError(false); } })
      .catch(() => { if (!cancelled) setCompetitorError(true); });
    return () => { cancelled = true; };
  }, []);
  return <section id="lead-demo" className="mb-5 border-t border-slate-200 bg-white p-4 sm:p-5">
    <h3 className="mb-2 text-[15px] font-semibold text-slate-900">{text('demo')}</h3>
    {loading ? <p>{text('loading')}</p> : failed ? <p role="alert">{text('unavailable')}</p> : !demos.length ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{text('empty')}</p>
      {canEdit && <Link className="text-sm font-medium text-emerald-700 hover:underline" to={`/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(leadId)}`}>{text('plan')}</Link>}
    </div> : demos.map(demo => {
      const progress = crmDemoProgress(demo);
      const machine = [demo.demo_machine, ...(demo.demo_equipment || [])].filter(Boolean).join(' · ');
      const summaryFields: [DemoFlowTextKey, string | null | undefined][] = [
            ['date', demo.demo_date],
            ['machine', machine],
            ['dealer', demo.dealer_company],
            ['demonstrator', demo.dealer_rep],
          ];
      const completedSummary = [
        `${text('demoRun')} ${formatDemoDate(demo.demo_date) || ''}`.trim(),
        demo.dealer_company,
      ].filter(Boolean).join(' · ');
      const completedResultFields: [DemoFlowTextKey, string | null][] = [
        ['interestSummary', demo.interest_level != null ? `${demo.interest_level}/5` : null],
        ['competitorsSummary', demo.competitors_present ? text(demo.competitors_present) : null],
      ];
      return <div key={demo.id} className="border-t border-slate-100 py-3 first:border-0">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{formatDemoNo(demo.demo_no)}</span>
            {progress !== 'completed' && <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">{text(progress)}</span>}
          </div>
          <div className="min-w-0 sm:col-start-1">
            {progress === 'completed' ? <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">{completedSummary}</p>
              {!canEdit && completedResultFields.some(([, value]) => Boolean(value)) && <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {completedResultFields.filter(([, value]) => Boolean(value)).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="break-words font-medium text-slate-900">{value}</dd></div>)}
              </dl>}
            </div> : summaryFields.some(([, value]) => Boolean(value)) && <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {summaryFields.filter(([, value]) => Boolean(value)).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="break-words">{value}</dd></div>)}
            </dl>}
            {canEdit ? <DemoInlineResult demo={demo} competitors={competitors} competitorError={competitorError} language={uiLanguage} actorId={effectiveUser?.id ?? appUser?.id ?? null} onSaved={saved => setDemos(rows => rows.map(row => row.id === saved.id ? saved : row))} /> : progress !== 'completed' && <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{completedResultFields.map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd>{value || text('notSpecified')}</dd></div>)}</dl>}
          </div>
          <div className="flex w-full flex-col gap-2 text-sm font-medium sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canEdit && progress === 'awaiting' && <Link className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-800 px-3 py-2 text-white hover:bg-emerald-900" to={`/portal/crm/demo-leads/${demo.id}?result=1`}>{text('recordResult')}</Link>}
            <Link className={`inline-flex min-h-10 items-center justify-center ${progress === 'awaiting' ? 'rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50' : 'rounded-md bg-emerald-800 px-3 py-2 text-white hover:bg-emerald-900'}`} to={`/portal/crm/demo-leads/${demo.id}`}>{text('open')}</Link>
            {canEdit && progress !== 'cancelled' && <Link className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50" to={`/portal/crm/demo-leads/new?demoId=${demo.id}`}>{text('edit')}</Link>}
          </div>
        </div>
      </div>;
    })}
  </section>;
}

function DemoInlineResult({ demo, competitors, competitorError, language, actorId, onSaved }: {
  demo: CrmDemoLead;
  competitors: CrmCompetitor[];
  competitorError: boolean;
  language: ReturnType<typeof useLanguage>['uiLanguage'];
  actorId: string | null;
  onSaved: (demo: CrmDemoLead) => void;
}) {
  const initial = (): CrmDemoResultInput => ({ interest_level: demo.interest_level, competitors_present: demo.competitors_present, competitor_id: demo.competitor_id ?? null });
  const [value, setValue] = useState<CrmDemoResultInput>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = value.interest_level !== demo.interest_level || value.competitors_present !== demo.competitors_present || value.competitor_id !== (demo.competitor_id ?? null);
  async function save() {
    if (saving || !dirty) return;
    setSaving(true); setError(false); setSaved(false);
    try {
      const updated = await saveCrmDemoResult(demo.id, value, actorId, true);
      onSaved(updated);
      setValue({ interest_level: updated.interest_level, competitors_present: updated.competitors_present, competitor_id: updated.competitor_id ?? null });
      setSaved(true);
    } catch (cause) { console.error('Demo inline result save failed', cause); setError(true); }
    finally { setSaving(false); }
  }
  return <div className="mt-4 space-y-2">
    <CrmDemoResultControls value={value} onChange={next => { setValue(next); setSaved(false); }} competitors={competitors} language={language} machine={demo.demo_machine} disabled={saving || competitorError} />
    {value.competitors_present === 'yes' && !value.competitor_id && demo.competitor_name && <p className="text-xs text-slate-500">{demo.competitor_name}</p>}
    {competitorError && <p role="alert" className="text-xs text-red-700">{demoFlowText('error', language)}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{demoFlowText('error', language)}</p>}
    <div className="flex min-h-10 items-center gap-3">
      {dirty && <button type="button" onClick={save} disabled={saving || competitorError} className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? demoFlowText('loading', language) : demoFlowText('save', language)}</button>}
      {saved && <span role="status" className="text-xs text-emerald-700">{demoFlowText('saved', language)}</span>}
    </div>
  </div>;
}
