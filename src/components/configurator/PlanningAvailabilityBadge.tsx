import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import type { PlanningAvailability } from '@/hooks/usePlanningAvailability';

const DATE_LOCALE: Record<PortalUiLanguage, string> = {
  da: 'da-DK',
  en: 'en-GB',
  de: 'de-DE',
  it: 'it-IT',
  hu: 'hu-HU',
  sv: 'sv-SE',
  fr: 'fr-FR',
  pl: 'pl-PL',
  cs: 'cs-CZ',
};

function formatPlanningAvailabilityDate(value: string, language: PortalUiLanguage): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;

  const formatter = new Intl.DateTimeFormat(DATE_LOCALE[language], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (language !== 'da') return formatter.format(date);

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}-${parts.month}-${parts.year}`;
}

export function PlanningAvailabilityBadge({ availability, language }: {
  availability: PlanningAvailability | null | undefined;
  language: PortalUiLanguage;
}) {
  const unknownValue = t('planningValueUnknown', language);
  const stockValue = availability && availability.status !== 'unknown'
    ? `${availability.free_stock_qty} ${t('planningUnitShort', language)}`
    : unknownValue;
  const nextDeliveryValue = availability?.next_incoming_date
    ? formatPlanningAvailabilityDate(availability.next_incoming_date, language)
    : unknownValue;

  return (
    <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-700">
      <dt>{t('planningStockStatus', language)}:</dt>
      <dd className="text-right font-medium tabular-nums">{stockValue}</dd>
      <dt>{t('planningNextDelivery', language)}:</dt>
      <dd className="text-right font-medium tabular-nums">{nextDeliveryValue}</dd>
    </dl>
  );
}
