/**
 * In-memory TSB store (preview/demo only).
 *
 * Copied 1:1 from the old Timan TSB Hub (preview-only mock store) so the
 * unified Timan Portal can render the same TSB experience while a real
 * backend is wired up. Replace with Supabase later.
 */
import { useSyncExternalStore } from "react";

export type Severity = 1 | 2 | 3 | 4;
export type TsbStatus = "kladde" | "aktiv" | "lukket";
export type DealerActivation = "afventer" | "accepteret" | "afvist";

/** Partner type from SharePoint A_B_KUNDE field */
export type PartnerType = "forhandler" | "servicepartner" | "importor";

/** Map raw SharePoint A_B_KUNDE numeric value to internal partner type */
export function mapPartnerType(raw: number | string | null | undefined): PartnerType {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (n === 2) return "servicepartner";
  if (n === 3) return "importor";
  return "forhandler";
}

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  forhandler: "Forhandler",
  servicepartner: "Servicepartner",
  importor: "Importør",
};

export type SourceSystem = "sharepoint" | "manual";

export interface Dealer {
  id: string;
  name: string;
  city: string;
  contact: string;
  machineCount: number;
  sharepointAccount?: string;
  sourceSystem: SourceSystem;
  partnerType: PartnerType;
  country: string;
  sourceActive: boolean;
  inactiveFromSource: boolean;
  lastSyncedAt?: string;
}

export interface MachineRef {
  serial: string;
  model: string;
  customer: string;
  dealerId: string;
}

export interface TsbDealerLink {
  dealerId: string;
  status: DealerActivation;
  acceptedAt?: string;
  machineSerials: string[];
}

export interface Tsb {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: TsbStatus;
  createdAt: string;
  activeFrom?: string;
  deadline: string;
  documentName?: string;
  dealers: TsbDealerLink[];
}

export const DEALER_DATA_SOURCE: "mock" | "sharepoint" = "mock";

const DEALERS: Dealer[] = [];

const MACHINES: MachineRef[] = [];

const initialTsbs: Tsb[] = [];

// ---------------- Pub/sub store ----------------

let tsbs: Tsb[] = initialTsbs;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getSnapshot() { return tsbs; }

export function useTsbs(): Tsb[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAllTsbs(): Tsb[] { return tsbs; }
export function getTsb(id: string): Tsb | undefined { return tsbs.find((t) => t.id === id); }
export function getDealers(): Dealer[] { return DEALERS; }
export function useDealers(): Dealer[] { return DEALERS; }
export function getDealer(id: string): Dealer | undefined { return DEALERS.find((d) => d.id === id); }
export function getMachines(): MachineRef[] { return MACHINES; }
export function getMachinesForDealer(dealerId: string): MachineRef[] {
  return MACHINES.filter((m) => m.dealerId === dealerId);
}

export function nextTsbId(): string {
  const year = new Date().getFullYear();
  const numericIds = tsbs
    .map((t) => t.id.match(/^TSB-(\d{4})-(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m && Number(m[1]) === year)
    .map((m) => Number(m[2]));
  const next = (numericIds.length ? Math.max(...numericIds) : 100) + 1;
  return `TSB-${year}-${String(next).padStart(3, "0")}`;
}

export function createTsb(input: Omit<Tsb, "id" | "createdAt" | "status"> & { status?: TsbStatus }): Tsb {
  const tsb: Tsb = {
    ...input,
    id: nextTsbId(),
    createdAt: new Date().toISOString().slice(0, 10),
    status: input.status ?? "kladde",
  };
  tsbs = [tsb, ...tsbs];
  emit();
  return tsb;
}

export function activateTsb(id: string) {
  tsbs = tsbs.map((t) =>
    t.id === id
      ? { ...t, status: "aktiv", activeFrom: t.activeFrom ?? new Date().toISOString().slice(0, 10) }
      : t,
  );
  emit();
}

// ---------------- Admin process status ----------------

export type ProcessStatus =
  | "ikke_paabegyndt"
  | "aktiv"
  | "dato_overskredet"
  | "afsluttet";

export const PROCESS_STATUS_LABEL: Record<ProcessStatus, string> = {
  ikke_paabegyndt: "Ikke påbegyndt",
  aktiv: "Aktiv",
  dato_overskredet: "Dato overskredet",
  afsluttet: "Afsluttet / lukket",
};

export const PROCESS_STATUS_OPTIONS: ProcessStatus[] = [
  "ikke_paabegyndt",
  "aktiv",
  "dato_overskredet",
  "afsluttet",
];

export function getProcessStatus(t: Tsb): ProcessStatus {
  if (t.status === "kladde") return "ikke_paabegyndt";
  if (t.status === "lukket") return "afsluttet";
  return daysUntil(t.deadline) < 0 ? "dato_overskredet" : "aktiv";
}

export function setTsbProcessStatus(id: string, next: ProcessStatus) {
  const today = new Date().toISOString().slice(0, 10);
  tsbs = tsbs.map((t) => {
    if (t.id !== id) return t;
    switch (next) {
      case "ikke_paabegyndt":
        return { ...t, status: "kladde" };
      case "aktiv":
        return { ...t, status: "aktiv", activeFrom: t.activeFrom ?? today };
      case "dato_overskredet": {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yIso = yesterday.toISOString().slice(0, 10);
        const deadline = daysUntil(t.deadline) < 0 ? t.deadline : yIso;
        return { ...t, status: "aktiv", activeFrom: t.activeFrom ?? today, deadline };
      }
      case "afsluttet":
        return { ...t, status: "lukket" };
    }
  });
  emit();
}

export function setDealerActivation(tsbId: string, dealerId: string, status: DealerActivation) {
  tsbs = tsbs.map((t) =>
    t.id === tsbId
      ? {
          ...t,
          dealers: t.dealers.map((d) =>
            d.dealerId === dealerId
              ? { ...d, status, acceptedAt: status === "accepteret" ? new Date().toISOString().slice(0, 10) : d.acceptedAt }
              : d,
          ),
        }
      : t,
  );
  emit();
}

// ---------------- Derived helpers ----------------

export function totalMachineCount(t: Tsb): number {
  return t.dealers.reduce((acc, d) => acc + d.machineSerials.length, 0);
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function deadlineLabel(iso: string): { label: string; tone?: "warning" | "danger" } {
  const days = daysUntil(iso);
  if (days < 0) return { label: `${Math.abs(days)} dage over`, tone: "danger" };
  if (days <= 7) return { label: `${days} dage`, tone: "warning" };
  return { label: `${days} dage` };
}

export { formatDate } from "./format-date";
