import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { PortalModule } from '@/lib/portalModules';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const ACCENT_CLASSES: Record<PortalModule['accent'], { bg: string; icon: string; ring: string }> = {
  primary: { bg: 'bg-emerald-50', icon: 'text-emerald-700 bg-emerald-100', ring: 'group-hover:ring-emerald-300' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-700 bg-amber-100',     ring: 'group-hover:ring-amber-300' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-700 bg-rose-100',       ring: 'group-hover:ring-rose-300' },
  sky:     { bg: 'bg-sky-50',     icon: 'text-sky-700 bg-sky-100',         ring: 'group-hover:ring-sky-300' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-700 bg-violet-100',   ring: 'group-hover:ring-violet-300' },
  slate:   { bg: 'bg-slate-50',   icon: 'text-slate-700 bg-slate-200',     ring: 'group-hover:ring-slate-300' },
};

const SOON: Record<Language, string> = {
  da: 'Kommer snart', en: 'Coming soon', de: 'Bald verfügbar', it: 'In arrivo', hu: 'Hamarosan',
};

interface Props {
  module: PortalModule;
  language: Language;
  badge?: { text: string; tone: 'default' | 'warning' | 'danger' } | null;
}

export default function ModuleCard({ module, language, badge }: Props) {
  const navigate = useNavigate();
  const styles = ACCENT_CLASSES[module.accent];
  const Icon = module.icon;
  const disabled = !module.enabled;

  const handleClick = () => {
    if (disabled) return;
    if (module.href.startsWith('http')) {
      window.open(module.href, '_blank', 'noopener,noreferrer');
    } else {
      navigate(module.href);
    }
  };

  const badgeTone = badge?.tone ?? 'default';
  const badgeClass =
    badgeTone === 'danger' ? 'bg-rose-100 text-rose-700' :
    badgeTone === 'warning' ? 'bg-amber-100 text-amber-700' :
    'bg-emerald-100 text-emerald-700';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'group relative text-left w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition',
        'ring-1 ring-transparent hover:shadow-md hover:-translate-y-0.5',
        styles.ring,
        disabled && 'opacity-70 cursor-not-allowed hover:translate-y-0 hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', styles.icon)}>
          <Icon className="w-5 h-5" />
        </div>
        {!disabled && (
          <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition" />
        )}
      </div>

      <h3 className="mt-4 text-base font-semibold text-gray-900">
        {module.title[language] || module.title.en}
      </h3>
      <p className="mt-1 text-sm text-gray-500 leading-snug">
        {module.description[language] || module.description.en}
      </p>

      <div className="mt-4 flex items-center gap-2 min-h-[22px]">
        {disabled && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
            {SOON[language] || SOON.en}
          </span>
        )}
        {badge && (
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', badgeClass)}>
            {badge.text}
          </span>
        )}
      </div>
    </button>
  );
}
