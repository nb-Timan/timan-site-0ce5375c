import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { EXHIBITION_SESSION_USER } from '@/context/AppUserContext';
import { enterExhibitionMode, isMesseEnabled, leaveExhibitionMode } from '@/lib/exhibitionMode';
import { Language } from '@/types/configurator';
import { Wrench, MapPin, Play, Newspaper } from 'lucide-react';
import timanLogo from '@/assets/timan-logo.png';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import BackendExitButton from '@/components/messe/BackendExitButton';
import BackendRolePreviewSwitcher from '@/components/messe/BackendRolePreviewSwitcher';
import PortalHeader from '@/components/portal/PortalHeader';
import { useCachedRealBackendUser } from '@/lib/cachedRealUser';
import { supabase } from '@/lib/supabase';


const T: Record<string, Record<Language, string>> = {
  welcome:    { da: 'Velkommen til Timan Messe', en: 'Welcome to Timan Exhibition', de: 'Willkommen bei Timan Messe', it: 'Benvenuti a Timan Fiera', hu: 'Üdvözöljük a Timan kiállításon' },
  intro:      { da: 'Vælg en mulighed for at udforske Timan.', en: 'Choose an option to explore Timan.', de: 'Wählen Sie eine Option, um Timan zu entdecken.', it: 'Scegli un\'opzione per esplorare Timan.', hu: 'Válasszon egy lehetőséget a Timan felfedezéséhez.' },
  configurator: { da: 'Konfigurator', en: 'Configurator', de: 'Konfigurator', it: 'Configuratore', hu: 'Konfigurátor' },
  configuratorDesc: { da: 'Byg din egen Timan-maskine', en: 'Build your own Timan machine', de: 'Bauen Sie Ihre Timan-Maschine', it: 'Configura la tua Timan', hu: 'Építsd meg saját Timan gépedet' },
  partnerMap:  { da: 'Find forhandler', en: 'Find dealer', de: 'Händler finden', it: 'Trova rivenditore', hu: 'Keresés kereskedőt' },
  partnerMapDesc: { da: 'Forhandlere, importører og servicepartnere', en: 'Dealers, importers and service partners', de: 'Händler, Importeure und Servicepartner', it: 'Rivenditori, importatori e service partner', hu: 'Kereskedők, importőrök, szervizpartnerek' },
  video:       { da: 'Video Akademi', en: 'Video Academy', de: 'Video-Akademie', it: 'Video Academy', hu: 'Videó Akadémia' },
  videoDesc:   { da: 'Maskinvideoer og guides', en: 'Machine videos and guides', de: 'Maschinenvideos und Anleitungen', it: 'Video macchine e guide', hu: 'Gépvideók és útmutatók' },
  news:        { da: 'Seneste nyt', en: 'Latest news', de: 'Aktuelles', it: 'Ultime notizie', hu: 'Legfrissebb hírek' },
  newsDesc:    { da: 'Nyt fra Timan-verdenen', en: 'News from the Timan world', de: 'Neues aus der Timan-Welt', it: 'Notizie dal mondo Timan', hu: 'Hírek a Timan világából' },
  disabled:    { da: 'Messeadgang er ikke aktiv lige nu.', en: 'Exhibition access is currently disabled.', de: 'Messe-Zugang ist derzeit nicht aktiv.', it: 'Accesso fiera attualmente disattivato.', hu: 'A kiállítási hozzáférés jelenleg nem aktív.' },
};

interface Tile {
  to: string;
  icon: React.ReactNode;
  title: keyof typeof T;
  desc: keyof typeof T;
  accent: string;
}

const TILES: Tile[] = [
  { to: '/messe/konfigurator', icon: <Wrench className="h-14 w-14" />,   title: 'configurator', desc: 'configuratorDesc', accent: 'from-emerald-500 to-emerald-700' },
  { to: '/messe/partner-map',  icon: <MapPin className="h-14 w-14" />,    title: 'partnerMap',   desc: 'partnerMapDesc',   accent: 'from-sky-500 to-sky-700' },
  { to: '/messe/video',        icon: <Play className="h-14 w-14" />,      title: 'video',        desc: 'videoDesc',        accent: 'from-rose-500 to-rose-700' },
  { to: '/messe/nyt',          icon: <Newspaper className="h-14 w-14" />, title: 'news',         desc: 'newsDesc',         accent: 'from-amber-500 to-amber-700' },
];

export default function MesseHomePage({ isEntry = false }: { isEntry?: boolean }) {
  const { appUser, setAppUser } = useAppUser();
  const { language: lang, setLanguage, uiLanguage } = useLanguage();
  const [enabled, setEnabled] = useState<boolean>(() => isMesseEnabled());
  const realUser = useCachedRealBackendUser();
  const navigate = useNavigate();

  useEffect(() => {
    const refresh = () => setEnabled(isMesseEnabled());
    window.addEventListener('timan:messe-enabled-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('timan:messe-enabled-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // When entering via /messe, activate the exhibition session.
  useEffect(() => {
    if (!isEntry) return;
    if (!enabled) return;
    enterExhibitionMode();
    if (!appUser || appUser.email !== EXHIBITION_SESSION_USER.email) {
      setAppUser(EXHIBITION_SESSION_USER);
    }
  }, [isEntry, enabled, appUser, setAppUser]);

  if (!enabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <img src={timanLogo} alt="Timan" className="h-16 mb-6" />
        <h1 className="text-2xl font-bold text-slate-900">{T.disabled[lang]}</h1>
      </div>
    );
  }

  // If user landed on / direct messe sub-page without first being upgraded
  // (e.g. middle-click), bounce through /messe entry to activate the session.
  if (!isEntry && (!appUser || appUser.portal_role !== 'exhibition_user')) {
    return <Navigate to="/messe" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/messe" className="flex items-center gap-3">
            <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto" />
            <DemoModeBadge />
          </Link>
          <div className="flex items-center gap-2">
            <BackendRolePreviewSwitcher />
            <BackendExitButton />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 p-1">
            {PORTAL_LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 py-1 rounded-md text-base leading-none ${uiLanguage === l.code ? 'bg-white shadow-sm border border-emerald-700/30' : 'border border-transparent hover:bg-white'}`}
                title={l.label}
                aria-label={l.code}
              >
                {l.emoji}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{T.welcome[lang]}</h1>
          <p className="text-slate-600 mt-2 text-base sm:text-lg">{T.intro[lang]}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {TILES.map(tile => (
            <Link
              key={tile.to}
              to={tile.to}
              className={`group relative overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 min-h-[180px] sm:min-h-[220px] flex flex-col justify-end p-6 sm:p-8`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${tile.accent} opacity-90`} />
              <div className="relative text-white">
                <div className="mb-4 opacity-95">{tile.icon}</div>
                <div className="text-2xl sm:text-3xl font-bold leading-tight">{T[tile.title][lang]}</div>
                <div className="text-sm sm:text-base text-white/85 mt-1">{T[tile.desc][lang]}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="text-center text-xs text-slate-500 py-4">
        © {new Date().getFullYear()} Timan — Messe demo
      </footer>
    </div>
  );
}
