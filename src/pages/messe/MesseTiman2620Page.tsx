import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Cog, Snowflake, Wrench } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import timanLogo from '@/assets/timan-logo.png';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';

/**
 * Timan 2620 Messe page — single unified showroom card.
 *
 * Everything (title, sidebar, image, hotspots, back button, USP bar) lives
 * inside one light-grey rounded container so the experience reads as one
 * premium product showcase rather than separate sections.
 */
export default function MesseTiman2620Page() {
  const { uiLanguage, setLanguage } = useLanguage();
  const { appUser } = useAppUser();
  const navigate = useNavigate();

  if (!appUser) return null;

  const benefits = [
    {
      icon: Cog,
      title: t('m2620_benefit1_title', uiLanguage),
      text: t('m2620_benefit1_text', uiLanguage),
    },
    {
      icon: Snowflake,
      title: t('m2620_benefit2_title', uiLanguage),
      text: t('m2620_benefit2_text', uiLanguage),
    },
    {
      icon: Wrench,
      title: t('m2620_benefit3_title', uiLanguage),
      text: t('m2620_benefit3_text', uiLanguage),
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Kiosk top bar: logo · language */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur border-b border-slate-200/70">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 h-20 grid grid-cols-[1fr_auto] items-center gap-4">
          <div className="flex items-center">
            <img src={timanLogo} alt="Timan" className="h-14 sm:h-16 lg:h-[72px] w-auto object-contain" />
          </div>

          <div className="justify-self-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-6 min-h-[48px] rounded-full bg-white border border-slate-300 shadow-sm hover:shadow hover:border-emerald-600 text-slate-700 hover:text-emerald-800 font-semibold text-base transition cursor-pointer"
                >
                  {PORTAL_LANGUAGES.find(l => l.code === uiLanguage)?.flag ?? 'DK'}
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[100px]">
                {PORTAL_LANGUAGES.map(l => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className={`justify-center font-semibold cursor-pointer ${
                      uiLanguage === l.code ? 'bg-emerald-50 text-emerald-800' : ''
                    }`}
                  >
                    {l.flag}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-5 lg:py-6 flex flex-col">
        <Timan2620Viewer.Provider>
          {/* One unified showroom card */}
          <section
            className="bg-slate-100/80 border border-slate-200 rounded-3xl shadow-sm p-4 sm:p-5 lg:p-6 flex flex-col"
            style={{ maxHeight: 'min(920px, calc(100vh - 130px))' }}
          >
            <div className="flex flex-col lg:flex-row lg:items-stretch gap-4 lg:gap-6 flex-1 min-h-0">
              {/* Left column: title + configuration */}
              <div className="w-full lg:w-[200px] lg:flex-shrink-0 flex flex-col">
                <div className="mb-4">
                  <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
                    Timan 2620
                  </h1>
                  <p className="text-sm lg:text-base text-slate-600 mt-1">
                    {t('m2620_explore', uiLanguage)}
                  </p>
                </div>
                <Timan2620Viewer.Sidebar />
              </div>

              {/* Right/main: product image with hotspots.
                  The wrapper uses the photos' native 16:9 aspect so the
                  machine fills the entire stage (no empty bands) and the
                  percent-based hotspots stay perfectly aligned. */}
              <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
                <div className="relative w-full h-full max-h-full flex items-center justify-center">
                  <div className="w-full h-full max-w-full max-h-full aspect-[16/9] mx-auto"
                       style={{ maxHeight: '100%' }}>
                    <Timan2620Viewer.Stage />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row: back button + USP bar, attached to the card */}
            <div className="mt-4 lg:mt-5 pt-4 lg:pt-5 border-t border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 lg:gap-6 md:divide-x md:divide-slate-200 items-center">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => navigate('/messe')}
                    className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-semibold text-sm lg:text-base transition"
                  >
                    <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5" />
                    {t('m2620_back_home', uiLanguage)}
                  </button>
                </div>
                {benefits.map((b, i) => {
                  const Icon = b.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 md:pl-5 lg:pl-6">
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
            </div>
          </section>
        </Timan2620Viewer.Provider>
      </main>
    </div>
  );
}
