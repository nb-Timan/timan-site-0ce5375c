import { useEffect, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2, MapPin, UserRound, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDemoNo, listDemoLeadsForSource, updateDemoLeadDate, type CrmDemoLead } from '@/lib/crmLeadsService';
import { toast } from 'sonner';
import { useLanguage } from '@/context/LanguageContext';
import { crmDemoStageLabel } from '@/lib/crmDemoStageI18n';

function valueOrDash(value: string | null | undefined): string {
  return value?.trim() || '—';
}

/** The demo is an activity of this lead; it never replaces the opportunity. */
export function CrmLeadDemoSection({ leadId }: { leadId: string }) {
  const { uiLanguage } = useLanguage();
  const [demos, setDemos] = useState<CrmDemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDemoId, setSavingDemoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listDemoLeadsForSource(leadId)
      .then((rows) => { if (!cancelled) setDemos(rows); })
      .catch(() => { if (!cancelled) setDemos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leadId]);

  async function changeDemoDate(demo: CrmDemoLead, demoDate: string) {
    setSavingDemoId(demo.id);
    try {
      const updated = await updateDemoLeadDate(demo.id, demoDate || null);
      setDemos((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      toast.success(demoDate ? 'Demo-dato og kalender er opdateret' : 'Demo-dato er fjernet');
    } catch (error) {
      console.error('Could not update linked demo date', error);
      toast.error('Kunne ikke opdatere demo-datoen');
    } finally {
      setSavingDemoId(null);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Demo</h3>
          <p className="mt-1 text-xs text-slate-500">Demo-dato er separat fra leadets næste opfølgning.</p>
        </div>
        <Link
          to={`/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(leadId)}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          Opret demo <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Indlæser demo</p>
      ) : demos.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">Ingen demo er knyttet til leadet endnu.</p>
      ) : demos.map((demo) => (
        <div key={demo.id} className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-violet-200 bg-white px-2 py-0.5 font-mono text-xs text-violet-800">{formatDemoNo(demo.demo_no)}</span>
              <span className="text-sm font-medium text-slate-900">{crmDemoStageLabel(demo.demo_date ? 'agreed' : 'requested', uiLanguage)}</span>
            </div>
            <Link to={`/portal/crm/demo-leads/${demo.id}`} className="text-xs font-medium text-violet-700 hover:underline">Åbn demo</Link>
          </div>
          <dl className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs text-slate-500">Type</dt><dd>{(demo.machine_category || []).join(' · ') || '—'}</dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" /> Dato</dt><dd>{valueOrDash(demo.demo_date)}</dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-slate-500"><Wrench className="h-3.5 w-3.5" /> Maskine / udstyr</dt><dd>{[demo.demo_machine, ...(demo.demo_equipment || [])].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> Lokation</dt><dd>{valueOrDash(demo.customer_address)}</dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-slate-500"><UserRound className="h-3.5 w-3.5" /> Ansvarlig</dt><dd>{valueOrDash(demo.owner_name)}</dd></div>
            <div><dt className="text-xs text-slate-500">Resultat</dt><dd>{valueOrDash(demo.result_status)}</dd></div>
            <div><dt className="text-xs text-slate-500">Noter</dt><dd className="whitespace-pre-wrap">{valueOrDash(demo.notes_after_demo || demo.notes)}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-violet-100 pt-3">
            <label className="text-xs font-medium text-slate-600">
              Demo-dato
              <input
                type="date"
                value={demo.demo_date || ''}
                onChange={(event) => void changeDemoDate(demo, event.target.value)}
                disabled={savingDemoId === demo.id}
                className="ml-2 h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            {savingDemoId === demo.id && <span className="text-xs text-slate-500">Gemmer…</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
