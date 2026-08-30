import type { DealerAccount } from "@/lib/dealerAccountsService";
import { supabase } from "@/lib/supabase";
import { fetchWarrantyRegistrations, type DbWarrantyRegistration } from "@/lib/warrantyRegistrationsService";
import { normalizeSerial, serialKey, type JournalScope } from "@/lib/machineJournalService";

export type DealerMachineLifecycleKind =
  | "normal"
  | "active_demo"
  | "ready_for_sale"
  | "sold_early"
  | "sold_registered"
  | "demo_missing_delivery";

export interface DealerMachineRegisterRow {
  serial: string;
  normalizedSerial: string;
  machineModel: string | null;
  machineType: string | null;
  orderNumber: string | null;
  orderDate: string | null;
  deliveryDate: string | null;
  dealerName: string | null;
  dealerNumber: string | null;
  customerName: string | null;
  machineKind: "demo" | "normal";
  warrantyCertificate: string | null;
  warrantyRegistrationDate: string | null;
  lifecycle: DealerMachineLifecycleKind;
  demoSaleEligibleAt: string | null;
  daysRemaining: number | null;
  daysSoldEarly: number | null;
  sources: Array<"machines" | "warranty_registrations">;
}

interface MachineRow {
  serial_number: string | null;
  machine_number: string | null;
  machine_type: string | null;
  model: string | null;
  dealer_account_id?: string | null;
  dealer_number: string | null;
  dealer_name: string | null;
  customer_name: string | null;
  warranty_start_date: string | null;
  updated_at: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function addCalendarMonths(isoDate: string | null | undefined, months: number): string | null {
  const d = dateOnly(isoDate);
  if (!d) return null;
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const maxDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, maxDay));
  return toIsoDate(next);
}

