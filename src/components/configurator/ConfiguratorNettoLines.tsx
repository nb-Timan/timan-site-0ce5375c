import type { LineItem } from '@/types/configurator';
import { configuratorCartLineDescription } from '@/lib/configuratorLinePresentation';

interface Props {
  lines: LineItem[];
  label: string;
  showPrices: boolean;
  formatMoney: (amount: number) => string;
}

export function ConfiguratorNettoLines({ lines, label, showPrices, formatMoney }: Props) {
  const netto = lines.filter(line => line.isNetto);
  if (!netto.length) return null;
  return <section className="space-y-2 text-xs text-gray-600" data-testid="configurator-netto-lines" aria-label={label}>
    <h3 className="text-sm font-semibold text-gray-800">{label}</h3>
    {netto.map((line, index) => <div key={index} className="flex items-start justify-between gap-3">
      <span className="min-w-0 flex-1 break-words">{line.varenr} — {configuratorCartLineDescription(line).replace(/^[-\s]+/, '')}</span>
      {showPrices && <span className="price-col shrink-0 whitespace-nowrap font-medium">{formatMoney(line.price)}</span>}
    </div>)}
  </section>;
}
