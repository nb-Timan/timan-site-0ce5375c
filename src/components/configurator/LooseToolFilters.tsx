import { Search } from 'lucide-react';
import { LOOSE_TOOL_MACHINE_FILTERS, type LooseToolMachineFilter } from '@/lib/looseToolPresentation';
import type { LooseToolCategory } from '@/data/looseToolAssortment';

interface Props {
  category: LooseToolCategory;
  machine: LooseToolMachineFilter | null;
  search: string;
  onCategory: (value: LooseToolCategory) => void;
  onMachine: (value: LooseToolMachineFilter) => void;
  onSearch: (value: string) => void;
  translate: (key: string) => string;
}

const categories = { all: 'looseAssortmentAll', attachments: 'looseAssortmentAttachments', consumables: 'looseAssortmentConsumables' };
const buttonClass = (selected: boolean) => 'rounded-full border px-3 py-1.5 text-sm font-medium transition '
  + (selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-500');

export function LooseToolFilters({ category, machine, search, onCategory, onMachine, onSearch, translate: T }: Props) {
  return <div className="mb-5 min-w-0 space-y-3 text-left" data-testid="loose-tool-filters">
    <div className="flex flex-wrap gap-2" role="group" aria-label={T('looseAssortmentCategory')}>
      {(Object.keys(categories) as LooseToolCategory[]).map(value => <button key={value} type="button"
        aria-pressed={category === value} className={buttonClass(category === value)}
        onClick={() => onCategory(value)}>{T(categories[value])}</button>)}
    </div>
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800">{T('looseToolsMachineFilterPrompt')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={T('looseToolsMachineFilterPrompt')}>
        {LOOSE_TOOL_MACHINE_FILTERS.map(value => <button key={value} type="button"
          aria-pressed={machine === value} className={buttonClass(machine === value)}
          onClick={() => onMachine(value)}>{value === 'all' ? T('allMachines') : value === 'RC-1000S' ? 'RC-1000s' : value}</button>)}
      </div>
    </div>
    <label className="flex min-w-0 items-center gap-2 rounded-md border border-gray-300 px-3 py-2">
      <Search size={16} aria-hidden="true" className="shrink-0 text-gray-500" />
      <input type="search" value={search} onChange={event => onSearch(event.target.value)}
        aria-label={T('looseAssortmentSearch')} placeholder={T('looseAssortmentSearch')}
        className="min-w-0 w-full bg-transparent text-sm outline-none" />
    </label>
  </div>;
}
