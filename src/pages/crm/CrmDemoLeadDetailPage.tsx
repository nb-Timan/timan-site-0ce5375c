import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { getCrmDemo, saveCrmDemoResult, formatDemoNo, type CrmDemoLead, type CrmDemoResultInput } from '@/lib/crmLeadsService';
import { crmDemoProgress, EMPTY_DEMO_RESULT } from '@/lib/crmDemoFlow';
import { demoFlowText, type DemoFlowTextKey } from '@/lib/crmDemoFlowI18n';
import { toast } from 'sonner';

const input = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';
export default function CrmDemoLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { appUser } = useAppUser();
  const { effectiveUser, resolving } = useEffectivePortalUserState(appUser);
  const { uiLanguage } = useLanguage();
  const role = derivePortalRole(effectiveUser);
  const effectiveUserReady = Boolean(effectiveUser);
  const text = (key: DemoFlowTextKey) => demoFlowText(key, uiLanguage);
  const [demo, setDemo] = useState<CrmDemoLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CrmDemoResultInput>({ ...EMPTY_DEMO_RESULT });
  useEffect(() => {
    if (!id || resolving || !effectiveUserReady) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const owner = await resolveSellerId(appUser?.email);
      if (!isCrmAdmin(role) && !isScopedSeller(role)) return null;
      if (isScopedSeller(role) && !owner) return null;
      return getCrmDemo(id, isScopedSeller(role) ? owner : null);
    })().then(row => {
      if (cancelled) return;
      setDemo(row);
      if (row) {
        setResult({ interest_level: row.interest_level, competitors_present: row.competitors_present });
      }
    }).catch(() => { if (!cancelled) setDemo(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, resolving, effectiveUserReady, appUser?.email, role]);
  const canEdit = !resolving && (isCrmAdmin(role) || isScopedSeller(role));
  const progress = crmDemoProgress(demo);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Copenhagen' });
  const canRecord = canEdit && demo?.source_lead_id && demo.demo_date && demo.demo_date <= today && progress !== 'cancelled';
  const editingResult = Boolean(canRecord && params.get('result'));
  const patch = (value: Partial<CrmDemoResultInput>) => setResult(prev => ({ ...prev, ...value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!demo || saving) return;
    setSaving(true);
    try {
      setDemo(await saveCrmDemoResult(demo.id, result, effectiveUser?.id ?? appUser?.id ?? null));
      setParams({}, { replace: true });
      toast.success(text('saved'));
    } catch (error) {
      console.error('Demo result save failed', error);
      toast.error(text('error'));
    } finally { setSaving(false); }
  }
  const field = (key: DemoFlowTextKey, value: React.ReactNode) => <div key={key}><dt className="text-xs text-slate-500">{text(key)}</dt><dd className="whitespace-pre-wrap break-words text-sm">{value ?? '—'}</dd></div>;
  const formField = (key: DemoFlowTextKey, children: React.ReactNode) => <label className="flex min-w-0 flex-col gap-1.5 text-sm">{text(key)}{children}</label>;
  return <CrmLayout pageTitle={text('demo')}>
    <div className="mx-auto max-w-5xl">
      {loading ? <p>{text('loading')}</p> : !demo ? <p role="alert">{text('unavailable')}</p> : <>
        {demo.source_lead_id && <Link className="mb-3 inline-flex text-sm font-medium text-emerald-800 hover:underline" to={`/portal/crm/leads/${demo.source_lead_id}#lead-demo`}>← {text('backToLead')}</Link>}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-mono text-xs text-slate-500">{formatDemoNo(demo.demo_no)}</p><h2 className="text-xl font-semibold">{demo.title}</h2></div>
          <span className="rounded-md bg-violet-50 px-3 py-1 text-sm text-violet-800">{text(progress)}</span>
        </header>
        <dl className="grid gap-5 border-y border-slate-200 py-5 sm:grid-cols-2 lg:grid-cols-3">
          {field('date', demo.demo_date)}{field('machine', [demo.demo_machine, ...(demo.demo_equipment || [])].filter(Boolean).join(' · '))}
          {field('seller', demo.owner_name)}{field('dealer', demo.dealer_company)}{field('demonstrator', demo.dealer_rep)}
          {field('customer', demo.customer_name)}{field('address', demo.customer_address)}{field('notes', demo.notes)}
          {field('attachments', (demo.attachments || []).map(file => file.name).join(', ') || null)}
        </dl>
        <div className="my-5 flex flex-wrap gap-4 text-sm font-medium text-emerald-700">
          {canEdit && demo.source_lead_id && progress !== 'cancelled' && <Link to={`/portal/crm/demo-leads/new?demoId=${demo.id}`}>{text('edit')}</Link>}
          {canRecord && progress === 'awaiting' && !editingResult && <button type="button" onClick={() => setParams({result: '1'})}>{text('recordResult')}</button>}
          {canRecord && progress === 'completed' && !editingResult && <button type="button" onClick={() => setParams({result: '1'})}>{text('editResult')}</button>}
        </div>
        {editingResult ? <form onSubmit={save} className="border-t border-slate-200 py-5">
          <h3 className="mb-5 font-semibold">{text(progress === 'completed' ? 'editResult' : 'recordResult')}</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            {formField('interest', <select required className={input} value={result.interest_level ?? ''} onChange={e => patch({interest_level: e.target.value ? Number(e.target.value) : null})}><option value="">{text('choose')}</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select>)}
            {formField('competitors', <select className={input} value={result.competitors_present ?? ''} onChange={e => patch({competitors_present: (e.target.value || null) as 'yes' | 'no' | null})}><option value="">{text('notSpecified')}</option><option value="yes">{text('yes')}</option><option value="no">{text('no')}</option></select>)}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="px-3 py-2 text-sm" onClick={() => setParams({})}>{text('cancel')}</button>
            <button type="submit" disabled={saving} className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? text('loading') : text('save')}</button>
          </div>
        </form> : demo.completed_at ? <dl className="grid gap-5 py-5 sm:grid-cols-2">
          {field('interest', demo.interest_level != null ? `${demo.interest_level}/5` : null)}
          {field('competitors', demo.competitors_present ? text(demo.competitors_present) : text('notSpecified'))}
        </dl> : null}
      </>}
    </div>
  </CrmLayout>;
}
