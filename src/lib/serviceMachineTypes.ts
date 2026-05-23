/**
 * Central list of supported machine types for the
 * "Service registrering og vedligehold" module.
 *
 * Keep this list as the single source of truth — do not hardcode
 * machine type strings elsewhere. The `basisKey` links a machine type
 * to the existing service-basis data used by the Driftberegner
 * ("Se grundlag" modal) so service intervals stay consistent.
 */

import {
  servicePartsData,
  type ServiceMachineKey,
  type ServiceStep,
  type ServicePartRow,
} from '@/lib/serviceBasisData';

export interface ServiceMachineType {
  /** Stored value (also used in filters and saved with the registration). */
  value: string;
  /** Human-readable label shown in dropdowns. */
  label: string;
  /** Optional link to the shared service-basis dataset. */
  basisKey?: ServiceMachineKey;
}

export const SERVICE_MACHINE_TYPES: ServiceMachineType[] = [
  { value: 'RC-1000',          label: 'RC-1000',          basisKey: 'rc1000' },
  { value: 'RC-751',           label: 'RC-751',           basisKey: 'rc751' },
  { value: 'Timan 3330',       label: 'Timan 3330',       basisKey: 'timan3330' },
  { value: 'Timan 2620',       label: 'Timan 2620' },
  { value: 'TC-750',           label: 'TC-750' },
  { value: 'Timan Tool-Trac',  label: 'Timan Tool-Trac' },
];

export function findServiceMachineType(value: string | null | undefined): ServiceMachineType | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  return SERVICE_MACHINE_TYPES.find((m) => m.value.toLowerCase() === v);
}

/**
 * Intervals (hours) for the given machine type, sourced from the shared
 * serviceBasisData when available. Returns an empty array when the type
 * has no service basis yet — callers should fall back to DB intervals or
 * show a "not configured" hint.
 */
export function getBasisIntervals(value: string | null | undefined): number[] {
  const m = findServiceMachineType(value);
  if (!m?.basisKey) return [];
  const svc = servicePartsData[m.basisKey];
  return svc ? [...svc.intervals].sort((a, b) => a - b) : [];
}
