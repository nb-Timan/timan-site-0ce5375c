import type { ConfiguratorState } from '@/types/configurator';

export interface OrderPurchaseReferenceSummary {
  values: string[];
  headerValue: string | null;
  hasMultiple: boolean;
}

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function machineNumber(key: string): number | null {
  const match = /^machine_(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

/**
 * Machine requisitions are the canonical PO source when present. The former
 * order-wide field remains a fallback for snapshots created before individual
 * machine references were available.
 */
export function orderPurchaseReferences(state: Pick<ConfiguratorState, 'reqNumbers' | 'purchaseOrderNumber'>): string[] {
  const machineReferences = Object.entries(state.reqNumbers ?? {})
    .map(([key, value]) => ({ number: machineNumber(key), value: normalize(value) }))
    .filter((entry): entry is { number: number; value: string } => entry.number !== null && entry.value !== null)
    .sort((a, b) => a.number - b.number)
    .map((entry) => entry.value);

  const source = machineReferences.length > 0
    ? machineReferences
    : [normalize(state.purchaseOrderNumber)].filter((value): value is string => value !== null);

  return Array.from(new Set(source));
}

export function orderPurchaseReferenceSummary(
  state: Pick<ConfiguratorState, 'reqNumbers' | 'purchaseOrderNumber'>,
): OrderPurchaseReferenceSummary {
  const values = orderPurchaseReferences(state);
  return {
    values,
    headerValue: values.length === 0 ? null : values.length === 1 ? values[0] : `Flere (${values.length})`,
    hasMultiple: values.length > 1,
  };
}

export function machinePurchaseReference(
  state: Pick<ConfiguratorState, 'reqNumbers' | 'purchaseOrderNumber'>,
  machineUnitNumber: number,
): string | null {
  return normalize(state.reqNumbers?.[`machine_${machineUnitNumber}`]);
}
