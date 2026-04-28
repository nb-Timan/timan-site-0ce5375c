import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  listLeads, listDemoLeads, resolveSeedOwners,
  CrmLead, CrmDemoLead, PIPELINE_STAGES,
} from '@/lib/crmLeadsService';
import { Plus, Search, Sparkles, TrendingUp, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------- Unified row ----------
type LeadType = 'open' | 'demo';
interface UnifiedLead {
  id: string;
  type: LeadType;
  title: string;
  customer: string | null;
  dealer: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  responsible_name: string | null;
  machine: string | null;
  equipment: string | null;
  date: string | null;        // primary date for the row
  next_followup: string | null;
  status: string | null;       // pipeline_stage or result_status
  value: number | null;
  detail_href: string | null;
}

const STAGE_CLR: Record<string, string> = {
  Lead:        'bg-sky-50 text-sky-700 border-sky-200',
  Qualified:   'bg-violet-50 text-violet-700 border-violet-200',
  'Offer sent':'bg-amber-50 text-amber-800 border-amber-200',
  Negotiation: 'bg-orange-50 text-orange-700 border-orange-200',
  Won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:        'bg-rose-50 text-rose-700 border-rose-200',
  'Hot lead':  'bg-rose-50 text-rose-700 border-rose-200',
  'Warm lead': 'bg-amber-50 text-amber-800 border-amber-200',
  'Cold lead': 'bg-sky-50 text-sky-700 border-sky-200',
  'Offer requested': 'bg-violet-50 text-violet-700 border-violet-200',
  'No fit':    'bg-gray-100 text-gray-700 border-gray-200',
};

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  // accepts YYYY-MM-DD or ISO
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapOpen(l: CrmLead): UnifiedLead {
  return {
    id: l.id,
    type: 'open',
    title: l.title,
    customer: l.contact_information || null,
    dealer: l.linked_dealer_id || null,
    owner_user_id: l.owner_user_id,
    owner_name: l.owner_name,
    owner_email: null,
    responsible_name: l.owner_name,
    machine: (l.machine_types || []).join(', ') || null,
    equipment: null,
    date: l.first_contact_date || l.created_at,
    next_followup: l.next_followup_date,
    status: l.pipeline_stage,
    value: l.estimated_value,
    detail_href: null,
  };
}

function mapDemo(d: CrmDemoLead): UnifiedLead {
  return {
    id: d.id,
    type: 'demo',
    title: d.title,
    customer: d.customer_name,
    dealer: d.dealer_company,
    owner_user_id: d.owner_user_id,
    owner_name: d.owner_name,
    owner_email: d.owner_email || null,
    responsible_name: d.owner_name,
    machine: d.demo_machine,
    equipment: (d.demo_equipment || []).join(', ') || null,
    date: d.demo_date || d.created_at,
    next_followup: d.followup_date,
    status: d.result_status,
    value: d.estimated_value,
    detail_href: `/portal/crm/demo-leads/${d.id}`,
  };
}

type TabKey = 'all' | 'open' | 'demo' | 'mine' | 'mine_demo';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',       label: 'Alle leads' },
  { key: 'open',      label: 'Åbne leads' },
  { key: 'demo',      label: 'Demo leads' },
  { key: 'mine',      label: 'Mine leads' },
  { key: 'mine_demo', label: 'Mine demoer' },
];

