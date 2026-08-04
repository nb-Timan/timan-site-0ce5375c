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
import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';

/**
 * Timan 2620 Messe page — premium kiosk layout.
 *
 * Header: Timan logo + language dropdown.
 * Body: title above the configuration sidebar, large product stage to the right.
 * Footer: 4-column row — "← Til forsiden" + 3 benefit cards sharing the same baseline.
 */
interface MesseTiman2620PageProps {
  backTo?: string;
}

export default function MesseTiman2620Page({ backTo = '/messe' }: MesseTiman2620PageProps) {
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
      className="min-h-screen flex flex-col"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: 'linear-gradient(135deg, #f4f7f9 0%, #eef3f7 45%, #e9eef4 100%)',
      }}
    >
      {/* Kiosk top bar: logo (aligned above left column) · language */}
      <header className="sticky top-0 z-40 bg-transparent">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-5 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center lg:w-[220px] lg:justify-center">
            <img src={timanLogo} alt="Timan" className="h-12 sm:h-14 lg:h-16 w-auto object-contain" />
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

      <main className="flex-grow max-w-[1800px] w-full mx-auto px-4 sm:px-6 lg:px-5 py-6 lg:py-8 flex flex-col">
        <Timan2620Viewer.Provider>
          {/* Title + sidebar in left column, stage on right — stage aligns to title top */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-5 lg:gap-8">
            <div className="w-full lg:w-[220px] lg:flex-shrink-0">
              <div className="mb-5 lg:mb-6">
                <h1 className="text-3xl lg:text-4xl font-bold text-slate-900 leading-tight">
                  Timan 2620
                </h1>
                <p className="text-base lg:text-lg text-slate-600 mt-1">
                  {t('m2620_explore', uiLanguage)}
                </p>
              </div>
              <Timan2620Viewer.Sidebar />
            </div>
            <div className="flex-1 min-w-0 w-full">
              <Timan2620Viewer.Stage disableZoom largeArrows />
            </div>
          </div>

          {/* Footer row: back button under left menu, USP bar under stage */}
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-stretch gap-5 lg:gap-8">
            <div className="w-full lg:w-[220px] lg:flex-shrink-0 flex items-center">
              <button
                type="button"
                onClick={() => navigate(backTo)}
                className="inline-flex items-center gap-2 px-5 h-12 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-semibold text-base transition"
              >
                <ArrowLeft className="h-5 w-5" />
                {t('m2620_back_home', uiLanguage)}
              </button>
            </div>
            <div className="flex-1 min-w-0 w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 md:divide-x md:divide-slate-200 items-center">
                {benefits.map((b, i) => {
                  const Icon = b.icon;
                  return (
                    <div key={i} className={`flex items-center gap-4 py-2 ${i > 0 ? 'md:pl-6 lg:pl-8' : ''}`}>
                      <span className="flex-shrink-0 inline-flex h-14 w-14 rounded-full bg-emerald-50 text-emerald-700 items-center justify-center">
                        <Icon className="h-7 w-7" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-lg lg:text-xl font-bold text-slate-900 leading-tight">
                          {b.title}
                        </h3>
                        <p className="text-sm lg:text-base text-slate-600 mt-1.5 leading-relaxed">
                          {b.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Timan2620Viewer.Provider>
      </main>
    </div>
  );
}
