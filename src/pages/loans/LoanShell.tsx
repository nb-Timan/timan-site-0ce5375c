import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { PORTAL_AREA_ROUTES } from '@/lib/portalNavigation';

export default function LoanShell({ children }: { children: ReactNode }) {
  const { appUser, logout } = useAppUser();
  const { language, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  if (!appUser) return null;
  return <div className="flex min-h-screen flex-col bg-slate-50">
    <PortalHeader user={appUser} language={language} onLanguageChange={setLanguage}
      onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
    <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-2 text-sm text-slate-600">
        <Link className="font-medium text-emerald-800 hover:underline" to={PORTAL_AREA_ROUTES.salg_marketing}>
          {t('area_salg_marketing_title', uiLanguage)}
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="truncate font-medium text-slate-900">{t('area_loans_title', uiLanguage)}</span>
      </nav>
      {children}
    </main>
    <PortalFooter language={language} />
  </div>;
}
