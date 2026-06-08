import { useNavigate } from 'react-router-dom';
import { Cog, Snowflake, Wrench } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import timanLogo from '@/assets/timan-logo.png';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';

/**
 * Timan 2620 Messe page — premium touchscreen kiosk layout.
 *
 * Scope: this page only. Hides the normal portal header. The kiosk top bar
 * shows the Timan logo (left), a large back pill button (centre/left) and
 * the language selector (right). Title sits above the left configuration
 * panel; the benefit bar is aligned to the machine column only.
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
      {/* Kiosk top bar: logo · back pill (centered) · language */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b border-slate-200/70">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 h-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex items-center">
            <img src={timanLogo} alt="Timan" className="h-14 sm:h-16 lg:h-[72px] w-auto object-contain" />
          </div>

          <button
            type="button"
            onClick={() => navigate('/messe')}
            className="justify-self-center inline-flex items-center px-6 min-h-[48px] rounded-full bg-white border border-slate-300 shadow-sm hover:shadow hover:border-emerald-600 text-slate-700 hover:text-emerald-800 font-semibold text-base transition"
          >
            Tilbage til maskiner
          </button>

          <div className="justify-self-end flex flex-wrap items-center gap-0.5 p-1 rounded-lg bg-white/90 border border-slate-200 shadow-sm">
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

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-5 lg:py-7">
        <Timan2620Viewer.Provider>
          <div className="flex flex-col lg:flex-row lg:items-start gap-5">
            {/* Left column: title + configuration panel */}
            <div className="w-full lg:w-[180px] lg:flex-shrink-0">
              <div className="mb-4">
                <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
                  Timan 2620
                </h1>
                <p className="text-sm lg:text-base text-slate-600 mt-1">Udforsk maskinen</p>
              </div>
              <Timan2620Viewer.Sidebar />
            </div>

            {/* Right column: machine area + benefit bar aligned to machine width */}
            <div className="flex-1 min-w-0">
              <Timan2620Viewer.Stage />

              <section className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-md px-5 py-4 lg:px-7 lg:py-5">
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
            </div>
          </div>
        </Timan2620Viewer.Provider>
      </main>

    </div>
  );
}
