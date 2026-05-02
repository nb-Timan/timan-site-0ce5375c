import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import AreaCard from '@/components/portal/AreaCard';
import LatestFromTiman from '@/components/portal/LatestFromTiman';
import { PORTAL_AREAS, isAreaVisible } from '@/lib/portalAreas';
import { Language } from '@/types/configurator';
import { Wrench, ShoppingBag, Settings, Users } from 'lucide-react';

const T: Record<string, Record<Language, string>> = {
  loginNeeded:  { da: 'Log ind for at fortsætte', en: 'Log in to continue', de: 'Bitte anmelden', it: 'Accedi per continuare', hu: 'Jelentkezzen be a folytatáshoz' },
  heroTitle:    { da: 'Velkommen til Timan Portalen', en: 'Welcome to the Timan Portal', de: 'Willkommen im Timan-Portal', it: 'Benvenuto nel Portale Timan', hu: 'Üdvözöljük a Timan Portálon' },
  heroBody: {
    da: 'Vælg et område for at komme i gang.',
    en: 'Select an area to get started.',
    de: 'Wählen Sie einen Bereich, um zu beginnen.',
    it: 'Seleziona un’area per iniziare.',
    hu: 'Válasszon egy területet a kezdéshez.',
  },
  heroAlt: { da: 'Timan industri', en: 'Timan industry', de: 'Timan Industrie', it: 'Industria Timan', hu: 'Timan ipar' },
  open: { da: 'Åbn område', en: 'Open area', de: 'Bereich öffnen', it: 'Apri area', hu: 'Terület megnyitása' },
};

const AREA_META: Record<string, { to: string; icon: typeof Wrench; accent: 'primary' | 'sky' | 'violet' }> = {
  teknik_service: { to: '/portal/teknik-service', icon: Wrench,      accent: 'primary' },
  salg_marketing: { to: '/portal/salg-marketing', icon: ShoppingBag, accent: 'sky' },
  timan_crm:      { to: '/portal/crm',            icon: Users,       accent: 'primary' },
  timan_backend:  { to: '/portal/backend',        icon: Settings,    accent: 'violet' },
};

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout, dealerStatus } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const prefLangApplied = useRef(false);
  useEffect(() => {
    if (prefLangApplied.current) return;
    const pref = appUser?.preferred_language;
    if (pref && ['da','en','de','it','hu'].includes(pref)) {
      prefLangApplied.current = true;
      if (pref !== lang) setLanguage(pref as typeof lang);
    }
  }, [appUser, lang, setLanguage]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md mx-auto mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="bg-[#2d5a27] text-white font-bold px-3 py-1 rounded text-xl">TIMAN</span>
          </div>
          <p className="text-sm text-gray-500">{T.loginNeeded[lang]}</p>
        </div>
        <LoginStep
          language={lang}
          onResolved={(user) => { setAppUser(user); navigate('/portal', { replace: true }); }}
        />
      </div>
    );
  }

  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  // Dealer block / soft-delete gate. Timan staff (no dealer link) are unaffected.
  if (dealerStatus?.isDeleted || dealerStatus?.isBlocked) {
    const isDeleted = dealerStatus.isDeleted;
    return (
      <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
          onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />
        <main className="max-w-xl mx-auto px-4 py-16 flex-grow w-full">
          <div className="bg-white border border-rose-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <svg className="h-7 w-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {isDeleted ? 'Forhandlerkonto er ikke længere aktiv' : 'Forhandlerkonto er spærret'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isDeleted
                ? 'This dealer account is no longer active. Please contact Timan.'
                : 'This dealer account is blocked. Please contact Timan.'}
            </p>
            {dealerStatus.companyName && (
              <p className="mt-3 text-xs text-slate-500">{dealerStatus.companyName}</p>
            )}
            <button
              type="button"
              onClick={async () => { await logout(); navigate('/portal', { replace: true }); }}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Log ud
            </button>
          </div>
        </main>
        <PortalFooter language={lang} />
      </div>
    );
  }

  const visibleAreas = PORTAL_AREAS.filter(area => isAreaVisible(area, appUser));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <header className="relative bg-gray-900 h-64 flex items-center overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent z-10"></div>
          <img
            src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=2070"
            alt={T.heroAlt[lang]}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{T.heroTitle[lang]}</h1>
          <p className="text-gray-300 text-lg max-w-2xl">{T.heroBody[lang]}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {visibleAreas.map(area => {
            const meta = AREA_META[area.id];
            if (!meta) return null;
            return (
              <AreaCard
                key={area.id}
                title={area.title[lang] || area.title.en}
                description={area.description[lang] || area.description.en}
                cta={T.open[lang]}
                to={meta.to}
                icon={meta.icon}
                accent={meta.accent}
              />
            );
          })}
        </div>

        <LatestFromTiman language={lang} />
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