export default function CrmLeadsPage() {
  const { appUser } = useAppUser();
  const navigate = useNavigate();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const [openLeads, setOpenLeads] = useState<CrmLead[]>([]);
  const [demoLeads, setDemoLeads] = useState<CrmDemoLead[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [tab, setTab] = useState<TabKey>(isAdmin ? 'all' : 'mine');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string>('');

  useEffect(() => { setTab(isAdmin ? 'all' : 'mine'); }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sid = await resolveSellerId(appUser?.email);
      // Always fetch full sets, then filter on the client so we can offer
      // tabs like "Mine leads" without re-querying. Backend RLS still
      // gates server-side data; seed data is local.
      const [openAll, demoAll] = await Promise.all([
        listLeads({}),
        listDemoLeads({}),
      ]);
      const demoResolved = await resolveSeedOwners(demoAll);
      if (cancelled) return;
      setSellerId(sid);
      setOpenLeads(openAll);
      setDemoLeads(demoResolved);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email]);

  // Build unified rows + apply role visibility (sellers see only their own,
  // backend sees everything including unassigned).
  const allRows: UnifiedLead[] = useMemo(() => {
    const open = openLeads.map(mapOpen);
    const demo = demoLeads.map(mapDemo);
    let merged = [...open, ...demo];
    if (!isAdmin) {
      const myEmail = (appUser?.email || '').toLowerCase();
      merged = merged.filter(r =>
        (sellerId && r.owner_user_id === sellerId) ||
        (myEmail && r.owner_email && r.owner_email.toLowerCase() === myEmail) ||
        (myEmail && (r.responsible_name || '').toLowerCase() === myEmail)
      );
    }
    // Sort newest first
    merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return merged;
  }, [openLeads, demoLeads, isAdmin, sellerId, appUser?.email]);

  // Counts for tab badges (always reflect role-visible scope)
  const counts = useMemo(() => ({
    all:       allRows.length,
    open:      allRows.filter(r => r.type === 'open').length,
    demo:      allRows.filter(r => r.type === 'demo').length,
    mine:      allRows.filter(r => r.type === 'open' && (
                  (sellerId && r.owner_user_id === sellerId) ||
                  (!!appUser?.email && (r.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
                )).length,
    mine_demo: allRows.filter(r => r.type === 'demo' && (
                  (sellerId && r.owner_user_id === sellerId) ||
                  (!!appUser?.email && (r.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
                )).length,
  }), [allRows, sellerId, appUser?.email]);

  // Apply tab + search + stage filter
  const visible = useMemo(() => {
    let r = allRows;
    if (tab === 'open') r = r.filter(x => x.type === 'open');
    else if (tab === 'demo') r = r.filter(x => x.type === 'demo');
    else if (tab === 'mine') r = r.filter(x =>
      x.type === 'open' && (
        (sellerId && x.owner_user_id === sellerId) ||
        (!!appUser?.email && (x.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
      ));
    else if (tab === 'mine_demo') r = r.filter(x =>
      x.type === 'demo' && (
        (sellerId && x.owner_user_id === sellerId) ||
        (!!appUser?.email && (x.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
      ));

    if (stage) r = r.filter(x => x.status === stage);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(x =>
        (x.title || '').toLowerCase().includes(s) ||
        (x.customer || '').toLowerCase().includes(s) ||
        (x.dealer || '').toLowerCase().includes(s) ||
        (x.owner_name || '').toLowerCase().includes(s) ||
        (x.machine || '').toLowerCase().includes(s)
      );
    }
    return r;
  }, [allRows, tab, stage, q, sellerId, appUser?.email]);

  const totalValue = useMemo(() => visible.reduce((s, x) => s + (x.value || 0), 0), [visible]);
  const unassignedCount = useMemo(
    () => allRows.filter(x => !x.owner_user_id).length,
    [allRows]
  );

  return (
    <CrmLayout pageTitle="Leads">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2d5a27]" /> Leads
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'Alle leads og demoer i organisationen' : 'Dine tildelte leads og demoer'}
            {' · '}{visible.length} stk{totalValue > 0 ? ` · ${formatKr(totalValue)}` : ''}
            {isAdmin && unassignedCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                {unassignedCount} unassigned
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/portal/crm/demo-leads/new"
            className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-gray-50 text-[#2d5a27] border border-[#2d5a27]/30 hover:border-[#2d5a27] text-sm font-medium px-4 py-2.5 shadow-sm transition">
            <Plus className="h-4 w-4" /> Ny demo-registrering
          </Link>
          <Link to="/portal/crm/leads/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] text-white text-sm font-medium px-4 py-2.5 shadow-sm transition">
            <Plus className="h-4 w-4" /> Nyt lead
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map(t => {
          const active = tab === t.key;
          const c = counts[t.key];
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border transition',
                active
                  ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              )}>
              {t.label}
              <span className={cn(
                'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              )}>{c}</span>
            </button>
          );
        })}
      </div>

      {/* Filter strip */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Søg titel, kunde, forhandler, sælger eller maskine…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none" />
        </div>
        <select value={stage} onChange={e=>setStage(e.target.value)}
          className="rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">Alle statusser</option>
          {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          <option disabled>──────────</option>
          {['Hot lead','Warm lead','Cold lead','Offer requested','No fit'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-500">Indlæser…</p>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">Ingen leads i dette filter</p>
            <p className="text-xs text-gray-500 mt-1">Skift fane eller opret et nyt lead.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Titel / Kunde</th>
                  <th className="text-left px-4 py-3">Forhandler</th>
                  <th className="text-left px-4 py-3">Ejer</th>
                  <th className="text-left px-4 py-3">Maskine</th>
                  <th className="text-left px-4 py-3">Udstyr</th>
                  <th className="text-left px-4 py-3">Dato</th>
                  <th className="text-left px-4 py-3">Næste opf.</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Handling</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => {
                  const clickable = !!r.detail_href;
                  return (
                    <tr key={`${r.type}-${r.id}`}
                      onClick={() => { if (r.detail_href) navigate(r.detail_href); }}
                      className={cn('transition-colors', clickable ? 'cursor-pointer hover:bg-gray-50/60' : 'hover:bg-gray-50/40')}>
                      <td className="px-4 py-3.5">
                        <span className={cn('inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                          r.type === 'demo'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200')}>
                          {r.type === 'demo' ? 'Demo' : 'Open'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-gray-900 truncate max-w-[260px]">{r.title}</div>
                        {r.customer && r.customer !== r.title && (
                          <div className="text-xs text-gray-500 truncate max-w-[260px]">{r.customer}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[180px] truncate">{r.dealer || '—'}</td>
                      <td className="px-4 py-3.5">
                        {r.owner_name ? (
                          <span className="text-gray-700">{r.owner_name}</span>
                        ) : (
                          <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[160px] truncate">{r.machine || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[180px] truncate">{r.equipment || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.next_followup)}</td>
                      <td className="px-4 py-3.5">
                        {r.status ? (
                          <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border',
                            STAGE_CLR[r.status] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                            {r.status}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {r.detail_href ? (
                          <Link to={r.detail_href} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[12px] text-[#2d5a27] hover:underline">
                            Åbn <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="text-[12px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
