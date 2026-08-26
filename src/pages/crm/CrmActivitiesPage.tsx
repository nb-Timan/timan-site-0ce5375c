import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { listActivities, CrmActivity } from '@/lib/crmActivitiesService';
import { listDemoLeads, resolveSeedOwners, demoLeadsToActivities } from '@/lib/crmLeadsService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { isCrmAdmin } from '@/lib/crmScope';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  empty: { da: 'Ingen aktivitet endnu. Aktivitet logges automatisk når tilbud/ordrer oprettes, sendes eller når brugere logger ind.', en: 'No activity yet. Logged automatically when quotes/orders are created, sent or on login.', de: 'Noch keine Aktivität.', it: 'Nessuna attività.', hu: 'Még nincs tevékenység.' },
};

const TYPE_BADGE: Record<string, string> = {
  quote_created: 'bg-sky-50 text-sky-700 border-sky-200',
  quote_sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  quote_deleted: 'bg-red-50 text-red-700 border-red-200',
  order_created: 'bg-amber-50 text-amber-800 border-amber-200',
  order_sent: 'bg-purple-50 text-purple-700 border-purple-200',
  order_deleted: 'bg-red-50 text-red-700 border-red-200',
  login: 'bg-gray-100 text-gray-700 border-gray-200',
  lead_created: 'bg-sky-50 text-sky-700 border-sky-200',
  lead_deleted: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function CrmActivitiesPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const canViewAllActivities =
    isCrmAdmin(portalRole) || (appUser?.portal_role ?? '').toLowerCase() === 'timan_backend';
  const [searchParams] = useSearchParams();
  const dealerParam = searchParams.get('dealer') || '';
  const [rows, setRows] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(dealerParam);

  useEffect(() => { if (dealerParam) setSearch(dealerParam); }, [dealerParam]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(a => {
      const hay = [a.title, a.account_name, a.created_by_name, a.assigned_owner_name, a.description, a.activity_type]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const [activityList, demoAll] = await Promise.all([
        listActivities({ ownerUserId: canViewAllActivities ? null : sellerId, limit: 500 }),
        listDemoLeads({}),
      ]);
      const demoResolved = await resolveSeedOwners(demoAll);
      const demoActs = demoLeadsToActivities(demoResolved);
      const visibleDemoActs = canViewAllActivities
        ? demoActs
        : demoActs.filter(a => a.assigned_owner_user_id && a.assigned_owner_user_id === sellerId);
      // Merge & sort newest first; cap at 300.
      const merged = [...activityList, ...visibleDemoActs].sort((a, b) =>
        (b.activity_date || '').localeCompare(a.activity_date || '')
      ).slice(0, 300);
      if (!cancelled) {
        setRows(merged);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, canViewAllActivities]);

  return (
    <CrmLayout pageTitle="Activities">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Søg…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-500">…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{T.empty[lang]}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden md:grid grid-cols-[180px_minmax(260px,1fr)_220px_180px] gap-4 px-5 py-3 bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
              <span>Handling</span>
              <span>Lead / detaljer</span>
              <span>Udført af</span>
              <span className="text-right">Tidspunkt</span>
            </div>
            {filtered.map(a => (
              <div key={a.id} className="px-5 py-4 grid gap-3 md:grid-cols-[180px_minmax(260px,1fr)_220px_180px] md:items-start">
                <div className="min-w-0">
                  <span className={`inline-flex text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${TYPE_BADGE[a.activity_type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {a.activity_type}
                  </span>
                  {a.status && <div className="text-[10px] text-gray-500 mt-1">{a.status}</div>}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {a.account_name || '—'}
                    {a.assigned_owner_name ? ` · sælger: ${a.assigned_owner_name}` : ''}
                  </p>
                  {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
                </div>
                <span className="text-xs text-gray-500">{a.created_by_name || '—'}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap md:text-right">{new Date(a.activity_date).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
