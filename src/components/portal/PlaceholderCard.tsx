import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const SOON: Record<Language, string> = {
  da: 'Kommer snart', en: 'Coming soon', de: 'Bald verfügbar', it: 'In arrivo', hu: 'Hamarosan',
};

const OPEN: Record<Language, string> = {
  da: 'Åbn', en: 'Open', de: 'Öffnen', it: 'Apri', hu: 'Megnyitás',
};

interface Props {
  title: string;
  language: Language;
  /** When provided, the card becomes a real link (used for live modules like TSB). */
  to?: string;
}

export default function PlaceholderCard({ title, language, to }: Props) {
  const live = !!to;
  const inner = (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col text-left w-full h-full transition',
        live ? 'hover:shadow-md hover:border-[#2d5a27]/30 cursor-pointer' : 'opacity-70',
      )}
    >
      <div className={cn(
        'w-14 h-14 rounded-xl flex items-center justify-center mb-6',
        live ? 'bg-[#2d5a27]/10' : 'bg-gray-50',
      )}>
        <Sparkles
          className={cn('h-8 w-8', live ? 'text-[#2d5a27]' : 'text-gray-400')}
          strokeWidth={2}
        />
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>

      <p className="text-gray-600 text-sm mb-6 flex-grow" />

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

  if (to) return <Link to={to} className="block h-full">{inner}</Link>;
  return inner;
}
