import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Gauge, Leaf, MapPin, Newspaper, Play, Wrench } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { t } from '@/lib/i18n/translations';
import { isMesseEnabled } from '@/lib/exhibitionMode';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import timanLogo from '@/assets/timan-logo.png';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import PortalHeader from '@/components/portal/PortalHeader';
import { canSwitchMode } from '@/lib/activeMode';
import rc751Bg from '@/assets/messe/rc-751-bg.png.asset.json';
import rc751Art from '@/assets/messe/rc-751-art.png.asset.json';
import rc1000sBg from '@/assets/messe/rc-1000s-bg.png.asset.json';
import rc1000sArt from '@/assets/messe/rc-1000s-art.png.asset.json';
import t2620Bg from '@/assets/messe/timan-2620-bg.png.asset.json';
import t2620Art from '@/assets/messe/timan-2620-art.png.asset.json';
import t3330Bg from '@/assets/messe/timan-3330-bg.png.asset.json';
import t3330Art from '@/assets/messe/timan-3330-art.png.asset.json';

interface Tile {
  to: string;
  icon?: ReactNode;
  title: string;
  desc: string;
  accent: string;
  image?: string;
  fullImageTile?: boolean;
  /** Supplied gradient background + transparent machine artwork (layered card). */
  bgImage?: string;
  artImage?: string;
  /** Title is a model designation and must not be translated. */
  literalTitle?: boolean;
}

const TILES: Tile[] = [
  { to: '/messe/konfigurator', icon: <Wrench className="h-14 w-14" />, title: 'mh_configurator', desc: 'mh_configurator_desc', accent: 'from-emerald-500 to-emerald-700' },
  { to: '/messe/partner-map', icon: <MapPin className="h-14 w-14" />, title: 'mh_partner_map', desc: 'mh_partner_map_desc', accent: 'from-sky-500 to-sky-700' },
  { to: '/messe/rc-751', title: 'Timan RC-751', literalTitle: true, desc: 'mh_machine_brochure_desc', accent: 'from-amber-400 to-amber-600', bgImage: rc751Bg.url, artImage: rc751Art.url },
  { to: '/messe/rc-1000s', title: 'Timan RC-1000s', literalTitle: true, desc: 'mh_machine_brochure_desc', accent: 'from-red-500 to-red-700', bgImage: rc1000sBg.url, artImage: rc1000sArt.url },
  { to: '/messe/timan-2620', title: 'Timan 2620', literalTitle: true, desc: 'mh_2620_desc', accent: 'from-slate-600 to-slate-800', bgImage: t2620Bg.url, artImage: t2620Art.url },
  { to: '/messe/timan-3330', title: 'Timan 3330', literalTitle: true, desc: 'mh_machine_brochure_desc', accent: 'from-indigo-500 to-indigo-700', bgImage: t3330Bg.url, artImage: t3330Art.url },
  { to: '/messe/video', icon: <Play className="h-14 w-14" />, title: 'mh_video', desc: 'mh_video_desc', accent: 'from-rose-500 to-rose-700' },
  { to: '/messe/nyt', icon: <Newspaper className="h-14 w-14" />, title: 'mh_news', desc: 'mh_news_desc', accent: 'from-amber-500 to-amber-700' },
];

const QUICK_ACTIONS = [
  { to: '/messe/resources/driftberegner', icon: Gauge, label: 'mh_drift' },
  { to: '/messe/resources/co2', icon: Leaf, label: 'mh_co2' },
  { to: '/messe/follow-up', icon: ClipboardList, label: 'Messeformular', literalLabel: true },
];

export default function MesseHomePage() {
  const { appUser, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: legacyLanguage, uiLanguage, setLanguage } = useLanguage();
  const [enabled, setEnabled] = useState<boolean>(() => isMesseEnabled());
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
        <h1 className="text-2xl font-bold text-slate-900">{t('mh_disabled', uiLanguage)}</h1>
      </div>
    );
  }

  if (!appUser) return null;

  const isBackendPreview = canSwitchMode(appUser);
  const isDealerUser = derivePortalRole(effectiveUser) === 'dealer_user';
  const visibleQuickActions = isDealerUser
    ? QUICK_ACTIONS.filter((action) => action.to === '/messe/resources/driftberegner' || action.to === '/messe/resources/co2')
    : QUICK_ACTIONS;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={legacyLanguage}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />
      {isBackendPreview && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-center gap-2 flex-wrap">
            <DemoModeBadge />
            <span className="opacity-80">- {t('mh_preview', uiLanguage)}</span>
          </div>
        </div>
      )}

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t('mh_welcome', uiLanguage)}</h1>
          <p className="text-slate-600 mt-2 text-base sm:text-lg">{t('mh_intro', uiLanguage)}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {TILES.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className={`group relative overflow-hidden rounded-3xl shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 min-h-[146px] sm:min-h-[178px] flex flex-col justify-end p-6 sm:p-8 ${tile.bgImage ? 'bg-transparent border-0' : 'bg-white border border-slate-200'}`}
            >
              {!tile.bgImage && (
                <div className={`absolute inset-0 bg-gradient-to-br ${tile.accent} ${tile.fullImageTile ? 'opacity-100' : 'opacity-90'} pointer-events-none`} />
              )}
              {tile.bgImage && (
                <img
                  src={tile.bgImage}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover scale-[1.05] origin-center"
                />
              )}
              {tile.artImage && (
                <img
                  src={tile.artImage}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute right-[-1%] top-1/2 -translate-y-1/2 h-[100%] w-auto max-w-[68%] object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.02]"
                />
              )}
              {tile.image && (
                <img
                  src={tile.image}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-35 mix-blend-multiply transition duration-300 group-hover:scale-[1.02] group-hover:opacity-45"
                />
              )}
              {tile.fullImageTile && (
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top right, rgba(15,23,42,0.38) 0%, rgba(15,23,42,0.24) 30%, rgba(15,23,42,0.09) 55%, rgba(15,23,42,0) 75%)',
                  }}
                />
              )}

              <div className="relative text-white pointer-events-none [text-shadow:0_2px_10px_rgba(0,0,0,0.35)]">
                {tile.icon && <div className="mb-4 opacity-95">{tile.icon}</div>}
                <div className="text-2xl sm:text-3xl font-bold leading-tight">{tile.literalTitle ? tile.title : t(tile.title, uiLanguage)}</div>
                <div className="text-sm sm:text-base text-white/85 mt-1">{t(tile.desc, uiLanguage)}</div>
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{t('mh_quick_actions', uiLanguage)}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
            {visibleQuickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center justify-center gap-4 rounded-xl bg-white border border-slate-200 shadow-sm px-5 py-4 text-center hover:shadow-md hover:-translate-y-0.5 transition"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-[#2d5a27]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-bold text-slate-900 whitespace-nowrap">{action.literalLabel ? action.label : t(action.label, uiLanguage)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="text-center text-xs text-slate-500 py-4">
        &copy; {new Date().getFullYear()} Timan - {t('messeHomeFooter', uiLanguage)}
      </footer>
    </div>
  );
}
