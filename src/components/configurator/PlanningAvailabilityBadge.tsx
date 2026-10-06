import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import type { PlanningAvailability } from '@/hooks/usePlanningAvailability';

const STATUS_KEY = {
  green: 'planningGreen',
  yellow: 'planningYellow',
  red: 'planningRed',
  unknown: 'planningUnknown',
} as const;
const STATUS_COLOR = {
  green: 'bg-emerald-600',
  yellow: 'bg-amber-500',
  red: 'bg-red-600',
  unknown: 'bg-slate-400',
} as const;

export function PlanningAvailabilityBadge({ availability, language }: {
  availability: PlanningAvailability | null | undefined;
  language: PortalUiLanguage;
}) {
  const status = availability?.status ?? 'unknown';
  return (
    <details className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-700">
      <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLOR[status]}`} aria-hidden="true" />
        <span>{t(STATUS_KEY[status], language)}</span>
      </summary>
      {availability && status !== 'unknown' && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 pb-1">
          <dt>{t('planningStock', language)}</dt><dd className="tabular-nums">{availability.free_stock_qty}</dd>
          <dt>{t('planningNextAvailable', language)}</dt><dd>{availability.next_incoming_date ?? '—'}</dd>
          <dt>{t('planningIncomingUnits', language)}</dt><dd className="tabular-nums">{availability.next_incoming_qty}</dd>
        </dl>
      )}
    </details>
  );
}
