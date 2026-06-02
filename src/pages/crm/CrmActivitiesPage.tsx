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
  order_created: 'bg-amber-50 text-amber-800 border-amber-200',
  order_sent: 'bg-purple-50 text-purple-700 border-purple-200',
  login: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function CrmActivitiesPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const [rows, setRows] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sellerId = await resolveSellerId(appUser?.email);
      const isAdmin = isCrmAdmin(portalRole);
      const [activityList, demoAll] = await Promise.all([
        listActivities({ ownerUserId: isAdmin ? null : sellerId, limit: 200 }),
        listDemoLeads({}),
      ]);
      const demoResolved = await resolveSeedOwners(demoAll);
      const demoActs = demoLeadsToActivities(demoResolved);
      const visibleDemoActs = isAdmin
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
  }, [appUser?.email, portalRole]);

  return (
    <CrmLayout pageTitle="Activities">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-gray-500">…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{T.empty[lang]}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map(a => (
              <li key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${TYPE_BADGE[a.activity_type] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {a.activity_type}
                    </span>
                    {a.status && <span className="text-[10px] text-gray-500">{a.status}</span>}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {a.account_name || '—'} · {a.created_by_name || '—'}
                    {a.assigned_owner_name ? ` · sælger: ${a.assigned_owner_name}` : ''}
                  </p>
                  {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(a.activity_date).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CrmLayout>
  );
}
