import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { isMesseEnabled } from '@/lib/exhibitionMode';
import { Language } from '@/types/configurator';
import { Gauge, Leaf, Wrench, MapPin, Play, Newspaper, Tractor, FileText, X } from 'lucide-react';
import timanLogo from '@/assets/timan-logo.png';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import PortalHeader from '@/components/portal/PortalHeader';
import { Link } from 'react-router-dom';
import { canSwitchMode } from '@/lib/activeMode';

const T: Record<string, Record<Language, string>> = {
  welcome:    { da: 'Velkommen til Timan Messe', en: 'Welcome to Timan Exhibition', de: 'Willkommen bei Timan Messe', it: 'Benvenuti a Timan Fiera', hu: 'Üdvözöljük a Timan kiállításon' },
  intro:      { da: 'Vælg en mulighed for at udforske Timan.', en: 'Choose an option to explore Timan.', de: 'Wählen Sie eine Option, um Timan zu entdecken.', it: 'Scegli un\'opzione per esplorare Timan.', hu: 'Válasszon egy lehetőséget a Timan felfedezéséhez.' },
  configurator: { da: 'Konfigurator', en: 'Configurator', de: 'Konfigurator', it: 'Configuratore', hu: 'Konfigurátor' },
  configuratorDesc: { da: 'Byg din egen Timan-maskine', en: 'Build your own Timan machine', de: 'Bauen Sie Ihre Timan-Maschine', it: 'Configura la tua Timan', hu: 'Építsd meg saját Timan gépedet' },
  partnerMap:  { da: 'Find forhandler', en: 'Find dealer', de: 'Händler finden', it: 'Trova rivenditore', hu: 'Keresés kereskedőt' },
  partnerMapDesc: { da: 'Forhandlere, importører og servicepartnere', en: 'Dealers, importers and service partners', de: 'Händler, Importeure und Servicepartner', it: 'Rivenditori, importatori e service partner', hu: 'Kereskedők, importőrök, szervizpartnerek' },
  video:       { da: 'Video Akademi', en: 'Video Academy', de: 'Video-Akademie', it: 'Video Academy', hu: 'Videó Akadémia' },
  videoDesc:   { da: 'Maskinvideoer og guides', en: 'Machine videos and guides', de: 'Maschinenvideos und Anleitungen', it: 'Video macchine e guide', hu: 'Gépvideók és útmutatók' },
  news:        { da: 'Seneste nyt', en: 'Latest news', de: 'Nyheder', it: 'Ultime notizie', hu: 'Legfrissebb hírek' },
  newsDesc:    { da: 'Nyt fra Timan-verdenen', en: 'News from the Timan world', de: 'Neues aus der Timan-Welt', it: 'Notizie dal mondo Timan', hu: 'Hírek a Timan világából' },
  timan2620:     { da: 'Timan 2620', en: 'Timan 2620', de: 'Timan 2620', it: 'Timan 2620', hu: 'Timan 2620' },
  timan2620Desc: { da: 'Udforsk maskinen i 360° med udstyrsvalg', en: 'Explore the machine in 360° with equipment options', de: 'Erkunden Sie die Maschine in 360° mit Ausstattungsoptionen', it: 'Esplora la macchina in 360° con opzioni di equipaggiamento', hu: 'Fedezze fel a gépet 360°-ban felszereltség-választással' },
  quickActions: { da: 'Hurtige handlinger', en: 'Quick actions', de: 'Schnellaktionen', it: 'Azioni rapide', hu: 'Gyors műveletek' },
  drift:      { da: 'Driftberegner', en: 'Operating cost calculator', de: 'Betriebskostenrechner', it: 'Calcolatore costi', hu: 'Üzemköltség kalkulátor' },
  co2:        { da: 'CO2 Kalkulator', en: 'CO2 Calculator', de: 'CO2-Rechner', it: 'Calcolatore CO2', hu: 'CO2 kalkulátor' },
  preview:    { da: 'Du forhåndsviser Timan Messe', en: 'Previewing Timan Exhibition', de: 'Vorschau Timan Messe', it: 'Anteprima Timan Fiera', hu: 'Timan Kiállítás előnézet' },
  disabled:    { da: 'Messeadgang er ikke aktiv lige nu.', en: 'Exhibition access is currently disabled.', de: 'Messe-Zugang ist derzeit nicht aktiv.', it: 'Accesso fiera attualmente disattivato.', hu: 'A kiállítási hozzáférés jelenleg nem aktív.' },
  brochures:  { da: 'Maskinbrochurer', en: 'Machine brochures', de: 'Machine brochures', it: 'Brochure macchine', hu: 'Gepbrosurak' },
  openBrochure: { da: 'Åbn brochure', en: 'Open brochure', de: 'Brochure oeffnen', it: 'Apri brochure', hu: 'Brosura megnyitasa' },
  brochureMissing: { da: 'Brochure mangler', en: 'Brochure missing', de: 'Brochure fehlt', it: 'Brochure mancante', hu: 'Hianyzo brosura' },
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
  { to: '/messe/timan-2620',   icon: <Tractor className="h-14 w-14" />,  title: 'timan2620',    desc: 'timan2620Desc',    accent: 'from-slate-600 to-slate-800' },
  { to: '/messe/partner-map',  icon: <MapPin className="h-14 w-14" />,    title: 'partnerMap',   desc: 'partnerMapDesc',   accent: 'from-sky-500 to-sky-700' },
  { to: '/messe/video',        icon: <Play className="h-14 w-14" />,      title: 'video',        desc: 'videoDesc',        accent: 'from-rose-500 to-rose-700' },
  { to: '/messe/nyt',          icon: <Newspaper className="h-14 w-14" />, title: 'news',         desc: 'newsDesc',         accent: 'from-amber-500 to-amber-700' },
];

