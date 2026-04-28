import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { listLeads, CrmLead, PIPELINE_STAGES } from '@/lib/crmLeadsService';
import { Plus, Search, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const STAGE_CLR: Record<string, string> = {
  Lead:        'bg-sky-50 text-sky-700 border-sky-200',
  Qualified:   'bg-violet-50 text-violet-700 border-violet-200',
  'Offer sent':'bg-amber-50 text-amber-800 border-amber-200',
  Negotiation: 'bg-orange-50 text-orange-700 border-orange-200',
  Won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:        'bg-rose-50 text-rose-700 border-rose-200',
};

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n);
}

export default function CrmLeadsPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const rows = await listLeads({ ownerUserId: isAdmin ? null : sellerId });
      if (!cancelled) { setLeads(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, isAdmin]);

  const filtered = useMemo(() => {
    let r = leads;
    if (stage) r = r.filter(l => l.pipeline_stage === stage);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(l =>
        (l.title || '').toLowerCase().includes(s) ||
        (l.contact_information || '').toLowerCase().includes(s) ||
        (l.owner_name || '').toLowerCase().includes(s)
      );
    }
    return r;
  }, [leads, q, stage]);

  const totalValue = useMemo(() => filtered.reduce((s, l) => s + (l.estimated_value || 0), 0), [filtered]);

  return (
    <CrmLayout pageTitle="Leads">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2d5a27]" /> Leads
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'Alle leads i organisationen' : 'Dine tildelte leads'} · {filtered.length} stk · {formatKr(totalValue)}
          </p>
        </div>
        <Link to="/portal/crm/leads/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] text-white text-sm font-medium px-4 py-2.5 shadow-sm transition">
          <Plus className="h-4 w-4" /> Nyt lead
        </Link>
      </div>

      {/* Filter strip */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg titel, kontakt eller sælger…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none" />
        </div>
        <select value={stage} onChange={e=>setStage(e.target.value)}
          className="rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">Alle pipeline-stadier</option>
          {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-500">Indlæser…</p>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">Ingen leads endnu</p>
            <p className="text-xs text-gray-500 mt-1">Opret dit første lead via knappen "Nyt lead".</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
              <tr>
                <th className="text-left px-5 py-3">Titel</th>
                <th className="text-left px-5 py-3">Kunde-type</th>
                <th className="text-left px-5 py-3">Maskiner</th>
                <th className="text-left px-5 py-3">Sælger</th>
                <th className="text-left px-5 py-3">Stage</th>
                <th className="text-right px-5 py-3">Værdi</th>
                <th className="text-right px-5 py-3">Sandsyn.</th>
                <th className="text-right px-5 py-3">Næste opf.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{l.title}</td>
                  <td className="px-5 py-3.5 text-gray-600">{l.customer_type || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600 max-w-[220px] truncate">{l.machine_types?.join(', ') || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{l.owner_name || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border', STAGE_CLR[l.pipeline_stage] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                      {l.pipeline_stage}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-900">{formatKr(l.estimated_value)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">{l.probability != null ? `${l.probability}%` : '—'}</td>
                  <td className="px-5 py-3.5 text-right text-gray-600">{l.next_followup_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CrmLayout>
  );
}
