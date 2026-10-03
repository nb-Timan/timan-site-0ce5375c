import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDemoLeadsForSource, formatDemoNo, type CrmDemoLead } from '@/lib/crmLeadsService';
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
              {completedResultFields.some(([, value]) => Boolean(value)) && <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {completedResultFields.filter(([, value]) => Boolean(value)).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="break-words font-medium text-slate-900">{value}</dd></div>)}
              </dl>}
            </div> : summaryFields.some(([, value]) => Boolean(value)) && <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {summaryFields.filter(([, value]) => Boolean(value)).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="break-words">{value}</dd></div>)}
            </dl>}
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
