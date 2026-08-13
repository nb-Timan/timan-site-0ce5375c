import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import timanLogo from '@/assets/timan-logo-transparent-trimmed.png';
import { useLanguage } from '@/context/LanguageContext';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface MesseSubpageHeaderProps {
  backTo?: string;
  backLabel?: string;
}

export default function MesseSubpageHeader({
  backTo = '/messe',
  backLabel,
}: MesseSubpageHeaderProps) {
  const { uiLanguage, setLanguage } = useLanguage();
  const resolvedBackLabel = backLabel ?? t('portalHeaderToFrontPage', uiLanguage);
  const logoTitle = t('portalHeaderHome', uiLanguage);
  const currentLanguage = PORTAL_LANGUAGES.find((l) => l.code === uiLanguage);

  return (
    <header className="sticky top-0 z-[1200] border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex h-20 max-w-[1800px] items-center justify-end gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          to={backTo}
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          aria-label={logoTitle}
          title={logoTitle}
        >
          <img src={timanLogo} alt="Timan" className="h-12 w-auto object-contain sm:h-14" />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to={backTo}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 sm:px-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{resolvedBackLabel}</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
              >
                {currentLanguage?.flag ?? 'DK'}
                <ChevronDown className="h-4 w-4 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[1300] min-w-[110px]">
              {PORTAL_LANGUAGES.map((l) => (
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
  );
}