function diffDays(aIso: string | null | undefined, bIso: string | null | undefined): number | null {
  const a = dateOnly(aIso);
  const b = dateOnly(bIso);
  if (!a || !b) return null;
  return Math.ceil((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function getDemoLifecycle(input: {
  isDemo: boolean;
  deliveryDate: string | null;
  warrantyRegistrationDate: string | null;
  today?: string;
}): Pick<DealerMachineRegisterRow, "lifecycle" | "demoSaleEligibleAt" | "daysRemaining" | "daysSoldEarly"> {
  if (!input.isDemo) {
    return { lifecycle: "normal", demoSaleEligibleAt: null, daysRemaining: null, daysSoldEarly: null };
  }

  const eligibleAt = addCalendarMonths(input.deliveryDate, 9);
  if (!eligibleAt) {
    return { lifecycle: "demo_missing_delivery", demoSaleEligibleAt: null, daysRemaining: null, daysSoldEarly: null };
  }

  if (input.warrantyRegistrationDate) {
    const earlyBy = diffDays(eligibleAt, input.warrantyRegistrationDate);
    if (earlyBy != null && earlyBy > 0) {
      return { lifecycle: "sold_early", demoSaleEligibleAt: eligibleAt, daysRemaining: null, daysSoldEarly: earlyBy };
    }
    return { lifecycle: "sold_registered", demoSaleEligibleAt: eligibleAt, daysRemaining: null, daysSoldEarly: null };
  }

  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const remaining = diffDays(eligibleAt, today);
  if (remaining != null && remaining > 0) {
    return { lifecycle: "active_demo", demoSaleEligibleAt: eligibleAt, daysRemaining: remaining, daysSoldEarly: null };
  }
  return { lifecycle: "ready_for_sale", demoSaleEligibleAt: eligibleAt, daysRemaining: null, daysSoldEarly: null };
}

function norm(v: string | null | undefined): string {
  return (v ?? "").toString().trim().toLowerCase();
}

function matchesDealer(dealer: DealerAccount, record: { dealerAccountId?: string | null; dealerNumber?: string | null; dealerName?: string | null }): boolean {
  if (dealer.id && record.dealerAccountId && dealer.id === record.dealerAccountId) return true;
  if (norm(dealer.account_number) && norm(dealer.account_number) === norm(record.dealerNumber)) return true;
  if (norm(dealer.company_name) && norm(dealer.company_name) === norm(record.dealerName)) return true;
  return false;
}

function updateFromWarranty(row: DealerMachineRegisterRow, warranty: DbWarrantyRegistration) {
  row.machineModel ||= warranty.machineType || null;
  row.machineType ||= warranty.machineType || null;
  row.deliveryDate ||= warranty.deliveryDate || null;
  row.dealerName = warranty.dealerOfficialName || warranty.dealerName || warranty.dealerNameSnapshot || row.dealerName;
  row.dealerNumber = warranty.dealerAccountNumber || row.dealerNumber;
  row.customerName ||= warranty.customer || null;
  row.warrantyCertificate ||= warranty.certificateNumber || null;
  row.warrantyRegistrationDate ||= warranty.registrationDate || warranty.submittedAt || null;
  if (warranty.isDemo === "Ja") row.machineKind = "demo";
  if (!row.sources.includes("warranty_registrations")) row.sources.push("warranty_registrations");
}

export function reconcileDealerMachineRows(input: {
  dealer: DealerAccount;
  machines?: MachineRow[];
  warranties?: DbWarrantyRegistration[];
  today?: string;
}): DealerMachineRegisterRow[] {
  const map = new Map<string, DealerMachineRegisterRow>();

  const touch = (serial: string | null | undefined): DealerMachineRegisterRow | null => {
    const display = (serial ?? "").trim();
    const key = serialKey(display);
    if (!display || !key) return null;
    let row = map.get(key);
    if (!row) {
      row = {
        serial: display,
        normalizedSerial: normalizeSerial(display),
        machineModel: null,
        machineType: null,
        orderNumber: null,
        orderDate: null,
        deliveryDate: null,
        dealerName: input.dealer.company_name ?? null,
        dealerNumber: input.dealer.account_number ?? null,
        customerName: null,
        machineKind: "normal",
        warrantyCertificate: null,
        warrantyRegistrationDate: null,
        lifecycle: "normal",
        demoSaleEligibleAt: null,
        daysRemaining: null,
        daysSoldEarly: null,
        sources: [],
      };
      map.set(key, row);
    }
    return row;
  };

  for (const m of input.machines ?? []) {
    if (!matchesDealer(input.dealer, { dealerAccountId: m.dealer_account_id, dealerNumber: m.dealer_number, dealerName: m.dealer_name })) continue;
    const row = touch(m.serial_number || m.machine_number);
    if (!row) continue;
    row.machineModel ||= m.model || m.machine_type || null;
    row.machineType ||= m.machine_type || null;
    row.deliveryDate ||= m.warranty_start_date || null;
    row.dealerName ||= m.dealer_name || null;
    row.dealerNumber ||= m.dealer_number || null;
    row.customerName ||= m.customer_name || null;
    if (!row.sources.includes("machines")) row.sources.push("machines");
  }

  for (const w of input.warranties ?? []) {
    if (!matchesDealer(input.dealer, { dealerAccountId: w.dealerAccountId, dealerNumber: w.dealerAccountNumber, dealerName: w.dealerOfficialName || w.dealerName || w.dealerNameSnapshot })) continue;
    const row = touch(w.machineSerial);
    if (!row) continue;
    updateFromWarranty(row, w);
  }

  const out = Array.from(map.values()).map((row) => {
    const lifecycle = getDemoLifecycle({
      isDemo: row.machineKind === "demo",
      deliveryDate: row.deliveryDate,
      warrantyRegistrationDate: row.warrantyRegistrationDate,
      today: input.today,
    });
    return { ...row, ...lifecycle };
  });

  out.sort((a, b) => {
    const aw = a.warrantyRegistrationDate ? new Date(a.warrantyRegistrationDate).getTime() : 0;
    const bw = b.warrantyRegistrationDate ? new Date(b.warrantyRegistrationDate).getTime() : 0;
    if (bw !== aw) return bw - aw;
    return a.normalizedSerial.localeCompare(b.normalizedSerial);
  });
  return out;
}

export function getDemoOverviewMachines(rows: DealerMachineRegisterRow[]): DealerMachineRegisterRow[] {
  return rows.filter((row) => (
    row.lifecycle === "active_demo"
    || row.lifecycle === "ready_for_sale"
    || row.lifecycle === "sold_early"
    || row.lifecycle === "demo_missing_delivery"
  ));
}

function scopeAllowsDealer(scope: JournalScope, dealer: DealerAccount): boolean {
  if (scope.unrestricted) return true;
  const account = norm(dealer.account_number);
  const name = norm(dealer.company_name);
  return (!!account && scope.dealerNumbers.has(account)) || (!!name && scope.dealerNames.has(name));
}

export async function listDealerMachineRegister(dealer: DealerAccount, scope: JournalScope): Promise<DealerMachineRegisterRow[]> {
  if (!scopeAllowsDealer(scope, dealer)) return [];

  const [machineRes, warranties] = await Promise.all([
    supabase
      .from("machines")
      .select("serial_number, machine_number, machine_type, model, dealer_account_id, dealer_number, dealer_name, customer_name, warranty_start_date, updated_at")
      .limit(2000),
    fetchWarrantyRegistrations(),
  ]);

  const machines = (machineRes.data ?? []) as MachineRow[];
  return reconcileDealerMachineRows({ dealer, machines, warranties });
}
