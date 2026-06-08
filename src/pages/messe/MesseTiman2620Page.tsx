import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cog, Snowflake, Wrench } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import timanLogo from '@/assets/timan-logo.png';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

/**
 * Timan 2620 Messe page — premium touchscreen kiosk layout.
 *
 * Scope: this page only. Hides the normal portal header; keeps the
 * language selector and the Timan logo. Title and back button live inside
 * the kiosk frame so the page feels like a standalone exhibition product.
 */
export default function MesseTiman2620Page() {
  const { uiLanguage, setLanguage } = useLanguage();
  const { appUser } = useAppUser();
  const navigate = useNavigate();

  if (!appUser) return null;

  const benefits = [
    {
      icon: Cog,
      title: 'Kompakt og stærk',
      text: 'Timan 2620 kombinerer kompakt design med stor ydeevne.',
    },
    {
      icon: Snowflake,
      title: 'Kan bruges hele året',
      text: 'Fra sne og salt om vinteren til fejning og vedligehold om sommeren.',
    },
    {
      icon: Wrench,
      title: 'Utrolig nem at skifte redskaber',
      text: 'Hurtigt skift af udstyr uden værktøj — mere tid på opgaven, mindre tid på skift.',
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Minimal kiosk top bar — language selector only on the right */}
      <header className="sticky top-0 z-40">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-end">
          <div className="flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-white/80 backdrop-blur border border-slate-200 shadow-sm">
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

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-10 pb-6 lg:pb-8 flex flex-col">
        {/* Title row: logo + headline aligned over the left panel column */}
        <div className="lg:max-w-[300px] mb-4 lg:mb-5">
          <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto object-contain mb-3" />
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 leading-tight">
            Timan 2620
          </h1>
          <p className="text-base lg:text-lg text-slate-600 mt-1">Udforsk maskinen</p>
        </div>

        <Timan2620Viewer />

        {/* Bottom benefit bar */}
        <section className="mt-5 lg:mt-6 bg-white rounded-2xl border border-slate-200 shadow-md px-5 py-4 lg:px-7 lg:py-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-8 md:divide-x md:divide-slate-200">
            {benefits.map((b, i) => {
              const Icon = b.icon;
              return (
                <div key={i} className={`flex items-start gap-3 ${i > 0 ? 'md:pl-6 lg:pl-8' : ''}`}>
                  <span className="flex-shrink-0 inline-flex h-10 w-10 rounded-full bg-emerald-50 text-emerald-700 items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm lg:text-base font-bold text-slate-900 leading-tight">
                      {b.title}
                    </h3>
                    <p className="text-xs lg:text-sm text-slate-600 mt-0.5 leading-relaxed">
                      {b.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Premium back button — bottom-left of the kiosk frame */}
        <div className="mt-5 lg:mt-6">
          <button
            type="button"
            onClick={() => navigate('/messe')}
            className="inline-flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow hover:border-emerald-500 text-emerald-800 hover:text-emerald-900 font-semibold text-base lg:text-lg transition group"
          >
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100">
              <ArrowLeft className="h-5 w-5" />
            </span>
            Tilbage til maskiner
          </button>
        </div>
      </main>
    </div>
  );
}
