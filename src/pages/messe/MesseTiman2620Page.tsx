import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cog, Snowflake, Wrench } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAppUser } from '@/context/AppUserContext';
import Timan2620Viewer from '@/components/product-viewer/Timan2620Viewer';
import { t } from '@/lib/i18n/translations';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';

/**
 * Timan 2620 Messe page — premium kiosk layout.
 *
 * Header: Timan logo + language dropdown.
 * Body: title above the configuration sidebar, large product stage to the right.
 * Footer: benefit cards under the product stage.
 */
interface MesseTiman2620PageProps {
  backTo?: string;
}

export default function MesseTiman2620Page({ backTo = '/messe' }: MesseTiman2620PageProps) {
  const { uiLanguage } = useLanguage();
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
      <MesseSubpageHeader backTo={backTo} backLabel={t('m2620_back_home', uiLanguage)} />

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

          {/* Footer row: USP bar under stage */}
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-stretch gap-5 lg:gap-8">
            <div className="w-full lg:w-[220px] lg:flex-shrink-0 flex items-center">
              {backTo !== '/messe' ? (
                <button
                  type="button"
                  onClick={() => navigate(backTo)}
                  className="inline-flex items-center gap-2 px-5 h-12 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-semibold text-base transition"
                >
                  <ArrowLeft className="h-5 w-5" />
                  {t('m2620_back_home', uiLanguage)}
                </button>
              ) : null}
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
