import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PortalModule } from '@/lib/portalModules';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const ACCENT_CLASSES: Record<PortalModule['accent'], { iconBg: string; iconColor: string; cta: string; hoverRing: string }> = {
  primary: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', cta: 'text-emerald-700 group-hover:text-emerald-800', hoverRing: 'hover:border-emerald-200' },
  amber:   { iconBg: 'bg-amber-100',   iconColor: 'text-amber-700',   cta: 'text-amber-700 group-hover:text-amber-800',   hoverRing: 'hover:border-amber-200' },
  rose:    { iconBg: 'bg-rose-100',    iconColor: 'text-rose-700',    cta: 'text-rose-700 group-hover:text-rose-800',     hoverRing: 'hover:border-rose-200' },
  sky:     { iconBg: 'bg-sky-100',     iconColor: 'text-sky-700',     cta: 'text-sky-700 group-hover:text-sky-800',       hoverRing: 'hover:border-sky-200' },
  violet:  { iconBg: 'bg-violet-100',  iconColor: 'text-violet-700',  cta: 'text-violet-700 group-hover:text-violet-800', hoverRing: 'hover:border-violet-200' },
  slate:   { iconBg: 'bg-slate-100',   iconColor: 'text-slate-700',   cta: 'text-slate-700 group-hover:text-slate-900',   hoverRing: 'hover:border-slate-300' },
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
        'group relative text-left w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition flex flex-col',
        'hover:shadow-md hover:-translate-y-0.5',
        styles.hoverRing,
        disabled && 'opacity-70 cursor-not-allowed hover:translate-y-0 hover:shadow-sm',
      )}
    >
      {/* Icon tile */}
      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', styles.iconBg)}>
        <Icon className={cn('w-7 h-7', styles.iconColor)} />
      </div>

      {/* Title + description */}
      <h3 className="mt-5 text-lg font-bold text-gray-900">
        {module.title[language] || module.title.en}
      </h3>
      <p className="mt-2 text-sm text-gray-500 leading-relaxed flex-1">
        {module.description[language] || module.description.en}
      </p>

      {/* Badges */}
      {(disabled || badge) && (
        <div className="mt-4 flex items-center gap-2">
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
      )}

      {/* CTA */}
      <div className={cn('mt-5 inline-flex items-center gap-1.5 text-sm font-semibold transition', styles.cta)}>
        {module.cta[language] || module.cta.en}
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
