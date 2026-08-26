/**
 * Machine registry store (preview/mock data).
 *
 * Prepares the data model for future SharePoint sync:
 *  - Machine source list (per-serial machine record).
 *  - Warranty registration list (per-serial form filled out by dealer/customer
 *    when the machine is delivered). This is the "Garantiregistrering" list.
 *
 * Until real sync is wired, MACHINE_DATA_SOURCE stays "mock" and the UI shows
 * an honest yellow banner. We never hard-delete: rows that vanish from the
 * source are flagged inactiveFromSource so historic TSB sager keep working.
 */
import { useSyncExternalStore } from "react";

export type MachineSourceSystem = "sharepoint" | "manual" | "warranty_registration";

export interface MachineRecord {
  id: string;
  serialNumber: string;
  model: string;
  country: string;
  dealerName: string;
  dealerAccount?: string;
  customerName: string;
  /** ISO date (yyyy-mm-dd) — if from warranty registration, this is the
   *  customer delivery date entered on the registration form. */
  deliveryDate?: string;
  /** Form / list item id from the SharePoint Garantiregistrering list. */
  warrantyRegistrationId?: string;
  sourceSystem: MachineSourceSystem;
  /** Currently present and active in the source. */
  sourceActive: boolean;
  /** Vanished from source — kept for history, shown with yellow warning. */
  inactiveFromSource: boolean;
  /** Last successful sync timestamp (ISO). Undefined for manual entries. */
  lastSyncedAt?: string;
  /** Free notes set by the admin. */
  notes?: string;
  /** When the row was first created in our system. */
  createdAt: string;
}

/** Linked warranty registration entry — separate "list" so we can show
 *  details even if the machine list itself is missing or duplicated. */
export interface WarrantyRegistration {
  id: string;
  serialNumber: string;
  customerName: string;
  dealerName?: string;
  deliveryDate: string;
  country: string;
}

export const MACHINE_DATA_SOURCE: "mock" | "sharepoint" = "mock";

/**
 * Placeholder for the future SharePoint / warranty registration sync job.
 * Real implementation will:
 *  1. Pull from SharePoint list "Garantiregistrering".
 *  2. Upsert by serialNumber + warrantyRegistrationId.
 *  3. Use deliveryDate from the warranty form as customer delivery date.
 *  4. Mark vanished rows as inactiveFromSource (never hard-delete).
 *  5. Flip MACHINE_DATA_SOURCE to "sharepoint".
 */
export async function syncMachinesFromSharePoint(): Promise<never> {
  throw new Error(
    "Machine SharePoint sync is not implemented yet. Current data is mock/preview.",
  );
}

// ---------------- Seed data ----------------

const WARRANTY_REGISTRATIONS: WarrantyRegistration[] = [];

const MACHINES_SEED: MachineRecord[] = [];

// ---------------- Pub/sub store ----------------

let machines: MachineRecord[] = MACHINES_SEED;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot() {
  return machines;
}

export function useMachines(): MachineRecord[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAllMachines(): MachineRecord[] {
  return machines;
}

export function getWarrantyRegistrationsForSerial(serial: string): WarrantyRegistration[] {
  return WARRANTY_REGISTRATIONS.filter(
    (w) => w.serialNumber.toLowerCase() === serial.toLowerCase(),
  );
}

export function addManualMachine(input: {
  serialNumber: string;
  model: string;
  dealerName: string;
  dealerAccount?: string;
  customerName: string;
  country: string;
  deliveryDate?: string;
  notes?: string;
}): MachineRecord {
  const record: MachineRecord = {
    id: `m-manual-${Date.now()}`,
    serialNumber: input.serialNumber.trim(),
    model: input.model.trim(),
    dealerName: input.dealerName.trim(),
    dealerAccount: input.dealerAccount?.trim() || undefined,
    customerName: input.customerName.trim(),
    country: input.country.trim().toUpperCase() || "DK",
    deliveryDate: input.deliveryDate || undefined,
    sourceSystem: "manual",
    sourceActive: true,
    inactiveFromSource: false,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  machines = [record, ...machines];
  emit();
  return record;
}

/** Group machines by serial — used to detect duplicates. */
export function getDuplicateSerials(list: MachineRecord[]): Set<string> {
  const counts = new Map<string, number>();
  for (const m of list) {
    const k = m.serialNumber.toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [k, n] of counts) {
    if (n > 1) dups.add(k);
  }
  return dups;
}

export { formatDateTime as formatSyncTs } from "./format-date";

export const SOURCE_SYSTEM_LABEL: Record<MachineSourceSystem, string> = {
  sharepoint: "SharePoint",
  warranty_registration: "Garantiregistrering",
  manual: "Manuel",
};
