import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PlanningAvailabilityStatus = 'green' | 'yellow' | 'red' | 'unknown';

export interface PlanningAvailability {
  status: PlanningAvailabilityStatus;
  source_state: 'fresh' | 'stale' | 'missing';
  item_number: string;
  requested_date: string;
  stock: number;
  incoming: number;
  free_by_date: number;
  soft_by_date: number;
  next_available: string | null;
}

export interface PlanningAvailabilityItem {
  itemNumber: string;
  quantity: number;
}

export function usePlanningAvailability(
  enabled: boolean, items: PlanningAvailabilityItem[], requestedDate: string | null,
): Record<string, PlanningAvailability> {
  const itemKey = JSON.stringify(items);
  const [availability, setAvailability] = useState<Record<string, PlanningAvailability>>({});
  const normalizedItems = useMemo(() => JSON.parse(itemKey) as PlanningAvailabilityItem[], [itemKey]);

  useEffect(() => {
    if (!enabled || normalizedItems.length === 0) {
      setAvailability({});
      return;
    }
    let cancelled = false;
    Promise.all(normalizedItems.map(async (item) => {
      const { data, error } = await supabase.rpc('planning_get_availability', {
        p_item_number: item.itemNumber,
        p_requested_date: requestedDate || null,
        p_quantity: Math.max(1, item.quantity),
      });
      return [item.itemNumber, error ? null : data as unknown as PlanningAvailability] as const;
    })).then((results) => {
      if (cancelled) return;
      setAvailability(Object.fromEntries(results.filter((result) => result[1])) as Record<string, PlanningAvailability>);
    }).catch(() => { if (!cancelled) setAvailability({}); });
    return () => { cancelled = true; };
  }, [enabled, normalizedItems, requestedDate]);

  return availability;
}

export function worstPlanningStatus(statuses: PlanningAvailabilityStatus[]): PlanningAvailabilityStatus {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}
