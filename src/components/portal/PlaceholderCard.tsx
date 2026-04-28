import { Sparkles } from 'lucide-react';
import { Language } from '@/types/configurator';
import { cn } from '@/lib/utils';

const SOON: Record<Language, string> = {
  da: 'Kommer snart', en: 'Coming soon', de: 'Bald verfügbar', it: 'In arrivo', hu: 'Hamarosan',
};

interface Props {
  title: string;
  language: Language;
}

/**
 * Visual twin of ModuleCard but inert — used in Phase 1 for areas whose
 * real modules will be imported in later phases.
 */
export default function PlaceholderCard({ title, language }: Props) {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col text-left w-full',
        'opacity-70',
      )}
    >
      <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 bg-gray-50">
        <Sparkles className="h-8 w-8 text-gray-400" strokeWidth={2} />
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>

      <p className="text-gray-600 text-sm mb-6 flex-grow">
        {/* intentionally empty body */}
      </p>

      <div className="mb-4 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500">
          {SOON[language] || SOON.en}
        </span>
      </div>
    </div>
  );
}
