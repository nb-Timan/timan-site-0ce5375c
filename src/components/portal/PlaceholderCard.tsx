import { Sparkles, LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const SOON: Record<Language, string> = {
  da: 'Kommer snart', en: 'Coming soon', de: 'Bald verfügbar', it: 'In arrivo', hu: 'Hamarosan',
};

const OPEN: Record<Language, string> = {
  da: 'Åbn', en: 'Open', de: 'Öffnen', it: 'Apri', hu: 'Megnyitás',
};

export type PlaceholderUpdateBadge = {
  /** 'major' renders as VIGTIG (rose), 'new' renders as NY (green). */
  kind: 'new' | 'major';
  /** Short label, e.g. "NY" or "VIGTIG". */
  label: string;
  /** Optional tooltip shown on hover/focus (multi-line OK). */
  tooltip?: string;
};

interface Props {
  title: string;
  language: Language;
  /** When provided, the card becomes a real link (used for live modules like TSB). */
  to?: string;
  /** Optional custom icon (defaults to Sparkles). */
  icon?: LucideIcon;
  /** Optional short description shown below the title. */
  description?: string;
  /** Optional changelog update badge ("NY" / "VIGTIG"). */
  updateBadge?: PlaceholderUpdateBadge | null;
  /** Called when the card is activated (click/keyboard) — used to mark read. */
  onActivate?: () => void;
}

export default function PlaceholderCard({ title, language, to, icon: Icon = Sparkles, description, updateBadge, onActivate }: Props) {
  const live = !!to;
  const badgeClass = updateBadge?.kind === 'major'
    ? 'bg-rose-100 text-rose-700'
    : 'bg-green-100 text-[#2d5a27]';

  const inner = (
    <div
      className={cn(
        'relative bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col text-left w-full h-full transition',
        live ? 'hover:shadow-md hover:border-[#2d5a27]/30 cursor-pointer' : 'opacity-70',
      )}
    >
      {updateBadge && (
        <span
          className={cn(
            'absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
            badgeClass,
          )}
          title={updateBadge.tooltip}
        >
          {updateBadge.label}
        </span>
      )}

      <div className={cn(
        'w-14 h-14 rounded-xl flex items-center justify-center mb-6',
        live ? 'bg-[#2d5a27]/10' : 'bg-gray-50',
      )}>
        <Icon
          className={cn('h-8 w-8', live ? 'text-[#2d5a27]' : 'text-gray-400')}
          strokeWidth={2}
        />
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>

      <p className="text-gray-600 text-sm mb-6 flex-grow">{description ?? ''}</p>

      <div className="mb-4 flex items-center gap-2">
        <span className={cn(
          'px-2 py-0.5 rounded-full text-[11px] font-semibold',
          live ? 'bg-[#2d5a27]/10 text-[#2d5a27]' : 'bg-gray-100 text-gray-500',
        )}>
          {(live ? OPEN : SOON)[language] || (live ? OPEN : SOON).en}
        </span>
      </div>
    </div>
  );

  if (to) return <Link to={to} className="block h-full" onClick={onActivate}>{inner}</Link>;
  return inner;
}
