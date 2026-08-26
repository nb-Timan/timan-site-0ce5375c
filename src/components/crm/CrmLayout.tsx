import { ReactNode } from 'react';
import { Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Activity, FileText, ShoppingCart, Sparkles, Wallet, CalendarDays, Store, Gauge } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { derivePortalRole, hasModuleAccess } from '@/lib/portalAccess';
import { canUseCrm, isCrmAdmin, isExternalCrmRole } from '@/lib/crmScope';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { cn } from '@/lib/utils';
import LastChangedLine from '@/components/portal/LastChangedLine';
import { t } from '@/lib/i18n/translations';

interface NavItem { tKey: string; to: string; icon: typeof LayoutDashboard }
const NAV: NavItem[] = [
  { tKey: 'crmDashboard',        to: '/portal/crm/dashboard',        icon: LayoutDashboard },
  { tKey: 'crmMyDealers',        to: '/portal/crm/my-dealers',       icon: Store },
  { tKey: 'crmLeads',            to: '/portal/crm/leads',            icon: Sparkles },
  { tKey: 'crmQuotes',           to: '/portal/crm/quotes',           icon: FileText },
  { tKey: 'crmOrders',           to: '/portal/crm/orders',           icon: ShoppingCart },
  { tKey: 'crmActivities',       to: '/portal/crm/activities',       icon: Activity },
  { tKey: 'crmCalendar',         to: '/portal/crm/calendar',         icon: CalendarDays },
  { tKey: 'crmBudget',           to: '/portal/crm/budget',           icon: Wallet },
  { tKey: 'crmBudgetDashboard',  to: '/portal/crm/budget-dashboard', icon: Gauge },
];

const EXTERNAL_NAV_BLOCKLIST = new Set([
  '/portal/crm/activities',
  '/portal/crm/budget-dashboard',
]);

interface Props { children: ReactNode; pageTitle?: string }

export default function CrmLayout({ children, pageTitle }: Props) {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveUser = useEffectivePortalUser(appUser);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;

  const portalRole = derivePortalRole(effectiveUser);
  // Legacy `role` can still be "slutkunde" for real portal users that were
  // later upgraded to Timan Seller/Backend/etc. Trust portal_role first.
  if (appUser.role === 'slutkunde' && !portalRole) return <Navigate to="/configurator" replace />;
  // Phase 37 — area access is now driven by per-user `allowed_areas` if set,
  // otherwise it falls back to module_access / role defaults.
  const allowedAreas = effectiveUser?.allowed_areas;
  const externalCrm = isExternalCrmRole(portalRole);
  const ownDealerDetailMatch = location.pathname.match(/^\/portal\/crm\/my-dealers\/([^/]+)$/);
  const ownDealerDetailAllowed = Boolean(
    externalCrm &&
    ownDealerDetailMatch &&
    decodeURIComponent(ownDealerDetailMatch[1]) === effectiveUser?.dealer_number &&
    Array.isArray(allowedAreas) &&
    allowedAreas.includes('dealer_data'),
  );
  const crmAreaAllowed = ownDealerDetailAllowed || (Array.isArray(allowedAreas) && allowedAreas.length > 0
    ? allowedAreas.includes('timan_crm')
    : hasModuleAccess(portalRole, 'timan_crm', effectiveUser?.module_access as never));
  if (!crmAreaAllowed) {
    return <Navigate to="/portal" replace />;
  }
  if (!canUseCrm(portalRole)) {
    return <Navigate to="/portal" replace />;
  }
  if (externalCrm && EXTERNAL_NAV_BLOCKLIST.has(location.pathname)) {
    return <Navigate to="/portal/crm/dashboard" replace />;
  }
  const navItems = externalCrm
    ? NAV.filter((item) => !EXTERNAL_NAV_BLOCKLIST.has(item.to))
    : NAV;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 pt-4 pb-8 flex-grow w-full">
        <div className="flex items-center justify-end mb-3 gap-3 flex-wrap">
          <span className={cn(
            "text-xs px-3 py-1 rounded-full",
            isCrmAdmin(portalRole) ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-sky-50 text-sky-800 border border-sky-200"
          )}>
            {isCrmAdmin(portalRole) ? t('crmScopeAll', uiLanguage) : t('crmScopeOwner', uiLanguage)}
          </span>
        </div>

        <nav className="relative flex flex-wrap items-center gap-1 mb-6 border-b border-slate-200/80">
          {navItems.map(item => {
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
                {t(item.tKey, uiLanguage)}
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
          {location.pathname !== '/portal/crm/my-dealers' && (
            <>
              <div className="ml-auto hidden md:flex items-center pr-2">
                <LastChangedLine moduleKey="crm" />
              </div>
              <div className="basis-full md:hidden mt-1 pl-2 pb-2">
                <LastChangedLine moduleKey="crm" className="text-[11px]" />
              </div>
            </>
          )}
        </nav>


        {children}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
