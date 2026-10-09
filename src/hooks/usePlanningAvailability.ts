import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PlanningAvailabilityStatus = 'green' | 'yellow' | 'red' | 'unknown';

export interface PlanningAvailability {
  status: PlanningAvailabilityStatus;
  sku: string;
  free_stock_qty: number;
  next_incoming_date: string | null;
  next_incoming_qty: number;
}

interface PlanningAvailabilityResponse {
  sku: string;
  free_stock_qty: number;
  next_incoming_date: string | null;
  next_incoming_qty: number;
  availability_status: PlanningAvailabilityStatus;
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
      const { data, error } = await supabase.rpc('planning_get_configurator_availability', {
        p_sku: item.itemNumber,
        p_requested_date: requestedDate || null,
        p_quantity: Math.max(1, item.quantity),
      });
      if (error || !data) return [item.itemNumber, null] as const;
      const response = data as unknown as PlanningAvailabilityResponse;
      return [item.itemNumber, {
        status: response.availability_status,
        sku: response.sku,
        free_stock_qty: response.free_stock_qty,
        next_incoming_date: response.next_incoming_date,
        next_incoming_qty: response.next_incoming_qty,
      } satisfies PlanningAvailability] as const;
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
