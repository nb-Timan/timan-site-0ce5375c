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

              <section className="mt-8 pt-6 border-t border-slate-200">
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
