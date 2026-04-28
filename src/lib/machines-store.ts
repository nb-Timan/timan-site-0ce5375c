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

const SYNC_TS = "2026-04-22T08:00:00Z";

const WARRANTY_REGISTRATIONS: WarrantyRegistration[] = [
  {
    id: "WR-2025-0421",
    serialNumber: "TM-X40-18291",
    customerName: "Bygge A/S",
    dealerName: "Nordic Machinery Aps",
    deliveryDate: "2025-06-14",
    country: "DK",
  },
  {
    id: "WR-2025-0488",
    serialNumber: "TM-X40-18432",
    customerName: "Entreprenør H. Olsen",
    dealerName: "Nordic Machinery Aps",
    deliveryDate: "2025-07-02",
    country: "DK",
  },
  {
    id: "WR-2025-0512",
    serialNumber: "TM-Z20-22001",
    customerName: "Jysk Beton",
    dealerName: "Jysk Maskincenter",
    deliveryDate: "2025-08-19",
    country: "DK",
  },
  {
    id: "WR-2025-0577",
    serialNumber: "TM-Z20-22014",
    customerName: "Aalborg Havn",
    dealerName: "Jysk Maskincenter",
    deliveryDate: "2025-09-05",
    country: "DK",
  },
  // Duplicate warranty registration for the same serial — older registration
  // that was later re-registered. Used to demo duplicate handling.
  {
    id: "WR-2024-0991",
    serialNumber: "TM-X40-18291",
    customerName: "Bygge A/S (oprindelig)",
    dealerName: "Nordic Machinery Aps",
    deliveryDate: "2024-11-03",
    country: "DK",
  },
];

const MACHINES_SEED: MachineRecord[] = [
  {
    id: "m-001",
    serialNumber: "TM-X40-18291",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Nordic Machinery Aps",
    dealerAccount: "100214",
    customerName: "Bygge A/S",
    deliveryDate: "2025-06-14",
    warrantyRegistrationId: "WR-2025-0421",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-06-14",
  },
  // Duplicate serial — same machine appears twice (e.g. once from warranty
  // registration and once manually entered). Should be flagged yellow.
  {
    id: "m-001b",
    serialNumber: "TM-X40-18291",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Nordic Machinery Aps",
    dealerAccount: "100214",
    customerName: "Bygge A/S",
    deliveryDate: "2024-11-03",
    warrantyRegistrationId: "WR-2024-0991",
    sourceSystem: "manual",
    sourceActive: true,
    inactiveFromSource: false,
    notes: "Tidligere registrering — sandsynlig dublet.",
    createdAt: "2024-11-03",
  },
  {
    id: "m-002",
    serialNumber: "TM-X40-18432",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Nordic Machinery Aps",
    dealerAccount: "100214",
    customerName: "Entreprenør H. Olsen",
    deliveryDate: "2025-07-02",
    warrantyRegistrationId: "WR-2025-0488",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-07-02",
  },
  {
    id: "m-003",
    serialNumber: "TM-X40-18501",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Nordic Machinery Aps",
    dealerAccount: "100214",
    customerName: "Kommune Syd",
    deliveryDate: "2025-08-11",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-08-11",
  },
  {
    id: "m-004",
    serialNumber: "TM-Z20-22001",
    model: "Z20",
    country: "DK",
    dealerName: "Jysk Maskincenter",
    dealerAccount: "100318",
    customerName: "Jysk Beton",
    deliveryDate: "2025-08-19",
    warrantyRegistrationId: "WR-2025-0512",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-08-19",
  },
  {
    id: "m-005",
    serialNumber: "TM-Z20-22014",
    model: "Z20",
    country: "DK",
    dealerName: "Jysk Maskincenter",
    dealerAccount: "100318",
    customerName: "Aalborg Havn",
    deliveryDate: "2025-09-05",
    warrantyRegistrationId: "WR-2025-0577",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-09-05",
  },
  {
    id: "m-006",
    serialNumber: "TM-X40-19102",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Syd Entreprenør Service",
    dealerAccount: "100422",
    customerName: "Kolding Asfalt",
    deliveryDate: "2025-10-12",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-10-12",
  },
  {
    id: "m-007",
    serialNumber: "TM-Z20-22210",
    model: "Z20",
    country: "DK",
    dealerName: "Fyns Industri ApS",
    dealerAccount: "100517",
    customerName: "Fyns Vej & Park",
    deliveryDate: "2025-11-20",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-11-20",
  },
  {
    id: "m-008",
    serialNumber: "TM-X40-19401",
    model: "X40 Pro",
    country: "DK",
    dealerName: "Sjælland Maskiner A/S",
    dealerAccount: "100621",
    customerName: "Roskilde Bygge",
    deliveryDate: "2025-12-03",
    sourceSystem: "warranty_registration",
    sourceActive: true,
    inactiveFromSource: false,
    lastSyncedAt: SYNC_TS,
    createdAt: "2025-12-03",
  },
  // Historical machine — dealer no longer in source but we keep the record.
  {
    id: "m-009-legacy",
    serialNumber: "TM-X20-09120",
    model: "X20",
    country: "DK",
    dealerName: "Bornholm Maskinservice",
    dealerAccount: "099887",
    customerName: "Rønne Entreprenør",
    deliveryDate: "2022-04-11",
    sourceSystem: "warranty_registration",
    sourceActive: false,
    inactiveFromSource: true,
    lastSyncedAt: "2025-11-04T08:00:00Z",
    notes: "Forhandler ikke længere i SharePoint — bevaret for historik.",
    createdAt: "2022-04-11",
  },
];

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
