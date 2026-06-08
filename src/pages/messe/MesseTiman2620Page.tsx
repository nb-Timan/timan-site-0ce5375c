import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import PortalHeader from '@/components/portal/PortalHeader';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import { canSwitchMode } from '@/lib/activeMode';

/**
 * Timan Messe product page hosting the Timan 2620 interactive viewer.
 * MesseRouteGuard guarantees a real appUser (Messe variant or backend preview).
 */
export default function MesseTiman2620Page() {
  const { language: lang, setLanguage } = useLanguage();
  const { appUser, logout } = useAppUser();
  const navigate = useNavigate();
  const isBackendPreview = !!appUser && canSwitchMode(appUser);

  if (!appUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />
      <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
          {isBackendPreview && <DemoModeBadge />}
          <Link to="/messe" className="inline-flex items-center font-semibold text-emerald-800 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Tilbage
          </Link>
        </div>
      </div>

      <main className="flex-grow max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <h1 className="text-3xl font-bold text-slate-900">Timan 2620</h1>
        <p className="text-slate-600 mt-1 mb-6">
          Udforsk Timan 2620 i 360° og se forskellige konfigurationer.
        </p>

        <Timan2620Viewer />
      </main>
    </div>
  );
}
