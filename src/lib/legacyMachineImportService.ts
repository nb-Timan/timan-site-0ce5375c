import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { serialKey } from "@/lib/machineJournalService";

export type LegacyMachineImportRow = {
  warrantyNumber: string | null;
  serial: string | null;
  model: string | null;
  dealerNumber: string | null;
  dealerName: string | null;
  deliveryDate: string | null;
  hours: string | null;
  latestActivityAt: string | null;
  history: string | null;
};

export type LegacyMachinePreviewRow = LegacyMachineImportRow & {
  rowNumber: number;
  serialKey: string;
  status: "matched" | "mapped" | "unresolved" | "duplicate" | "error";
  statusLabel: string;
};

export type LegacyMachinePreviewContext = {
  existingSerials: Iterable<string>;
  activeDealerNumbers: Iterable<string>;
  mappedDealerNumbers: Iterable<string>;
};

const HEADER_MAP: Record<string, keyof LegacyMachineImportRow> = {
  "garanti nr.": "warrantyNumber", "serienr.": "serial", model: "model",
  "forhandler nr.": "dealerNumber", forhandler: "dealerName",
  leveringsdato: "deliveryDate", timer: "hours", "seneste aktivitet": "latestActivityAt", historik: "history",
};

function clean(value: unknown): string | null {
  const output = String(value ?? "").trim();
  return output || null;
}

function excelDateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  if (!text) return null;
  const danish = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  return danish ? `${danish[3]}-${danish[2]}-${danish[1]}` : text;
}

export async function parseLegacyMachineWorkbook(file: File): Promise<LegacyMachineImportRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Filen indeholder ikke et ark.");
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  const headers = (values[0] ?? []).map((value) => clean(value)?.toLowerCase() ?? "");
  const columns = new Map<number, keyof LegacyMachineImportRow>();
  headers.forEach((header, index) => { if (HEADER_MAP[header]) columns.set(index, HEADER_MAP[header]); });
  if (!Array.from(columns.values()).includes("serial") || !Array.from(columns.values()).includes("dealerNumber")) {
    throw new Error("Filen skal mindst indeholde Serienr. og Forhandler nr.");
  }
  return values.slice(1).filter((row) => row.some((value) => clean(value))).map((row) => {
    const record: LegacyMachineImportRow = { warrantyNumber: null, serial: null, model: null, dealerNumber: null, dealerName: null, deliveryDate: null, hours: null, latestActivityAt: null, history: null };
    columns.forEach((key, index) => {
      const value = row[index];
      record[key] = key === "deliveryDate" || key === "latestActivityAt" ? excelDateToIso(value) : clean(value);
    });
    return record;
  });
}

export async function previewLegacyMachineImport(rows: LegacyMachineImportRow[]): Promise<LegacyMachinePreviewRow[]> {
  const dealerNumbers = [...new Set(rows.map((row) => row.dealerNumber).filter((value): value is string => Boolean(value)))];
  const [{ data: existing, error: existingError }, { data: dealers, error: dealerError }, { data: mappings, error: mappingError }] = await Promise.all([
    // The canonical serial can contain display separators, so equality is
    // checked with the same strict serial key as the registry after reading.
    supabase.from("warranty_registrations").select("machine_serial_number").limit(5000),
    supabase.from("dealer_accounts").select("account_number, company_name").in("account_number", dealerNumbers).eq("status", "active").eq("is_active", true).eq("is_deleted", false).eq("is_blocked", false),
    supabase.from("legacy_machine_dealer_mappings").select("source_dealer_number, active_dealer_account_number").in("source_dealer_number", dealerNumbers),
  ]);
  if (existingError || dealerError || mappingError) throw existingError ?? dealerError ?? mappingError;
  return classifyLegacyMachineRows(rows, {
    existingSerials: (existing ?? []).map((row) => serialKey(row.machine_serial_number)),
    activeDealerNumbers: (dealers ?? []).map((row) => row.account_number),
    mappedDealerNumbers: (mappings ?? []).map((row) => row.source_dealer_number),
  });
}

export function classifyLegacyMachineRows(rows: LegacyMachineImportRow[], context: LegacyMachinePreviewContext): LegacyMachinePreviewRow[] {
  const existingSerials = new Set(context.existingSerials);
  const activeDealers = new Set(context.activeDealerNumbers);
  const dealerMappings = new Set(context.mappedDealerNumbers);
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const key = serialKey(row.serial);
    if (!key || seen.has(key)) return { ...row, rowNumber: index + 2, serialKey: key, status: "error", statusLabel: !key ? "Mangler serienr." : "Dublet i fil" };
    seen.add(key);
    if (!row.dealerNumber) return { ...row, rowNumber: index + 2, serialKey: key, status: "error", statusLabel: "Mangler forhandler nr." };
    if (existingSerials.has(key)) return { ...row, rowNumber: index + 2, serialKey: key, status: "duplicate", statusLabel: "Maskine findes allerede" };
    if (activeDealers.has(row.dealerNumber ?? "")) return { ...row, rowNumber: index + 2, serialKey: key, status: "matched", statusLabel: "Forhandler fundet" };
    if (dealerMappings.has(row.dealerNumber ?? "")) return { ...row, rowNumber: index + 2, serialKey: key, status: "mapped", statusLabel: "Matchet via historisk mapping" };
    return { ...row, rowNumber: index + 2, serialKey: key, status: "unresolved", statusLabel: "Forhandler skal afklares" };
  });
}

export async function importLegacyMachines(fileName: string, rows: LegacyMachineImportRow[]) {
  const { data, error } = await supabase.rpc("import_legacy_machines", { p_file_name: fileName, p_rows: rows });
  if (error) throw error;
  return data as { batchId: string; total: number; created: number; matched: number; unresolved: number; duplicates: number; errors: number };
}
