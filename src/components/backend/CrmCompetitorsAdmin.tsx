import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { CONTRACT_WORLD_COUNTRY_CODES } from '@/lib/contractWorldCountries';
import { COMPETITOR_MACHINE_GROUPS, findPotentialCompetitorDuplicate, listCrmCompetitors, saveCrmCompetitor, type CrmCompetitor } from '@/lib/crmCompetitorsService';
import { crmCompetitorText, type CrmCompetitorTextKey } from '@/lib/crmCompetitorI18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Draft = Pick<CrmCompetitor, 'name' | 'country_code' | 'website_url' | 'active' | 'machine_groups'> & { id?: string };
const empty = (): Draft => ({ name: '', country_code: null, website_url: null, active: true, machine_groups: [] });
const input = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm';

export function CrmCompetitorsAdmin() {
  const { uiLanguage } = useLanguage();
  const text = (key: CrmCompetitorTextKey) => crmCompetitorText(key, uiLanguage);
  const [rows, setRows] = useState<CrmCompetitor[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicate = useMemo(() => draft && findPotentialCompetitorDuplicate(draft.name, rows, draft.id), [draft, rows]);
  const countryNames = useMemo(() => new Intl.DisplayNames([uiLanguage], { type: 'region' }), [uiLanguage]);

  async function refresh() {
    try { setRows(await listCrmCompetitors()); setError(null); }
    catch (cause) { console.error('Competitor list failed', cause); setError(text('error')); }
  }
  useEffect(() => {
    let cancelled = false;
    void listCrmCompetitors().then(data => { if (!cancelled) setRows(data); })
      .catch(cause => { if (!cancelled) { console.error('Competitor list failed', cause); setError(crmCompetitorText('error', uiLanguage)); } });
    return () => { cancelled = true; };
  }, [uiLanguage]);
  async function save() {
    if (!draft || busy || (duplicate && !confirmedDuplicate)) return;
    setBusy(true); setError(null);
    try {
      await saveCrmCompetitor(draft);
      setDraft(null);
      await refresh();
    } catch (cause) { console.error('Competitor save failed', cause); setError(text('error')); }
    finally { setBusy(false); }
  }
  async function toggle(row: CrmCompetitor) {
    setBusy(true); setError(null);
    try { await saveCrmCompetitor({ ...row, active: !row.active }); await refresh(); }
    catch (cause) { console.error('Competitor status failed', cause); setError(text('error')); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-slate-900">{text('competitors')}</h2>
      <button type="button" onClick={() => { setDraft(empty()); setConfirmedDuplicate(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />{text('new')}</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">{text('name')}</th><th className="p-3">{text('country')}</th><th className="p-3">{text('website')}</th><th className="p-3">{text('machines')}</th><th className="p-3">{text('status')}</th><th className="p-3" /></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}>
          <td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.country_code || '—'}</td>
          <td className="p-3 break-all">{row.website_url ? <a href={row.website_url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{row.website_url}</a> : '—'}</td>
          <td className="p-3">{row.machine_groups.join(', ') || '—'}</td><td className="p-3">{text(row.active ? 'active' : 'inactive')}</td>
          <td className="p-3"><div className="flex gap-3"><button type="button" title={text('edit')} onClick={() => { setDraft({ ...row }); setConfirmedDuplicate(false); }}><Pencil className="h-4 w-4" /></button><button type="button" disabled={busy} className="text-emerald-700 disabled:opacity-50" onClick={() => void toggle(row)}>{text(row.active ? 'deactivate' : 'activate')}</button></div></td>
        </tr>)}</tbody>
      </table>
    </div>
    <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}><DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>{draft?.id ? `${text('edit')} ${draft.name}` : text('new')}</DialogTitle></DialogHeader>
      {draft && <div className="space-y-3 text-sm">
        <label className="block">{text('name')} *<input className={input} value={draft.name} onChange={event => { setDraft({ ...draft, name: event.target.value }); setConfirmedDuplicate(false); }} /></label>
        {duplicate && <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">{text('duplicate')}{duplicate.name}<label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={confirmedDuplicate} onChange={event => setConfirmedDuplicate(event.target.checked)} />{text('confirmDuplicate')}</label></div>}
        <label className="block">{text('country')}<select className={input} value={draft.country_code ?? ''} onChange={event => setDraft({ ...draft, country_code: event.target.value || null })}><option value="">—</option>{CONTRACT_WORLD_COUNTRY_CODES.map(code => <option key={code} value={code}>{countryNames.of(code) || code}</option>)}</select></label>
        <label className="block">{text('website')}<input className={input} type="url" value={draft.website_url ?? ''} onChange={event => setDraft({ ...draft, website_url: event.target.value || null })} placeholder="https://" /></label>
        <fieldset><legend>{text('machines')}</legend><div className="grid gap-2 sm:grid-cols-2">{COMPETITOR_MACHINE_GROUPS.map(group => <label key={group} className="flex items-center gap-2"><input type="checkbox" checked={draft.machine_groups.includes(group)} onChange={event => setDraft({ ...draft, machine_groups: event.target.checked ? [...draft.machine_groups, group] : draft.machine_groups.filter(value => value !== group) })} />{group}</label>)}</div></fieldset>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} />{text('active')}</label>
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setDraft(null)}>{text('cancel')}</button><button type="button" disabled={busy || !draft.name.trim() || !!duplicate && !confirmedDuplicate} onClick={() => void save()} className="rounded-md bg-emerald-800 px-4 py-2 text-white disabled:opacity-50">{text('save')}</button></div>
      </div>}
    </DialogContent></Dialog>
  </section>;
}
