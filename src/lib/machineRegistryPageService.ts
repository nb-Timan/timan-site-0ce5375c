import { supabase } from "@/lib/supabase";
import type { MachineOverviewRow } from "@/lib/machineJournalService";
import type { MachineSortDirection, MachineSortKey, WarrantyTypeFilter } from "@/lib/machineOverviewFilters";
import type { WarrantyMatchStatus } from "@/lib/warrantyMatchStatus";

type HealthFilter = "all" | "healthy" | "needs_attention" | "critical";
export type RegistryMachineRow = Omit<MachineOverviewRow, "sources" | "warrantyIdNumeric" | "latestActivityLabel"> & {
  customerName?: string | null;
  machineOrderNumber?: string | null;
  erpOrderNumber?: string | null;
  portalOrderNumber?: string | null;
  invoiceNumber?: string | null;
  revenue?: number | null;
  costAmount?: number | null;
  contributionMarginAmount?: number | null;
  grossSalesPrice?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  isDemo?: boolean;
};
type RegistryResponse = {
  total: number; scopeTotal: number; normal: number; historical: number;
  healthy: number; needsAttention: number; critical: number; rows: RegistryMachineRow[];
  approved: number; needsClarification: number; missingWarrantyAndDealer: number;
};

export type MachineRegistryPage = Omit<RegistryResponse, "rows"> & { rows: RegistryMachineRow[] };

type RegistryCorrectionRow = {
  normalized_serial: string;
  dealer_account_id: string | null;
  approved_warranty_registration_id: string | null;
  machine_model: string | null;
  delivery_date: string | null;
};

async function applyInternalCorrections(rows: RegistryMachineRow[]): Promise<RegistryMachineRow[]> {
  const legacySerials = rows.filter((row) => row.warrantyType === "historical").map((row) => row.normalizedSerial);
  if (legacySerials.length === 0) return rows;
  const { data, error } = await supabase
    .from("machine_registry_corrections")
    .select("normalized_serial, dealer_account_id, approved_warranty_registration_id, machine_model, delivery_date")
    .in("normalized_serial", legacySerials);
  // Corrections are deliberately not visible to external users. The source
  // registry row remains the safe read fallback when this scoped read is denied.
  if (error || !data?.length) return rows;
  const corrections = new Map((data as RegistryCorrectionRow[]).map((row) => [row.normalized_serial, row]));
  const dealerIds = Array.from(new Set((data as RegistryCorrectionRow[]).map((row) => row.dealer_account_id).filter((id): id is string => !!id)));
  const dealerById = new Map<string, { company_name: string | null; account_number: string | null }>();
  if (dealerIds.length > 0) {
    const dealerResult = await supabase
      .from("dealer_accounts")
      .select("id, company_name, account_number")
      .in("id", dealerIds);
    for (const dealer of dealerResult.data ?? []) {
      dealerById.set(dealer.id, dealer);
    }
  }
  return rows.map((row) => {
    const correction = corrections.get(row.normalizedSerial);
    if (!correction || row.warrantyType !== "historical") return row;
    const dealer = correction.dealer_account_id ? dealerById.get(correction.dealer_account_id) : null;
    const hasDealer = !!(dealer?.company_name ?? row.dealerName);
    const approved = !!correction.approved_warranty_registration_id && hasDealer;
    return {
      ...row,
      machineModel: correction.machine_model ?? row.machineModel,
      deliveryDate: correction.delivery_date ?? row.deliveryDate,
      dealerName: dealer?.company_name ?? row.dealerName,
      dealerNumber: dealer?.account_number ?? row.dealerNumber,
      warrantyId: correction.approved_warranty_registration_id ? "Godkendt garanti koblet" : row.warrantyId,
      warrantyMatchStatus: approved ? "approved" : row.warrantyMatchStatus,
      warrantyMatchDetail: approved ? "approved" : row.warrantyMatchDetail,
    };
  });
}

export async function fetchMachineRegistryPage(input: {
  allowedDealers: string[] | null;
  query: string; dealer: string; model: string; warrantyType: WarrantyTypeFilter; health: HealthFilter;
  warrantyMatch: WarrantyMatchStatus | "all";
  demoOnly?: boolean;
  dateFrom: string; dateTo: string; sort: MachineSortKey | null; direction: MachineSortDirection;
  page: number; pageSize: number;
}): Promise<MachineRegistryPage> {
  const { data, error } = await supabase.rpc("machine_registry_page_scoped", {
    p_allowed_dealers: input.allowedDealers, p_query: input.query || null, p_dealer: input.dealer || null,
    p_model: input.model === "all" ? null : input.model, p_warranty_type: input.warrantyType,
    p_health: input.health, p_warranty_match: input.warrantyMatch,
    p_demo_only: input.demoOnly ?? false,
    p_date_from: input.dateFrom || null, p_date_to: input.dateTo || null,
    p_sort: input.sort ?? "activity", p_direction: input.direction, p_limit: input.pageSize,
    p_offset: Math.max(0, input.page - 1) * input.pageSize,
  });
  if (error) throw error;
  const result = data as RegistryResponse;
  const rows = (result.rows ?? []).map((row) => ({
    ...row, sources: ["warranty"] as MachineOverviewRow["sources"], warrantyIdNumeric: null,
    latestActivityLabel: row.latestActivityDate ? `${row.latestActivityDate.slice(0, 10)} · Garantiregistrering` : null,
  }));
  return {
    total: Number(result.total ?? 0), scopeTotal: Number(result.scopeTotal ?? 0),
    normal: Number(result.normal ?? 0), historical: Number(result.historical ?? 0),
    healthy: Number(result.healthy ?? 0), needsAttention: Number(result.needsAttention ?? 0), critical: Number(result.critical ?? 0),
    approved: Number(result.approved ?? 0), needsClarification: Number(result.needsClarification ?? 0),
    missingWarrantyAndDealer: Number(result.missingWarrantyAndDealer ?? 0),
    rows: await applyInternalCorrections(rows),
  };
}
