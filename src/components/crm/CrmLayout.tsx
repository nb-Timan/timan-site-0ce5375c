import { ReactNode } from 'react';
import { Navigate, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useAcademyAccess } from '@/context/AcademyAccessContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { derivePortalRole, hasAreaAccess } from '@/lib/portalAccess';
import { canUseCrm, isCrmAdmin, isExternalCrmRole } from '@/lib/crmScope';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { cn } from '@/lib/utils';
import LastChangedLine from '@/components/portal/LastChangedLine';
import { t } from '@/lib/i18n/translations';
import { academyCrmSandbox } from '@/lib/academyCrmSandbox';
import { academyPartnerDataSandbox, ACADEMY_PARTNER_USER } from '@/lib/academyPartnerDataSandbox';
import { CRM_NAV_ITEMS, EXTERNAL_CRM_NAV_BLOCKLIST } from '@/lib/crmNavigation';
import { hasEffectiveAcademyCapabilityAccess } from '@/lib/academyCurriculum';
import { findPortalCapabilityContractByRoute } from '../../../supabase/functions/_shared/portalCapabilityContract';

interface Props { children: ReactNode; pageTitle?: string; partnerDataPresentation?: boolean }

export default function CrmLayout({ children, pageTitle, partnerDataPresentation = false }: Props) {
  const { appUser: sessionUser, loading, logout } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const appUser = academyPartnerDataSandbox.isActive() ? ACADEMY_PARTNER_USER : sessionUser;
  const effectiveUser = useEffectivePortalUser(appUser);
  const academyAccess = useAcademyAccess();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;

  const portalRole = derivePortalRole(effectiveUser);
  // Legacy `role` can still be "slutkunde" for real portal users that were
  // later upgraded to Timan Seller/Backend/etc. Trust portal_role first.
  if (appUser.role === 'slutkunde' && !portalRole) return <Navigate to="/configurator" replace />;
  const externalCrm = isExternalCrmRole(portalRole);
  const dealerDetailMatch = location.pathname.match(/^\/portal\/(?:crm\/my-dealers|dealer-data)\/([^/]+)$/);
  const hasDealerDataAreaAccess = hasAreaAccess(effectiveUser, 'dealer_data');
  const hasCrmAreaAccess = hasAreaAccess(effectiveUser, 'timan_crm');
  const externalDealerDetailAllowed = Boolean(
    externalCrm &&
    dealerDetailMatch &&
    hasDealerDataAreaAccess,
  );
  const crmAreaAllowed = externalDealerDetailAllowed || hasCrmAreaAccess;
  if (!crmAreaAllowed) {
    return <Navigate to="/portal" replace />;
  }
  if (!canUseCrm(portalRole)) {
    return <Navigate to="/portal" replace />;
  }
  if (externalCrm && EXTERNAL_CRM_NAV_BLOCKLIST.has(location.pathname)) {
    return <Navigate to="/portal/crm/dashboard" replace />;
  }
  const baseNavItems = partnerDataPresentation
    ? CRM_NAV_ITEMS.map((item) => item.to === '/portal/crm/my-dealers'
      ? { ...item, tKey: 'area_dealer_data_title', to: '/portal/dealer-data' }
      : item)
    : CRM_NAV_ITEMS;
  const roleScopedNavItems = externalCrm
    ? (hasCrmAreaAccess ? baseNavItems.filter((item) => !EXTERNAL_CRM_NAV_BLOCKLIST.has(item.to)) : [])
    : baseNavItems;
  const navItems = roleScopedNavItems.filter((item) => hasEffectiveAcademyCapabilityAccess(
    effectiveUser,
    true,
    findPortalCapabilityContractByRoute(item.to)?.academyGate,
    academyAccess?.completionIds ?? [],
  ));

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
            const academyLeads = academyCrmSandbox.isActive() && item.to === '/portal/crm/leads';
            const part = academyCrmSandbox.getPart();
            const to = academyLeads ? `/academy/crm/leads?academy_mode=true&academy_part=${part}` : item.to;
            const active = location.pathname === item.to || (academyLeads && location.pathname.startsWith('/academy/crm/leads'));
            const Icon = item.icon;
            return (
              <Link key={item.to} to={to}
                className={cn(
                  "group relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                  active
                    ? "text-[#2d5a27]"
                    : "text-slate-500 hover:text-slate-900"
                )}>
                <Icon className={cn("h-4 w-4 transition-colors", active ? "text-[#2d5a27]" : "text-slate-400 group-hover:text-slate-600")} />
                {t(externalCrm && item.tKey === 'crmMyDealers' ? 'crmMyPartners' : item.tKey, uiLanguage)}
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
