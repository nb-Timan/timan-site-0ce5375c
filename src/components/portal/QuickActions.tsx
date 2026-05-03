import { Link } from 'react-router-dom';
import { Plus, FlaskConical, Calendar, Users } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { getActiveSellerView } from '@/lib/activeMode';

interface Action {
  label: string;
  to: string;
  icon: typeof Plus;
}

const ACTIONS: Action[] = [
  { label: 'Opret nyt lead',       to: '/portal/crm/leads/new',      icon: Plus },
  { label: 'Ny demo-registrering', to: '/portal/crm/demo-leads/new', icon: FlaskConical },
  { label: 'Kalender',             to: '/portal/crm/calendar',       icon: Calendar },
  { label: 'Mine forhandlere',     to: '/portal/crm/my-dealers',     icon: Users },
];

export default function QuickActions() {
  const { appUser } = useAppUser();
  if (!appUser) return null;

  const role = (appUser.portal_role || '').toLowerCase();
  const isBackend = role === 'timan_backend';
  const isSeller = role === 'timan_seller';
  if (!isBackend && !isSeller) return null;

  const activeSeller = isBackend ? getActiveSellerView(appUser.email) : null;
  const contextLabel = activeSeller
    ? `Som ${activeSeller.label}`
    : isBackend ? 'Backend' : 'Sælger';

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-900">Hurtige handlinger</h2>
        <span className="text-xs text-slate-500">{contextLabel}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {ACTIONS.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-[#2d5a27] transition"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2d5a27]/10 text-[#2d5a27] group-hover:bg-[#2d5a27] group-hover:text-white transition">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
