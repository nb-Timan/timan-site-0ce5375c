import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import PortalHeader from '@/components/portal/PortalHeader';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';

/**
 * Timan Messe product page hosting the Timan 2620 interactive viewer.
 * MesseRouteGuard guarantees a real appUser (Messe variant or backend preview).
 *
 * The page is designed as a clean premium product-kiosk:
 *   - Large "Tilbage til maskiner" back button in the content area
 *   - Two-column layout (control sidebar + product card) on desktop,
 *     stacked on mobile/tablet
 *   - Bottom benefits info bar
 *   - No demo-mode badge / no green secondary nav bar on this page
 */
export default function MesseTiman2620Page() {
  const { language: lang, setLanguage } = useLanguage();
  const { appUser, logout } = useAppUser();
  const navigate = useNavigate();

  if (!appUser) return null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className="flex-grow max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 lg:py-8">
        {/* Premium back button */}
        <button
          type="button"
          onClick={() => navigate('/messe')}
          className="inline-flex items-center gap-2 text-emerald-800 hover:text-emerald-900 font-semibold text-base lg:text-lg mb-6 group"
        >
          <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-emerald-500 group-hover:shadow transition">
            <ArrowLeft className="h-5 w-5" />
          </span>
          Tilbage til maskiner
        </button>

        <Timan2620Viewer />

        {/* Bottom benefits info bar */}
        <section className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-md p-5 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-8">
            {[
              {
                title: 'Kompakt og stærk',
                text: 'Timan 2620 kombinerer kompakt design med stor ydeevne.',
              },
              {
                title: 'Kan bruges hele året',
                text: 'Fra sne og salt om vinteren til fejning og vedligehold om sommeren.',
              },
              {
                title: 'Utrolig nem at skifte redskaber',
                text: 'Hurtigt skift af udstyr uden værktøj.',
              },
            ].map((b, i) => (
              <div key={i} className="flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center text-sm font-bold">
                    {i + 1}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">{b.title}</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
