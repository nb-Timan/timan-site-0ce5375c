import { fetchMachineRegistryPage, type RegistryMachineRow } from "@/lib/machineRegistryPageService";
import { serialKey } from "@/lib/machineJournalService";

export interface PortalWarrantyMachineOption {
  serial: string;
  normalizedSerial: string;
  machineModel: string | null;
  machineOrderNumber: string | null;
  isDemo: boolean;
}

export const MAX_PORTAL_WARRANTY_SERIAL_SUGGESTIONS = 50;

function normalizedMachineType(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The warranty form has one RC-1000s selection while the existing registry
 * contains both RC-1000 and RC-1000s source labels. They are one warranty
 * family; all other types use their canonical normalized model label.
 */
function machineTypeFamily(value: string | null | undefined): string {
  const normalized = normalizedMachineType(value);
  return normalized === "rc1000" || normalized === "rc1000s" ? "rc1000" : normalized;
}

const SERIAL_PREFIX_FALLBACKS: Record<string, readonly string[]> = {
  rc751: ["410040"],
  rc1000: ["411000"],
};

export function portalWarrantyMachineMatchesType(
  option: PortalWarrantyMachineOption,
  machineType: string | null | undefined,
): boolean {
  const selectedFamily = machineTypeFamily(machineType);
  if (!selectedFamily) return true;
  if (option.machineModel?.trim()) {
    return machineTypeFamily(option.machineModel) === selectedFamily;
  }

  // The registry model is canonical. Only legacy rows without one use the
  // narrow, product-number-based serial fallback.
  return SERIAL_PREFIX_FALLBACKS[selectedFamily]?.some((prefix) =>
    option.normalizedSerial.startsWith(prefix),
  ) ?? false;
}

/** Search only the dealer-scoped canonical options after applying the model filter. */
export function filterPortalWarrantyMachines(
  options: PortalWarrantyMachineOption[],
  machineType: string | null | undefined,
  query: string | null | undefined,
): PortalWarrantyMachineOption[] {
  const normalizedQuery = (query ?? "").trim().toLowerCase();
  return options.filter((option) => {
    if (!portalWarrantyMachineMatchesType(option, machineType)) return false;
    if (!normalizedQuery) return true;
    return [
      option.serial,
      option.normalizedSerial,
      option.machineModel,
      option.machineOrderNumber,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery));
  }).slice(0, MAX_PORTAL_WARRANTY_SERIAL_SUGGESTIONS);
}

/** A dealer can register an MO/unregistered machine, never a machine with an approved SP. */
export function isPortalWarrantyEligibleMachine(row: RegistryMachineRow): boolean {
  return Boolean(row.serial?.trim()) && !row.warrantyId;
}

export function toPortalWarrantyMachineOption(row: RegistryMachineRow): PortalWarrantyMachineOption {
  return {
    serial: row.serial.trim(),
    normalizedSerial: serialKey(row.serial),
    machineModel: row.machineModel ?? row.machineType ?? null,
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
