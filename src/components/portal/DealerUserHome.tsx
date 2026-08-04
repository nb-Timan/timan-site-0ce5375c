import { Link, useNavigate } from 'react-router-dom';
import { Gauge, Leaf, MapPin, Play, Tractor, Wrench } from 'lucide-react';
import type { SessionUser } from '@/context/AppUserContext';
import type { Language } from '@/types/configurator';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import LatestChanges from '@/components/portal/LatestChanges';
import LatestFromTiman from '@/components/portal/LatestFromTiman';

interface DealerUserHomeProps {
  user: SessionUser;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLogout: () => Promise<void>;
}

const tiles = [
  {
    to: '/configurator',
    icon: Wrench,
    title: 'Konfigurator',
    desc: 'Byg din Timan uden priser',
    accent: 'from-emerald-500 to-emerald-700',
  },
  {
    to: '/portal/timan-2620',
    icon: Tractor,
    title: 'Timan 2620',
    desc: 'Udforsk maskinen i 360°',
    accent: 'from-slate-600 to-slate-800',
  },
  {
    to: '/portal/misc/partner-map',
    icon: MapPin,
    title: 'Find forhandler',
    desc: 'Forhandlere, importører og servicepartnere',
    accent: 'from-sky-500 to-sky-700',
  },
  {
    to: '/portal/videos',
    icon: Play,
    title: 'Video Akademi',
    desc: 'Maskinvideoer og guides',
    accent: 'from-rose-500 to-rose-700',
  },
];

const quickActions = [
  { to: '/portal/resources/driftberegner', icon: Gauge, label: 'Driftberegner' },
  { to: '/portal/resources/co2', icon: Leaf, label: 'CO2 Kalkulator' },
];

export default function DealerUserHome({ user, language, onLanguageChange, onLogout }: DealerUserHomeProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={user}
        language={language}
        onLanguageChange={onLanguageChange}
        onLogout={async () => {
          await onLogout();
          navigate('/portal', { replace: true });
        }}
      />

      <main className="flex-grow max-w-6xl w-full mx-auto px-4 sm:px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">Velkommen til Timan</h1>
          <p className="text-slate-600 mt-2 text-base sm:text-lg">Vælg en mulighed for at udforske Timan.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {tiles.map(tile => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.to}
                to={tile.to}
                className="group relative overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 min-h-[180px] sm:min-h-[220px] flex flex-col justify-end p-6 sm:p-8"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${tile.accent} opacity-90 pointer-events-none`} />
                <div className="relative text-white pointer-events-none">
                  <div className="mb-4 opacity-95"><Icon className="h-14 w-14" /></div>
                  <div className="text-2xl sm:text-3xl font-bold leading-tight">{tile.title}</div>
                  <div className="text-sm sm:text-base text-white/85 mt-1">{tile.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Hurtige handlinger</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            {quickActions.map(action => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-[#2d5a27] transition"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2d5a27]/10 text-[#2d5a27] group-hover:bg-[#2d5a27] group-hover:text-white transition">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-slate-800">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <LatestChanges language={language} />
        <LatestFromTiman language={language} />
      </main>

      <PortalFooter language={language} />
    </div>
  );
}
