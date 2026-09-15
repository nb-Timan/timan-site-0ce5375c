import { fetchMachineRegistryPage, type RegistryMachineRow } from "@/lib/machineRegistryPageService";
import { serialKey } from "@/lib/machineJournalService";

export interface PortalWarrantyMachineOption {
  serial: string;
  normalizedSerial: string;
  machineModel: string | null;
  machineOrderNumber: string | null;
  isDemo: boolean;
}

/** A dealer can register an MO/unregistered machine, never a machine with an approved SP. */
export function isPortalWarrantyEligibleMachine(row: RegistryMachineRow): boolean {
  return Boolean(row.serial?.trim()) && !row.warrantyId;
}

export function toPortalWarrantyMachineOption(row: RegistryMachineRow): PortalWarrantyMachineOption {
  return {
    serial: row.serial.trim(),
    normalizedSerial: serialKey(row.serial),
    machineModel: row.machineModel ?? null,
    machineOrderNumber: row.machineOrderNumber ?? null,
    isDemo: Boolean(row.isDemo),
  };
}

export function resolvePortalWarrantyMachine(
  serial: string,
  options: PortalWarrantyMachineOption[],
): PortalWarrantyMachineOption | null {
  const normalizedSerial = serialKey(serial);
  return normalizedSerial
    ? options.find((option) => option.normalizedSerial === normalizedSerial) ?? null
    : null;
}

/** Reads the existing scoped registry; the supplied account only narrows server-side access. */
export async function fetchPortalWarrantyEligibleMachines(
  dealerAccountNumber: string | null | undefined,
): Promise<PortalWarrantyMachineOption[]> {
  const dealer = dealerAccountNumber?.trim();
  if (!dealer) return [];
  const page = await fetchMachineRegistryPage({
    allowedDealers: [dealer],
    query: "",
    dealer,
    model: "all",
    warrantyType: "all",
    health: "all",
    warrantyMatch: "all",
    demoOnly: false,
    dateFrom: "",
    dateTo: "",
    sort: "serial",
    direction: "asc",
    page: 1,
    pageSize: 2000,
  });
  return page.rows
    .filter(isPortalWarrantyEligibleMachine)
    .map(toPortalWarrantyMachineOption);
}
