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

const SYNC_TS = "2026-04-22T08:00:00Z";

const DEALERS: Dealer[] = [
  { id: "d-nordic", name: "Nordic Machinery Aps", city: "Aarhus", contact: "Lars Jensen", machineCount: 24, sharepointAccount: "100214", sourceSystem: "sharepoint", partnerType: "forhandler", country: "DK", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-jysk", name: "Jysk Maskincenter", city: "Aalborg", contact: "Mette Sørensen", machineCount: 18, sharepointAccount: "100318", sourceSystem: "sharepoint", partnerType: "servicepartner", country: "DK", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-syd", name: "Syd Entreprenør Service", city: "Kolding", contact: "Henrik Bach", machineCount: 11, sharepointAccount: "100422", sourceSystem: "sharepoint", partnerType: "forhandler", country: "DK", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-fyn", name: "Fyns Industri ApS", city: "Odense", contact: "Anne Holm", machineCount: 9, sharepointAccount: "100517", sourceSystem: "sharepoint", partnerType: "servicepartner", country: "DK", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-sjael", name: "Sjælland Maskiner A/S", city: "Roskilde", contact: "Peter Lund", machineCount: 15, sharepointAccount: "100621", sourceSystem: "sharepoint", partnerType: "forhandler", country: "DK", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-import-se", name: "Timan Import Sverige AB", city: "Malmö", contact: "Erik Lindqvist", machineCount: 0, sharepointAccount: "200118", sourceSystem: "sharepoint", partnerType: "importor", country: "SE", sourceActive: true, inactiveFromSource: false, lastSyncedAt: SYNC_TS },
  { id: "d-legacy-bornholm", name: "Bornholm Maskinservice", city: "Rønne", contact: "(historisk kontakt)", machineCount: 3, sharepointAccount: "099887", sourceSystem: "sharepoint", partnerType: "servicepartner", country: "DK", sourceActive: false, inactiveFromSource: true, lastSyncedAt: "2025-11-04T08:00:00Z" },
];

const MACHINES: MachineRef[] = [
  { serial: "TM-X40-18291", model: "X40 Pro", customer: "Bygge A/S", dealerId: "d-nordic" },
  { serial: "TM-X40-18432", model: "X40 Pro", customer: "Entreprenør H. Olsen", dealerId: "d-nordic" },
  { serial: "TM-X40-18501", model: "X40 Pro", customer: "Kommune Syd", dealerId: "d-nordic" },
  { serial: "TM-X40-18622", model: "X40 Standard", customer: "Grus & Sand Aps", dealerId: "d-nordic" },
  { serial: "TM-X40-18733", model: "X40 Standard", customer: "Landbrug Nord", dealerId: "d-nordic" },
  { serial: "TM-Z20-22001", model: "Z20", customer: "Jysk Beton", dealerId: "d-jysk" },
  { serial: "TM-Z20-22014", model: "Z20", customer: "Aalborg Havn", dealerId: "d-jysk" },
  { serial: "TM-Z20-22078", model: "Z20", customer: "Vendsyssel Entr.", dealerId: "d-jysk" },
  { serial: "TM-X40-19102", model: "X40 Pro", customer: "Kolding Asfalt", dealerId: "d-syd" },
  { serial: "TM-X40-19133", model: "X40 Standard", customer: "Trekantens Bygge", dealerId: "d-syd" },
  { serial: "TM-Z20-22210", model: "Z20", customer: "Fyns Vej & Park", dealerId: "d-fyn" },
  { serial: "TM-Z20-22245", model: "Z20", customer: "Odense Container", dealerId: "d-fyn" },
  { serial: "TM-X40-19401", model: "X40 Pro", customer: "Roskilde Bygge", dealerId: "d-sjael" },
  { serial: "TM-X40-19422", model: "X40 Standard", customer: "Sjælland Grus", dealerId: "d-sjael" },
];

const initialTsbs: Tsb[] = [
  {
    id: "TSB-2026-108",
    title: "Softwareopdatering — styreenhed v3.2",
    description: "Opdatering af styreenheden til v3.2 for at rette fejl i tomgangsregulering.",
    severity: 3, status: "aktiv", createdAt: "2026-03-01", activeFrom: "2026-03-12", deadline: "2026-05-14",
    documentName: "TSB-2026-108_v1.1_DA.pdf",
    dealers: [
      { dealerId: "d-nordic", status: "accepteret", acceptedAt: "2026-03-12", machineSerials: ["TM-X40-18291","TM-X40-18432","TM-X40-18501","TM-X40-18622","TM-X40-18733"] },
      { dealerId: "d-jysk", status: "accepteret", acceptedAt: "2026-03-14", machineSerials: ["TM-Z20-22001","TM-Z20-22014","TM-Z20-22078"] },
      { dealerId: "d-syd", status: "afventer", machineSerials: ["TM-X40-19102","TM-X40-19133"] },
      { dealerId: "d-fyn", status: "afventer", machineSerials: ["TM-Z20-22210","TM-Z20-22245"] },
    ],
  },
  {
    id: "TSB-2026-103",
    title: "Tjek af luftfilter — Z-serie",
    description: "Inspektion og evt. udskiftning af luftfilter på Z20.",
    severity: 4, status: "aktiv", createdAt: "2026-02-10", activeFrom: "2026-02-15", deadline: "2026-04-30",
    documentName: "TSB-2026-103_DA.pdf",
    dealers: [
      { dealerId: "d-jysk", status: "accepteret", acceptedAt: "2026-02-15", machineSerials: ["TM-Z20-22001","TM-Z20-22014"] },
      { dealerId: "d-fyn", status: "accepteret", acceptedAt: "2026-02-18", machineSerials: ["TM-Z20-22210","TM-Z20-22245"] },
    ],
  },
  {
    id: "TSB-2026-095",
    title: "Kontrol af bremsekreds",
    description: "Sikkerhedskontrol af bremsekreds på X40 Pro.",
    severity: 2, status: "aktiv", createdAt: "2026-01-20", activeFrom: "2026-02-01", deadline: "2026-04-10",
    documentName: "TSB-2026-095_DA.pdf",
    dealers: [
      { dealerId: "d-nordic", status: "accepteret", acceptedAt: "2026-02-01", machineSerials: ["TM-X40-18291","TM-X40-18432","TM-X40-18501"] },
      { dealerId: "d-sjael", status: "afventer", machineSerials: ["TM-X40-19401"] },
    ],
  },
  {
    id: "TSB-2026-112",
    title: "Udskiftning af hydraulikventil",
    description: "Udskiftning af defekt hydraulikventil — Severity 3.",
    severity: 3, status: "aktiv", createdAt: "2026-04-05", activeFrom: "2026-04-08", deadline: "2026-04-25",
    documentName: "TSB-2026-112_DA.pdf",
    dealers: [
      { dealerId: "d-nordic", status: "afventer", machineSerials: ["TM-X40-18622","TM-X40-18733"] },
      { dealerId: "d-syd", status: "afventer", machineSerials: ["TM-X40-19102","TM-X40-19133"] },
      { dealerId: "d-sjael", status: "afventer", machineSerials: ["TM-X40-19401","TM-X40-19422"] },
    ],
  },
];

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
