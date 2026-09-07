import { supabase } from "@/lib/supabase";
import type { MachineOverviewRow } from "@/lib/machineJournalService";
import type { MachineSortDirection, MachineSortKey, WarrantyTypeFilter } from "@/lib/machineOverviewFilters";

type HealthFilter = "all" | "healthy" | "needs_attention" | "critical";
type RegistryRow = Omit<MachineOverviewRow, "sources" | "warrantyIdNumeric" | "latestActivityLabel">;
type RegistryResponse = {
  total: number; scopeTotal: number; normal: number; historical: number;
  healthy: number; needsAttention: number; critical: number; rows: RegistryRow[];
};

export type MachineRegistryPage = Omit<RegistryResponse, "rows"> & { rows: MachineOverviewRow[] };

export async function fetchMachineRegistryPage(input: {
  allowedDealers: string[] | null;
  query: string; dealer: string; model: string; warrantyType: WarrantyTypeFilter; health: HealthFilter;
  dateFrom: string; dateTo: string; sort: MachineSortKey | null; direction: MachineSortDirection;
  page: number; pageSize: number;
}): Promise<MachineRegistryPage> {
  const { data, error } = await supabase.rpc("machine_registry_page_scoped", {
    p_allowed_dealers: input.allowedDealers, p_query: input.query || null, p_dealer: input.dealer || null,
    p_model: input.model === "all" ? null : input.model, p_warranty_type: input.warrantyType,
    p_health: input.health, p_date_from: input.dateFrom || null, p_date_to: input.dateTo || null,
    p_sort: input.sort ?? "activity", p_direction: input.direction, p_limit: input.pageSize,
    p_offset: Math.max(0, input.page - 1) * input.pageSize,
  });
  if (error) throw error;
  const result = data as RegistryResponse;
  return {
    total: Number(result.total ?? 0), scopeTotal: Number(result.scopeTotal ?? 0),
    normal: Number(result.normal ?? 0), historical: Number(result.historical ?? 0),
    healthy: Number(result.healthy ?? 0), needsAttention: Number(result.needsAttention ?? 0), critical: Number(result.critical ?? 0),
    rows: (result.rows ?? []).map((row) => ({
      ...row, sources: ["warranty"] as MachineOverviewRow["sources"], warrantyIdNumeric: null,
      latestActivityLabel: row.latestActivityDate ? `${row.latestActivityDate.slice(0, 10)} · Garantiregistrering` : null,
    })),
  };
}
