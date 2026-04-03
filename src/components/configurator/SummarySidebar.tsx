import { PriceSummary, MachineSelection } from '@/types/configurator';
import { getMachineById } from '@/data/machines';
import { t } from '@/data/translations';
import { Separator } from '@/components/ui/separator';

interface SummarySidebarProps {
  selections: MachineSelection[];
  priceSummary: PriceSummary;
}

function formatKr(amount: number): string {
  return amount.toLocaleString('da-DK', { minimumFractionDigits: 0 }) + ' kr.';
}

export function SummarySidebar({ selections, priceSummary }: SummarySidebarProps) {
  if (selections.length === 0) return null;

  return (
    <div className="bg-card border rounded-lg p-4 space-y-3 sticky top-4">
      <h3 className="font-semibold text-sm">{t('summaryTitle')}</h3>
      <div className="space-y-2">
        {selections.map((sel) => {
          const machine = getMachineById(sel.machineId);
          if (!machine) return null;
          return (
            <div key={sel.machineId} className="flex justify-between text-sm">
              <span>
                {machine.name} {sel.quantity > 1 && `×${sel.quantity}`}
              </span>
              <span className="font-medium">{formatKr(machine.basePrice * sel.quantity)}</span>
            </div>
          );
        })}
      </div>
      <Separator />
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('subtotal')}</span>
          <span>{formatKr(priceSummary.subtotal)}</span>
        </div>
        {priceSummary.totalDiscount > 0 && (
          <div className="flex justify-between text-success">
            <span>{t('totalDiscount')}</span>
            <span>-{formatKr(priceSummary.totalDiscount)}</span>
          </div>
        )}
      </div>
      <Separator />
      <div className="flex justify-between text-sm font-bold">
        <span>{t('finalPrice')}</span>
        <span className="text-primary">{formatKr(priceSummary.finalPrice)}</span>
      </div>
      <p className="text-[10px] text-muted-foreground text-right">{t('exVat')}</p>
    </div>
  );
}
