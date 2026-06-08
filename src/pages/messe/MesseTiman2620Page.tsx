import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import { useMesseMode } from '@/lib/messeMode';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import PortalHeader from '@/components/portal/PortalHeader';
import ProductImageViewer from '@/components/product-viewer/ProductImageViewer';
import { TIMAN_2620_CONFIGS } from '@/data/timan2620Viewer';
import { leaveExhibitionMode } from '@/lib/exhibitionMode';
import { supabase } from '@/lib/supabase';
import timanLogo from '@/assets/timan-logo.png';

/**
 * Public Timan Messe product page hosting the Timan 2620 interactive viewer.
 * Works for both QR-link public visitors and real backend/service users
 * previewing the Messe role (PortalHeader rendered in the latter case).
 */
export default function MesseTiman2620Page() {
  const { language: lang, setLanguage } = useLanguage();
  const { appUser, setAppUser } = useAppUser();
  const location = useLocation();
  const { realUser } = useMesseMode(appUser, location.pathname);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      {realUser ? (
        <>
          <PortalHeader
            user={realUser}
            language={lang}
            onLanguageChange={setLanguage}
            onLogout={async () => {
              leaveExhibitionMode();
              try { await supabase.auth.signOut(); } catch { /* ignore */ }
              setAppUser(null);
              window.location.assign('/portal');
            }}
          />
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2">
              <DemoModeBadge />
              <Link to="/messe" className="inline-flex items-center font-semibold text-emerald-800 hover:underline">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Tilbage
              </Link>
            </div>
          </div>
        </>
      ) : (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link to="/messe" className="flex items-center gap-3">
              <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto" />
              <DemoModeBadge />
            </Link>
            <Link to="/messe" className="inline-flex items-center text-sm font-semibold text-emerald-800 hover:underline">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage
            </Link>
          </div>
        </header>
      )}

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-slate-900">Timan 2620</h1>
        <p className="text-slate-600 mt-1 mb-6">
          Udforsk Timan 2620 i 360° og se forskellige konfigurationer.
        </p>

        <ProductImageViewer configurations={TIMAN_2620_CONFIGS} />
      </main>
    </div>
  );
}
