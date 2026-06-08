import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import timanLogo from '@/assets/timan-logo.png';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

/**
 * Timan Messe product page — fullscreen exhibition kiosk layout.
 *
 * Scope: this page only. Does NOT use the normal PortalHeader.
 *
 * Header on this page is intentionally minimal:
 *   - Timan logo
 *   - Language selector
 * Hidden: user name/avatar, role selector, logout, notification bell,
 * yellow DEMO MODE badge.
 *
 * Layout: kiosk-style with ~75% machine area and ~25% control sidebar.
 * Designed for large touchscreens placed next to the real machine at a trade fair.
 */
export default function MesseTiman2620Page() {
  const { uiLanguage, setLanguage } = useLanguage();
  const { appUser } = useAppUser();
  const navigate = useNavigate();

  if (!appUser) return null;

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Kiosk header — logo + language selector only */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 h-20 flex items-center justify-between">
          <img src={timanLogo} alt="Timan" className="h-12 sm:h-14 w-auto object-contain" />
          <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-slate-50 border border-slate-200">
            {PORTAL_LANGUAGES.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 py-1 rounded-md transition ${
                  uiLanguage === l.code
                    ? 'bg-white shadow-sm border border-[#2d5a27]/30'
                    : 'border border-transparent hover:bg-white'
                }`}
                aria-label={l.code}
                title={l.label}
              >
                <span className="text-lg leading-none">{l.emoji}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-5 lg:py-7 flex flex-col">
        {/* Premium back button + title row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <button
            type="button"
            onClick={() => navigate('/messe')}
            className="inline-flex items-center gap-3 text-emerald-800 hover:text-emerald-900 font-semibold text-base lg:text-lg group"
          >
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-emerald-500 group-hover:shadow transition">
              <ArrowLeft className="h-5 w-5" />
            </span>
            Tilbage til maskiner
          </button>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-700/80 font-semibold">
              Timan
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
              Timan 2620
            </h1>
          </div>
        </div>

        <Timan2620Viewer />

        {/* Bottom info bar */}
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
                  <span className="inline-flex h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center text-sm font-bold">
                    {i + 1}
                  </span>
                  <h3 className="text-base lg:text-lg font-bold text-slate-900">{b.title}</h3>
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