const QUICK_ACTIONS = [
  { to: '/messe/resources/driftberegner', icon: Gauge, label: 'drift' as const },
  { to: '/messe/resources/co2', icon: Leaf, label: 'co2' as const },
];

const BROCHURES = [
  { title: 'Timan RC-751', href: '/brochures/rc-751-da.pdf' },
  { title: 'Timan RC-1000s', href: '/brochures/rc-1000s-da.pdf' },
  { title: 'Timan 2620', href: '' },
  { title: 'Timan 3330', href: '/brochures/timan-3330-da.pdf' },
];

/**
 * Timan Messe entry page.
 *
 * MesseRouteGuard already enforces that we have a real appUser that is
 * either Messe-variant or a backend user with Messe preview active. We
 * just render the normal PortalHeader on top so the role switcher works,
 * plus the tile grid below.
 */
export default function MesseHomePage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const [enabled, setEnabled] = useState<boolean>(() => isMesseEnabled());
  const [activeBrochure, setActiveBrochure] = useState<{ title: string; href: string } | null>(null);
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

  if (!enabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <img src={timanLogo} alt="Timan" className="h-16 mb-6" />
        <h1 className="text-2xl font-bold text-slate-900">{T.disabled[lang]}</h1>
      </div>
    );
  }

  // Guard guarantees appUser, but TS doesn't know that.
  if (!appUser) return null;

  const isBackendPreview = canSwitchMode(appUser);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />
      {isBackendPreview && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2 flex-wrap">
            <DemoModeBadge />
            <span className="opacity-80">— {T.preview[lang]}</span>
          </div>
        </div>
      )}

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
              className="group relative overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 min-h-[180px] sm:min-h-[220px] flex flex-col justify-end p-6 sm:p-8"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${tile.accent} opacity-90 pointer-events-none`} />
              <div className="relative text-white pointer-events-none">
                <div className="mb-4 opacity-95">{tile.icon}</div>
                <div className="text-2xl sm:text-3xl font-bold leading-tight">{T[tile.title][lang]}</div>
                <div className="text-sm sm:text-base text-white/85 mt-1">{T[tile.desc][lang]}</div>
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{T.brochures[lang]}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {BROCHURES.map((brochure) => {
              const hasFile = !!brochure.href;
              return (
                <button
                  key={brochure.title}
                  type="button"
                  disabled={!hasFile}
                  onClick={() => hasFile && setActiveBrochure(brochure)}
                  className={`flex min-h-[96px] items-center gap-4 rounded-xl border bg-white px-5 py-4 text-left shadow-sm transition ${
                    hasFile
                      ? 'border-slate-200 hover:-translate-y-0.5 hover:shadow-md'
                      : 'cursor-not-allowed border-slate-200 opacity-55'
                  }`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#2d5a27]">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-bold text-slate-900">{brochure.title}</span>
                    <span className="text-sm text-slate-500">
                      {hasFile ? T.openBrochure[lang] : T.brochureMissing[lang]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{T.quickActions[lang]}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            {QUICK_ACTIONS.map(action => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 shadow-sm px-5 py-4 hover:shadow-md hover:-translate-y-0.5 transition"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[#2d5a27]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-bold text-slate-900">{T[action.label][lang]}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      {activeBrochure && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6">
          <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-[#2d5a27]">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-bold text-slate-900">{activeBrochure.title}</div>
                  <div className="text-xs text-slate-500">PDF</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveBrochure(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Luk"
                title="Luk"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              title={activeBrochure.title}
              src={`${activeBrochure.href}#view=FitH`}
              className="h-full w-full flex-1 bg-slate-100"
            />
          </div>
        </div>
      )}

      <footer className="text-center text-xs text-slate-500 py-4">
        © {new Date().getFullYear()} Timan — Messe demo
      </footer>
    </div>
  );
}
