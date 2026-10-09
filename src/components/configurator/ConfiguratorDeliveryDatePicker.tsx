import { useState } from 'react';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  isDeliveryDateDisabled,
  isDeliveryDiscountEligible,
  isWeekendDeliveryDate,
} from '@/lib/configuratorDelivery';

interface ConfiguratorDeliveryDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  placeholder: string;
  ariaLabel: string;
  discountLegend: string;
  weekendError: string;
  canSelectPastDate?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function ConfiguratorDeliveryDatePicker({
  value,
  onChange,
  locale,
  placeholder,
  ariaLabel,
  discountLegend,
  weekendError,
  canSelectPastDate = false,
  disabled = false,
  triggerClassName,
  align = 'center',
}: ConfiguratorDeliveryDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(`${value}T12:00:00`) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 pointer-events-none select-none">
            {selectedDate ? format(selectedDate, 'dd-MM-yyyy', { locale }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align={align}>
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate ?? new Date()}
          locale={locale}
          onSelect={(date) => {
            if (!date) return;
            if (isWeekendDeliveryDate(date)) {
              toast.error(weekendError);
              return;
            }
            if (isDeliveryDateDisabled(date, canSelectPastDate)) return;
            onChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
          disabled={(date) => isDeliveryDateDisabled(date, canSelectPastDate)}
          modifiers={{
            discount: (date) => !isWeekendDeliveryDate(date) && isDeliveryDiscountEligible(format(date, 'yyyy-MM-dd')),
          }}
          modifiersClassNames={{ discount: 'delivery-discount-date' }}
          modifiersStyles={{
            discount: {
              backgroundColor: 'hsl(45 93% 80%)',
              borderRadius: '6px',
            },
          }}
          initialFocus
          className="p-3 pointer-events-auto"
        />
        <div className="flex items-center gap-2 px-3 pb-3 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'hsl(45 93% 80%)' }} />
          {discountLegend}
        </div>
      </PopoverContent>
    </Popover>
  );
}
