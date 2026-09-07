import type { MachineOverviewRow } from "@/lib/machineJournalService";

export type WarrantyTypeFilter = "all" | "normal" | "historical";
export type MachineSortKey = "warrantyId" | "serial" | "model" | "dealer" | "delivery" | "hours" | "activity" | "order" | "customer" | "status" | "lifecycle";
export type MachineSortDirection = "asc" | "desc";

export type MachineOverviewFilters = {
  query?: string;
  dealerQuery?: string;
  model?: string;
  warrantyType?: WarrantyTypeFilter;
  dateFrom?: string;
  dateTo?: string;
  health?: MachineOverviewRow["health"] | "all";
};

const compareText = (left: string | null | undefined, right: string | null | undefined) =>
  (left ?? "").localeCompare(right ?? "", "da", { sensitivity: "base", numeric: true });

function compareNullable(left: number | null, right: number | null, direction: MachineSortDirection) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return direction === "asc" ? left - right : right - left;
}

export function filterMachineOverview(rows: MachineOverviewRow[], filters: MachineOverviewFilters): MachineOverviewRow[] {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const dealer = filters.dealerQuery?.trim().toLowerCase() ?? "";
  const model = filters.model && filters.model !== "all" ? filters.model.trim().toLowerCase() : "";
  return rows.filter((row) => {
    if (filters.health && filters.health !== "all" && row.health !== filters.health) return false;
    if (filters.warrantyType && filters.warrantyType !== "all" && row.warrantyType !== filters.warrantyType) return false;
    if (query && !row.serial.toLowerCase().includes(query) && !(row.warrantyId ?? "").toLowerCase().includes(query)) return false;
    if (dealer && !(row.dealerName ?? "").toLowerCase().includes(dealer) && !(row.dealerNumber ?? "").toLowerCase().includes(dealer)) return false;
    if (model && (row.machineModel ?? "").trim().toLowerCase() !== model) return false;
    if (filters.dateFrom || filters.dateTo) {
      const date = row.deliveryDate?.slice(0, 10);
      if (!date || (filters.dateFrom && date < filters.dateFrom) || (filters.dateTo && date > filters.dateTo)) return false;
    }
    return true;
  });
}

export function sortMachineOverview(rows: MachineOverviewRow[], key: MachineSortKey | null, direction: MachineSortDirection = "desc"): MachineOverviewRow[] {
  const copy = [...rows];
  if (!key) return copy;
  const multiplier = direction === "asc" ? 1 : -1;
  return copy.sort((a, b) => {
    let result = 0;
    if (key === "warrantyId") result = compareText(a.warrantyId, b.warrantyId);
    if (key === "serial") result = compareText(a.serial, b.serial);
    if (key === "model") result = compareText(a.machineModel, b.machineModel);
    if (key === "dealer") result = compareText(a.dealerName, b.dealerName);
    if (key === "delivery") result = compareNullable(a.deliveryDate ? new Date(a.deliveryDate).getTime() : null, b.deliveryDate ? new Date(b.deliveryDate).getTime() : null, direction);
    if (key === "hours") result = compareNullable(a.operatingHours, b.operatingHours, direction);
    if (key === "activity") result = compareNullable(a.latestActivityDate ? new Date(a.latestActivityDate).getTime() : null, b.latestActivityDate ? new Date(b.latestActivityDate).getTime() : null, direction);
    if (key === "delivery" || key === "hours" || key === "activity") return result || compareText(a.serial, b.serial);
    return (result * multiplier) || compareText(a.serial, b.serial);
  });
}
