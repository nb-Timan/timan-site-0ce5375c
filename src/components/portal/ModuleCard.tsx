import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PortalModule } from '@/lib/portalModules';
import { Language } from '@/types/configurator';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { pickT } from '@/lib/i18n/translations';
import { cn } from '@/lib/utils';

// Map abstract accent tokens to the exact mockup color classes.
const ACCENT: Record<PortalModule['accent'], { iconBg: string; iconBgHover: string; iconColor: string; ctaColor: string }> = {
  primary: { iconBg: 'bg-green-50',  iconBgHover: 'group-hover:bg-green-100',  iconColor: 'text-[#2d5a27]',   ctaColor: 'text-[#2d5a27]' },
  violet:  { iconBg: 'bg-blue-50',   iconBgHover: 'group-hover:bg-blue-100',   iconColor: 'text-blue-600',    ctaColor: 'text-blue-600' },
  sky:     { iconBg: 'bg-orange-50', iconBgHover: 'group-hover:bg-orange-100', iconColor: 'text-orange-600',  ctaColor: 'text-orange-600' },
  slate:   { iconBg: 'bg-purple-50', iconBgHover: 'group-hover:bg-purple-100', iconColor: 'text-purple-600',  ctaColor: 'text-purple-600' },
  amber:   { iconBg: 'bg-amber-50',  iconBgHover: 'group-hover:bg-amber-100',  iconColor: 'text-amber-600',   ctaColor: 'text-amber-600' },
  rose:    { iconBg: 'bg-rose-50',   iconBgHover: 'group-hover:bg-rose-100',   iconColor: 'text-rose-600',    ctaColor: 'text-rose-600' },
};

const SOON: Partial<Record<PortalUiLanguage, string>> = {
  da: 'Kommer snart', en: 'Coming soon', de: 'Bald verfügbar', it: 'In arrivo', hu: 'Hamarosan',
  sv: 'Kommer snart', fr: 'Bientôt disponible', pl: 'Wkrótce', cs: 'Brzy',
};

interface Props {
  module: PortalModule;
  /**
   * Portal UI language (9 codes). Accepts the legacy `Language` (5 codes) too —
   * `pickT` falls back to English for missing translations.
   */
  language: PortalUiLanguage | Language;
  badge?: { text: string; tone: 'default' | 'warning' | 'danger' } | null;
  /** Optional changelog update badge ("NY" / "VIGTIG"). */
  updateBadge?: { kind: 'new' | 'major'; label: string; tooltip?: string } | null;
}

export default function ModuleCard({ module, language, badge, updateBadge }: Props) {
  const navigate = useNavigate();
  const styles = ACCENT[module.accent];
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
    'bg-green-100 text-[#2d5a27]';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col cursor-pointer group text-left w-full transition-all duration-300',
        'hover:-translate-y-1.5 hover:shadow-md',
        disabled && 'opacity-70 cursor-not-allowed hover:translate-y-0 hover:shadow-sm',
      )}
    >
      {/* Icon tile — 14x14 (56px) rounded-xl */}
      <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-colors', styles.iconBg, styles.iconBgHover)}>
        <Icon className={cn('h-8 w-8', styles.iconColor)} strokeWidth={2} />
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold text-gray-900 mb-3">
        {pickT(module.title, language)}
      </h3>

      {/* Description */}
      <p className="text-gray-600 text-sm mb-6 flex-grow">
        {pickT(module.description, language)}
      </p>

      {/* Badges */}
      {(disabled || badge) && (
        <div className="mb-4 flex items-center gap-2">
          {disabled && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
              {pickT(SOON, language) || 'Coming soon'}
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
      <div className={cn('flex items-center font-semibold text-sm', styles.ctaColor)}>
        {pickT(module.cta, language)}
        <ArrowRight className="h-4 w-4 ml-2" />
      </div>
    </button>
  );
}
