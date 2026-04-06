import { useState } from 'react';
import { DeliveryInfo, DeliveryMethod } from '@/types/configurator';
import { t } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CalendarIcon, Info, Truck, Package, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface DeliveryStepProps {
  deliveryInfo: DeliveryInfo;
  onDeliveryChange: (info: Partial<DeliveryInfo>) => void;
  onNext: () => void;
  onPrevious: () => void;
}

const deliveryMethods: { value: DeliveryMethod; icon: typeof Truck; label: string; desc: string }[] = [
  { value: 'pickup', icon: MapPin, label: 'Afhentning', desc: 'Afhent hos Timan' },
  { value: 'send', icon: Package, label: 'Fragt', desc: 'Levering med fragtmand' },
  { value: 'deliver', icon: Truck, label: 'Levering + opstart', desc: 'Vi leverer og starter op' },
];

export function DeliveryStep({ deliveryInfo, onDeliveryChange, onNext, onPrevious }: DeliveryStepProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const threeMonthsAhead = new Date();
  threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);
  const hasDeliveryDiscount = deliveryInfo.date && deliveryInfo.date > threeMonthsAhead;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Delivery date */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('deliveryDate')}</label>
          {hasDeliveryDiscount && (
            <span className="text-xs text-success font-medium bg-success/10 px-2 py-0.5 rounded">
              2% leveringsrabat
            </span>
          )}
        </div>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                'w-full sm:w-[280px] justify-start text-left font-normal cursor-pointer pointer-events-auto select-none',
                !deliveryInfo.date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
              <span className="pointer-events-none">
                {deliveryInfo.date ? format(deliveryInfo.date, 'PPP', { locale: da }) : 'Vælg dato'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={deliveryInfo.date ?? undefined}
              defaultMonth={deliveryInfo.date ?? new Date()}
              onSelect={(d) => {
                onDeliveryChange({ date: d ?? null });
                setCalendarOpen(false);
              }}
              disabled={(d) => d < new Date()}
              modifiers={{
                discount: (d) => d > threeMonthsAhead,
              }}
              modifiersStyles={{
                discount: {
                  backgroundColor: 'hsl(45 93% 80%)',
                  borderRadius: '6px',
                },
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
            <div className="px-3 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: 'hsl(45 93% 80%)' }} />
              Gul markering = 2% ekstra rabat
            </div>
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          Leveringsdato mere end 3 måneder frem giver 2% ekstra rabat
        </p>
      </div>

      {/* Delivery method */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t('deliveryMethod')}</label>
          <Dialog>
            <DialogTrigger asChild>
              <button className="text-muted-foreground hover:text-primary">
                <Info className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('deliveryInfo')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p><strong>Afhentning:</strong> Maskinen afhentes hos Timan i Holstebro. Ingen ekstra omkostning.</p>
                <p><strong>Fragt:</strong> Maskinen sendes med fragtmand. Fragtpris aftales separat.</p>
                <p><strong>Levering + opstart:</strong> Timan leverer maskinen og foretager opstart og instruktion på stedet.</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {deliveryMethods.map((dm) => {
            const isSelected = deliveryInfo.method === dm.value;
            const Icon = dm.icon;
            return (
              <button
                key={dm.value}
                onClick={() => onDeliveryChange({ method: dm.value })}
                className={`p-4 rounded-lg border text-left transition-all ${
                  isSelected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
              >
                <Icon className={`w-5 h-5 mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">{dm.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{dm.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Startup options for deliver */}
      {deliveryInfo.method === 'deliver' && (
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('startupOption')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['Standard opstart', 'Udvidet opstart (½ dag)'].map((opt) => (
              <button
                key={opt}
                onClick={() => onDeliveryChange({ startupOption: opt })}
                className={`p-3 rounded-lg border text-sm text-left transition-all ${
                  deliveryInfo.startupOption === opt
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>{t('previous')}</Button>
        <Button onClick={onNext}>{t('next')}</Button>
      </div>
    </div>
  );
}
