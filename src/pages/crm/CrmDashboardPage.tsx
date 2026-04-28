import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { listCrmAccounts, CrmAccount } from '@/lib/crmAccountsService';
import { listActivities, CrmActivity } from '@/lib/crmActivitiesService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { isCrmAdmin } from '@/lib/crmScope';
import { Language } from '@/types/configurator';
import { Building2, FileText, ShoppingCart, Activity } from 'lucide-react';

const T: Record<string, Record<Language, string>> = {
  accounts: { da: 'Konti', en: 'Accounts', de: 'Konten', it: 'Account', hu: 'Fiókok' },
  quotes_created: { da: 'Tilbud oprettet', en: 'Quotes created', de: 'Erstellte Angebote', it: 'Preventivi creati', hu: 'Létrehozott árajánlatok' },
  orders_sent: { da: 'Ordrer sendt', en: 'Orders sent', de: 'Versandte Aufträge', it: 'Ordini inviati', hu: 'Elküldött rendelések' },
  recent: { da: 'Seneste aktivitet', en: 'Recent activity', de: 'Letzte Aktivität', it: 'Attività recente', hu: 'Legutóbbi tevékenység' },
  open_all: { da: 'Se alle', en: 'View all', de: 'Alle anzeigen', it: 'Vedi tutto', hu: 'Összes' },
  empty: { da: 'Ingen data endnu.', en: 'No data yet.', de: 'Noch keine Daten.', it: 'Nessun dato.', hu: 'Még nincs adat.' },
};

export default function CrmDashboardPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sellerId = await resolveSellerId(appUser?.email);
      const acc = await listCrmAccounts({ role: portalRole, sellerId });
      const act = await listActivities({
        ownerUserId: isCrmAdmin(portalRole) ? null : sellerId,
        limit: 25,
      });
      if (cancelled) return;
      setAccounts(acc.accounts);
      setActivities(act);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, portalRole]);

  const quotesCount = activities.filter(a => a.activity_type === 'quote_created').length;
  const ordersCount = activities.filter(a => a.activity_type === 'order_sent' || a.activity_type === 'order_created').length;

  return (
    <CrmLayout pageTitle="Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Kpi icon={Building2} label={T.accounts[lang]} value={accounts.length} to="/portal/crm/accounts" />
        <Kpi icon={FileText} label={T.quotes_created[lang]} value={quotesCount} to="/portal/crm/quotes" />
        <Kpi icon={ShoppingCart} label={T.orders_sent[lang]} value={ordersCount} to="/portal/crm/orders" />
      </div>

      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2"><Activity className="h-5 w-5" />{T.recent[lang]}</h2>
          <Link className="text-sm text-[#2d5a27] hover:underline" to="/portal/crm/activities">{T.open_all[lang]}</Link>
        </div>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">{T.empty[lang]}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activities.slice(0, 8).map(a => (
              <li key={a.id} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.title || a.activity_type}</p>
                  <p className="text-xs text-gray-500">{a.activity_type} · {a.account_name || '—'} · {a.created_by_name || '—'}</p>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(a.activity_date).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </CrmLayout>
  );
}

function Kpi({ icon: Icon, label, value, to }: { icon: typeof Building2; label: string; value: number; to: string }) {
  return (
    <Link to={to} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-[#2d5a27]/30 transition flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-[#2d5a27]/10 text-[#2d5a27] flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
      </div>
    </Link>
  );
}
