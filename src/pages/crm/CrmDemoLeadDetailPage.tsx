import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useEffectivePortalUserState } from '@/lib/viewAsUser';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { getCrmDemo, saveCrmDemoResult, getLead, formatDemoNo, DEMO_RESULT_STATUS, type CrmDemoLead, type CrmDemoResultInput } from '@/lib/crmLeadsService';
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
  const text = (key: DemoFlowTextKey) => demoFlowText(key, uiLanguage);
  const [demo, setDemo] = useState<CrmDemoLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CrmDemoResultInput>({ ...EMPTY_DEMO_RESULT });
  useEffect(() => {
    if (!id || resolving || !effectiveUser) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const owner = await resolveSellerId(appUser?.email);
      if (!isCrmAdmin(role) && !isScopedSeller(role)) return null;
      if (isScopedSeller(role) && !owner) return null;
      return getCrmDemo(id, isScopedSeller(role) ? owner : null);
    })().then(async row => {
      if (cancelled) return;
      setDemo(row);
      if (row) {
        const lead = row.source_lead_id ? await getLead(row.source_lead_id) : null;
        if (!cancelled) setResult({
          interest_level: row.interest_level, wants_offer: row.wants_offer, result_status: row.result_status,
          probability: row.probability, estimated_value: row.estimated_value,
          competitors_present: row.competitors_present, competitor_name: row.competitor_name,
          notes_after_demo: row.notes_after_demo, followup_date: lead?.next_followup_date || null, update_followup: false,
        });
      }
    }).catch(() => { if (!cancelled) setDemo(null); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, resolving, effectiveUser?.id, appUser?.email, role]);
  const canEdit = !resolving && (isCrmAdmin(role) || isScopedSeller(role));
  const progress = crmDemoProgress(demo);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Copenhagen' });
  const canRecord = canEdit && demo?.source_lead_id && demo.demo_date && demo.demo_date <= today && progress !== 'cancelled';
  const editingResult = Boolean(canRecord && params.get('result'));
  const patch = (value: Partial<CrmDemoResultInput>) => setResult(prev => ({ ...prev, ...value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!demo || !effectiveUser?.id || saving) return;
    setSaving(true);
    try {
      setDemo(await saveCrmDemoResult(demo.id, result, effectiveUser.id));
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
          {demo.source_lead_id && <Link to={`/portal/crm/leads/${demo.source_lead_id}#lead-demo`}>CRM</Link>}
          {canEdit && demo.source_lead_id && !demo.completed_at && <Link to={`/portal/crm/demo-leads/new?demoId=${demo.id}`}>{text('edit')}</Link>}
          {canRecord && !editingResult && <button type="button" onClick={() => setParams({result: '1'})}>{text('recordResult')}</button>}
        </div>
        {editingResult ? <form onSubmit={save} className="border-t border-slate-200 py-5">
          <h3 className="mb-5 font-semibold">{text('recordResult')}</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            {formField('interest', <select required className={input} value={result.interest_level ?? ''} onChange={e => patch({interest_level: e.target.value ? Number(e.target.value) : null})}><option value="">{text('choose')}</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select>)}
            {formField('wantsOffer', <select required className={input} value={result.wants_offer ?? ''} onChange={e => patch({wants_offer: (e.target.value || null) as 'yes' | 'no' | null})}><option value="">{text('choose')}</option><option value="yes">{text('yes')}</option><option value="no">{text('no')}</option></select>)}
            {formField('followup', <input type="date" className={input} value={result.followup_date || ''} onChange={e => patch({followup_date: e.target.value || null, update_followup: true})} />)}
            {formField('probability', <input type="number" min={0} max={100} className={input} value={result.probability ?? ''} onChange={e => patch({probability: e.target.value === '' ? null : Number(e.target.value)})} />)}
            {formField('value', <input type="number" min={0} step="0.01" className={input} value={result.estimated_value ?? ''} onChange={e => patch({estimated_value: e.target.value === '' ? null : Number(e.target.value)})} />)}
            {formField('competitors', <select className={input} value={result.competitors_present ?? ''} onChange={e => patch({competitors_present: (e.target.value || null) as 'yes' | 'no' | null})}><option value="">{text('choose')}</option><option value="yes">{text('yes')}</option><option value="no">{text('no')}</option></select>)}
            {formField('result', <select required className={input} value={result.result_status ?? ''} onChange={e => patch({result_status: e.target.value || null})}><option value="">{text('choose')}</option>{DEMO_RESULT_STATUS.map(status => <option key={status} value={status}>{text(status as DemoFlowTextKey)}</option>)}</select>)}
            {result.competitors_present === 'yes' && formField('competitorName', <input className={input} value={result.competitor_name || ''} onChange={e => patch({competitor_name: e.target.value || null})} />)}
            {formField('notesAfter', <textarea className={input + ' min-h-28'} value={result.notes_after_demo || ''} onChange={e => patch({notes_after_demo: e.target.value || null})} />)}
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="px-3 py-2 text-sm" onClick={() => setParams({})}>{text('cancel')}</button>
            <button type="submit" disabled={saving} className="rounded-md bg-emerald-800 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? text('loading') : text('save')}</button>
          </div>
        </form> : <dl className="grid gap-5 py-5 sm:grid-cols-2">
          {field('interest', demo.interest_level != null ? `${demo.interest_level}/5` : null)}
          {field('wantsOffer', demo.wants_offer ? text(demo.wants_offer) : null)}
          {field('result', demo.result_status ? text(demo.result_status as DemoFlowTextKey) || demo.result_status : null)}
          {field('followup', result.followup_date)}{field('probability', demo.probability != null ? `${demo.probability}%` : null)}
          {field('value', demo.estimated_value)}{field('competitors', demo.competitors_present ? text(demo.competitors_present) : null)}
          {field('notesAfter', demo.notes_after_demo)}
        </dl>}
      </>}
    </div>
  </CrmLayout>;
}
