/**
 * In-memory warranty registration store (preview/demo).
 *
 * Migrated 1:1 from the old Timan TSB Hub. Seeded from `warranty-seed.json`
 * (legacy MS Form / Excel export). New registrations created via the form are
 * appended client-side. Replace with real backend later.
 */
import { useSyncExternalStore } from "react";
import seedRaw from "./warranty-seed.json";

export type MachineType =
  | "Timan 3330"
  | "RC-1000"
  | "RC-1000s"
  | "RC-751"
  | "Tool-Trac"
  | "Redskaber"
  | "Løs Redskab";

export const MACHINE_TYPES: MachineType[] = [
  "Timan 3330",
  "RC-1000",
  "RC-1000s",
  "RC-751",
  "Tool-Trac",
  "Redskaber",
  "Løs Redskab",
];

export type ReplacementBrand =
  | "Nej"
  | "Timan"
  | "Kärcher"
  | "Vitra"
  | "Egholm"
  | "Hako"
  | "Fort"
  | "Andet";

export const REPLACEMENT_BRANDS: ReplacementBrand[] = [
  "Nej",
  "Timan",
  "Kärcher",
  "Vitra",
  "Egholm",
  "Hako",
  "Fort",
  "Andet",
];

export type WarrantyStatus = "active" | "draft" | "archived";

export interface WarrantyRegistration {
  id: string;
  certificateNumber: string;
  source: "import" | "portal";
  createdAt: string;
  submittedAt: string;
  language: string | null;

  dealerName: string;
  isDemo: "Ja" | "Nej";
  machineSerial: string;
  machineType: string;
  replacementBrand: string | null;
  toolSerials: string[];
  deliveryDate: string;
  customer: string;
  customerAddress: string;
  postalCity: string;
  phone: string;
  confirmationEmail: string;
  comment: string | null;

  status: WarrantyStatus;
}

interface SeedRow {
  id: number | null;
  startTime: string | null;
  completionTime: string | null;
  language: string | null;
  dealerName: string | null;
  demo: string | null;
  serial: string | null;
  machine: string | null;
  replacement: string | null;
  tools: (string | null)[];
  deliveryDate: string | null;
  customer: string | null;
  customerAddress: string | null;
  postalCity: string | null;
  phone: string | null;
  confirmationEmail: string | null;
  comment: string | null;
}

function isoDateOnly(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function pad(n: number, w = 5): string {
  return String(n).padStart(w, "0");
}

function buildCertificateNumber(year: number, seq: number): string {
  return `WC-${year}-${pad(seq)}`;
}

function buildFromSeed(): WarrantyRegistration[] {
  const rows = seedRaw as SeedRow[];
  return rows
    .filter((r) => r.id != null)
    .map((r) => {
      const submitted = r.completionTime ?? r.startTime ?? new Date().toISOString();
      const year = new Date(submitted).getFullYear() || new Date().getFullYear();
      return {
        id: `seed-${r.id}`,
        certificateNumber: buildCertificateNumber(year, r.id ?? 0),
        source: "import" as const,
        createdAt: submitted,
        submittedAt: submitted,
        language: r.language,
        dealerName: r.dealerName ?? "Ukendt",
        isDemo: r.demo === "Ja" ? "Ja" : ("Nej" as "Ja" | "Nej"),
        machineSerial: r.serial ?? "",
        machineType: r.machine ?? "",
        replacementBrand: r.replacement,
        toolSerials: (r.tools ?? []).filter((t): t is string => Boolean(t)),
        deliveryDate: isoDateOnly(r.deliveryDate),
        customer: r.customer ?? "",
        customerAddress: r.customerAddress ?? "",
        postalCity: r.postalCity ?? "",
        phone: r.phone ?? "",
        confirmationEmail: r.confirmationEmail ?? "",
        comment: r.comment,
        status: "active" as WarrantyStatus,
      };
    });
}

let _records: WarrantyRegistration[] = buildFromSeed().sort((a, b) =>
  b.submittedAt.localeCompare(a.submittedAt),
);

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function getWarrantyRecords(): WarrantyRegistration[] {
  return _records;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useWarrantyRecords(): WarrantyRegistration[] {
  return useSyncExternalStore(subscribe, getWarrantyRecords, getWarrantyRecords);
}

export interface NewRegistrationInput {
  dealerName: string;
  isDemo: "Ja" | "Nej";
  machineSerial: string;
  machineType: string;
  replacementBrand: string | null;
  toolSerials: string[];
  deliveryDate: string;
  customer: string;
  customerAddress: string;
  postalCity: string;
  phone: string;
  confirmationEmail: string;
  comment?: string | null;
}

export function addRegistration(input: NewRegistrationInput): WarrantyRegistration {
  const now = new Date();
  const year = now.getFullYear();
  const nextSeq =
    _records.reduce((max, r) => {
      const m = r.certificateNumber.match(/WC-\d+-(\d+)/);
      const n = m ? Number(m[1]) : 0;
      return Math.max(max, n);
    }, 0) + 1;
  const record: WarrantyRegistration = {
    id: `wc-${now.getTime()}`,
    certificateNumber: buildCertificateNumber(year, nextSeq),
    source: "portal",
    createdAt: now.toISOString(),
    submittedAt: now.toISOString(),
    language: "Dansk",
    dealerName: input.dealerName,
    isDemo: input.isDemo,
    machineSerial: input.machineSerial,
    machineType: input.machineType,
    replacementBrand: input.replacementBrand,
    toolSerials: input.toolSerials.filter(Boolean),
    deliveryDate: input.deliveryDate,
    customer: input.customer,
    customerAddress: input.customerAddress,
    postalCity: input.postalCity,
    phone: input.phone,
    confirmationEmail: input.confirmationEmail,
    comment: input.comment ?? null,
    status: "active",
  };
  _records = [record, ..._records];
  emit();
  return record;
}

// ---------- Aggregations ----------

export function totalCount(records: WarrantyRegistration[]): number {
  return records.length;
}

export function thisMonthCount(records: WarrantyRegistration[]): number {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return records.filter((r) => r.submittedAt.slice(0, 7) === ym).length;
}

export function mostUsedMachineType(records: WarrantyRegistration[]): {
  type: string;
  count: number;
} {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (!r.machineType) continue;
    counts.set(r.machineType, (counts.get(r.machineType) ?? 0) + 1);
  }
  let top: [string, number] = ["—", 0];
  for (const e of counts) if (e[1] > top[1]) top = e;
  return { type: top[0], count: top[1] };
}

export function yearlyOverview(
  records: WarrantyRegistration[],
): { year: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of records) {
    const y = Number((r.submittedAt || r.createdAt).slice(0, 4));
    if (!y) continue;
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

export function dealerOverview(
  records: WarrantyRegistration[],
): { dealer: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.dealerName, (counts.get(r.dealerName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([dealer, count]) => ({ dealer, count }))
    .sort((a, b) => b.count - a.count);
}
