import { ReactNode } from 'react';
import { Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Building2, Users, Activity, FileText, ShoppingCart, BarChart3, Sparkles } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { derivePortalRole, hasModuleAccess } from '@/lib/portalAccess';
import { isCrmAdmin, isScopedSeller } from '@/lib/crmScope';
import { getPortalBackTarget } from '@/lib/portalBackNav';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const T: Record<string, Record<Language, string>> = {
  back:       { da: 'Tilbage til portal', en: 'Back to portal', de: 'Zurück zum Portal', it: 'Torna al portale', hu: 'Vissza a portálra' },
  back_crm:   { da: 'Tilbage til CRM', en: 'Back to CRM', de: 'Zurück zum CRM', it: 'Torna al CRM', hu: 'Vissza a CRM-hez' },
  title:      { da: 'Timan CRM', en: 'Timan CRM', de: 'Timan CRM', it: 'Timan CRM', hu: 'Timan CRM' },
  dashboard:  { da: 'Dashboard',     en: 'Dashboard',  de: 'Dashboard',  it: 'Dashboard',  hu: 'Irányítópult' },
  accounts:   { da: 'Konti',         en: 'Accounts',   de: 'Konten',     it: 'Account',    hu: 'Fiókok' },
  leads:      { da: 'Leads',         en: 'Leads',      de: 'Leads',      it: 'Lead',       hu: 'Leadek' },
  quotes:     { da: 'Tilbud',        en: 'Quotes',     de: 'Angebote',   it: 'Preventivi', hu: 'Árajánlatok' },
  orders:     { da: 'Ordrer',        en: 'Orders',     de: 'Aufträge',   it: 'Ordini',     hu: 'Rendelések' },
  activities: { da: 'Aktiviteter',   en: 'Activities', de: 'Aktivitäten',it: 'Attività',   hu: 'Tevékenységek' },
  reports:    { da: 'Rapporter',     en: 'Reports',    de: 'Berichte',   it: 'Report',     hu: 'Riportok' },
  scope_all:    { da: 'Ser alle CRM-data', en: 'Viewing all CRM data', de: 'Alle CRM-Daten', it: 'Tutti i dati CRM', hu: 'Összes CRM adat' },
  scope_owner:  { da: 'Ser kun egne tildelte konti', en: 'Viewing only your assigned accounts', de: 'Nur eigene Konten', it: 'Solo i tuoi account', hu: 'Csak saját fiókok' },
};

interface NavItem { key: keyof typeof T; to: string; icon: typeof LayoutDashboard }
const NAV: NavItem[] = [
  { key: 'dashboard',  to: '/portal/crm/dashboard',  icon: LayoutDashboard },
  { key: 'accounts',   to: '/portal/crm/accounts',   icon: Building2 },
  { key: 'leads',      to: '/portal/crm/leads',      icon: Sparkles },
  { key: 'quotes',     to: '/portal/crm/quotes',     icon: FileText },
  { key: 'orders',     to: '/portal/crm/orders',     icon: ShoppingCart },
  { key: 'activities', to: '/portal/crm/activities', icon: Activity },
  { key: 'reports',    to: '/portal/crm/reports',    icon: BarChart3 },
];

interface Props { children: ReactNode; pageTitle?: string }

export default function CrmLayout({ children, pageTitle }: Props) {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  if (!hasModuleAccess(portalRole, 'timan_crm', appUser.module_access as never)) {
    return <Navigate to="/portal" replace />;
  }
  // Hard block: only backend or seller can access the CRM.
  if (!isCrmAdmin(portalRole) && !isScopedSeller(portalRole)) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
        <div className="flex items-center justify-between mb-4">
          <Link to={getPortalBackTarget(location.pathname)} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {getPortalBackTarget(location.pathname) === '/portal/crm' ? T.back_crm[lang] : T.back[lang]}
          </Link>
          <span className={cn(
            "text-xs px-3 py-1 rounded-full",
            isCrmAdmin(portalRole) ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-sky-50 text-sky-800 border border-sky-200"
          )}>
            {isCrmAdmin(portalRole) ? T.scope_all[lang] : T.scope_owner[lang]}
          </span>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{T.title[lang]}{pageTitle ? <span className="text-gray-400 font-medium"> · {pageTitle}</span> : null}</h1>
        </div>

        <nav className="relative flex flex-wrap items-center gap-1 mb-8 border-b border-slate-200/80">
          {NAV.map(item => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "group relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                  active
                    ? "text-[#2d5a27]"
                    : "text-slate-500 hover:text-slate-900"
                )}>
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-[#2d5a27]" : "text-slate-400 group-hover:text-slate-600")} />
                {T[item.key as string][lang]}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-3 right-3 -bottom-px h-[2px] rounded-full transition-all duration-200",
                    active ? "bg-[#2d5a27] opacity-100" : "bg-slate-900 opacity-0 group-hover:opacity-20"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {children}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
