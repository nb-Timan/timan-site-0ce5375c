import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';

export default function LoanShell({ children }: { children: ReactNode }) {
  const { appUser, logout } = useAppUser();
  const { language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  if (!appUser) return null;
  return <div className="flex min-h-screen flex-col bg-slate-50">
    <PortalHeader user={appUser} language={language} onLanguageChange={setLanguage}
      onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
    <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
    <PortalFooter language={language} />
  </div>;
}
