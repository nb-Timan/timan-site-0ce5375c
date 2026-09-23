import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDemoLeadsForSource, formatDemoNo, type CrmDemoLead } from '@/lib/crmLeadsService';
import { useLanguage } from '@/context/LanguageContext';
import { crmDemoProgress } from '@/lib/crmDemoFlow';
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
  return <section id="lead-demo" className="mb-5 border-t border-slate-200 bg-white p-6">
    <h3 className="mb-4 text-[15px] font-semibold text-slate-900">{text('demo')}</h3>
    {loading ? <p>{text('loading')}</p> : failed ? <p role="alert">{text('unavailable')}</p> : !demos.length ? <>
      <p className="mb-3 text-sm text-slate-500">{text('empty')}</p>
      {canEdit && <Link className="text-sm font-medium text-emerald-700 hover:underline" to={`/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(leadId)}`}>{text('plan')}</Link>}
    </> : demos.map(demo => {
      const progress = crmDemoProgress(demo);
      return <div key={demo.id} className="border-t border-slate-100 py-3 first:border-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-500">{formatDemoNo(demo.demo_no)}</span>
          <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">{text(progress)}</span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {([
            ['date', demo.demo_date], ['machine', [demo.demo_machine, ...(demo.demo_equipment || [])].filter(Boolean).join(' · ')],
            ['dealer', demo.dealer_company], ['demonstrator', demo.dealer_rep], ['seller', demo.owner_name],
            ['result', demo.completed_at ? text(demo.result_status as DemoFlowTextKey) : demo.result_status],
          ] as [DemoFlowTextKey, string | null | undefined][]).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="break-words">{value || '—'}</dd></div>)}
        </dl>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-emerald-700">
          <Link to={`/portal/crm/demo-leads/${demo.id}`}>{text('open')}</Link>
          {canEdit && !demo.completed_at && <Link to={`/portal/crm/demo-leads/new?demoId=${demo.id}`}>{text('edit')}</Link>}
          {canEdit && progress === 'awaiting' && <Link to={`/portal/crm/demo-leads/${demo.id}?result=1`}>{text('recordResult')}</Link>}
        </div>
      </div>;
    })}
  </section>;
}
