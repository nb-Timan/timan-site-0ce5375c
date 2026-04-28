import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { listDemoLeads, CrmDemoLead, DEMO_RESULT_STATUS } from '@/lib/crmLeadsService';
import { Plus, Sparkles, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CLR: Record<string, string> = {
  'Hot lead':        'bg-rose-50 text-rose-700 border-rose-200',
  'Warm lead':       'bg-amber-50 text-amber-800 border-amber-200',
  'Cold lead':       'bg-sky-50 text-sky-700 border-sky-200',
  'Offer requested': 'bg-violet-50 text-violet-700 border-violet-200',
  Won:               'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:              'bg-rose-50 text-rose-700 border-rose-200',
  'No fit':          'bg-gray-100 text-gray-700 border-gray-200',
};

export default function CrmDemoLeadsPage() {
  const { appUser } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const canAccess = isAdmin || isScopedSeller(portalRole);

  const [rows, setRows] = useState<CrmDemoLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      // Fetch all rows, then resolve seed-row owner_user_id via owner_email,
      // then filter for sellers. Backend sees everything.
      const all = await listDemoLeads({});
      const resolved = await resolveSeedOwners(all);
      const visible = isAdmin ? resolved
        : resolved.filter(r => r.owner_user_id && r.owner_user_id === sellerId);
      if (!cancelled) { setRows(visible); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, isAdmin]);

  const filtered = useMemo(() => {
    let r = rows;
    if (status) r = r.filter(x => x.result_status === status);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(x => (x.title || '').toLowerCase().includes(s) || (x.customer_name || '').toLowerCase().includes(s));
    }
    return r;
  }, [rows, q, status]);

  if (!canAccess) return <CrmLayout pageTitle="Demo leads"><div className="bg-white p-10 rounded-2xl text-center text-sm text-gray-500">Ingen adgang.</div></CrmLayout>;

  return (
    <CrmLayout pageTitle="Demo leads">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2d5a27]" /> Demo leads
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{isAdmin ? 'Alle demoer i organisationen' : 'Dine egne demoer'} · {filtered.length} stk</p>
        </div>
        <Link to="/portal/crm/demo-leads/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] text-white text-sm font-medium px-4 py-2.5 shadow-sm transition">
          <Plus className="h-4 w-4" /> Nyt demo lead
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg titel eller kunde…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none" />
        </div>
        <select value={status} onChange={e=>setStatus(e.target.value)}
          className="rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">Alle statusser</option>
          {DEMO_RESULT_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-500">Indlæser…</p>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Ingen demo leads endnu. Opret det første via knappen "Nyt demo lead".</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
              <tr>
                <th className="text-left px-5 py-3">Titel</th>
                <th className="text-left px-5 py-3">Kunde</th>
                <th className="text-left px-5 py-3">Maskine</th>
                <th className="text-left px-5 py-3">Sælger</th>
                <th className="text-left px-5 py-3">Demo-dato</th>
                <th className="text-right px-5 py-3">Interesse</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{r.title}</td>
                  <td className="px-5 py-3.5 text-gray-600">{r.customer_name || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{r.demo_machine || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{r.owner_name || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{r.demo_date || '—'}</td>
                  <td className="px-5 py-3.5 text-right text-gray-900 tabular-nums">{r.interest_level ?? '—'}/5</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border', STATUS_CLR[r.result_status || ''] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                      {r.result_status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CrmLayout>
  );
}
