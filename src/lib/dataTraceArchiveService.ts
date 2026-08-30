import { supabase } from "@/lib/supabase";

export const DATA_TRACE_LOOKUP_TYPES = [
  { value: "quote", label: "Tilbudsnummer" },
  { value: "order", label: "Ordrenummer" },
  { value: "lead", label: "Leadnummer / lead-id" },
  { value: "demo", label: "Demonstrationsnummer / id" },
  { value: "warranty", label: "Garantiregistreringsnummer" },
  { value: "tsb", label: "TSB-nummer" },
  { value: "serial", label: "Serienummer" },
  { value: "dealer", label: "Forhandlernummer" },
] as const;

export type DataTraceLookupType = typeof DATA_TRACE_LOOKUP_TYPES[number]["value"];

export interface DataTraceTableCount {
  table: string;
  table_name?: string;
  count: number;
}

export interface DataTraceKeepItem {
  type: string;
  label: string;
}

export interface DataTraceDeletePreview {
  supported: boolean;
  reason?: string;
  rootLookupType: DataTraceLookupType;
  rootIdentifier: string;
  confirmationText?: string;
  willRemove?: DataTraceTableCount[];
  willKeep?: DataTraceKeepItem[];
  recordCount?: number;
}

export interface DataTraceDeleteResult {
  deletionNumber: string;
  recordCount: number;
  message: string;
}

export interface DataTraceRestorePreview {
  deletionNumber: string;
  status: "deleted" | "restored" | "restore_blocked";
  deletedAt: string;
  rootLookupType: DataTraceLookupType;
  rootIdentifier: string;
  recordCount: number;
  tables: DataTraceTableCount[];
  confirmationText: string;
}

export interface DataTraceRestoreResult {
  deletionNumber: string;
  recordCount: number;
  message: string;
  status?: "restored" | "restore_blocked";
}

export function normalizeDeletionNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function expectedDeleteConfirmation(identifier: string): string {
  return `SLET ${identifier.trim()}`;
}

export function expectedRestoreConfirmation(deletionNumber: string): string {
  return `GENDAN ${normalizeDeletionNumber(deletionNumber)}`;
}

export function displayTraceTableName(row: DataTraceTableCount): string {
  return row.table || row.table_name || "Ukendt tabel";
}

export async function previewDataTraceDeletion(
  lookupType: DataTraceLookupType,
  identifier: string,
): Promise<DataTraceDeletePreview> {
  const { data, error } = await (supabase as any).rpc("preview_data_trace_deletion", {
    p_lookup_type: lookupType,
    p_identifier: identifier.trim(),
  });
  if (error) throw new Error(error.message || "Kunne ikke hente preview.");
  return data as DataTraceDeletePreview;
}

export async function executeDataTraceDeletion(
  lookupType: DataTraceLookupType,
  identifier: string,
  reason: string,
  confirmation: string,
): Promise<DataTraceDeleteResult> {
  const { data, error } = await (supabase as any).rpc("execute_data_trace_deletion", {
    p_lookup_type: lookupType,
    p_identifier: identifier.trim(),
    p_reason: reason.trim(),
    p_confirmation: confirmation.trim(),
  });
  if (error) throw new Error(error.message || "Sletning kunne ikke gennemføres.");
  return data as DataTraceDeleteResult;
}

export async function previewDataTraceRestore(deletionNumber: string): Promise<DataTraceRestorePreview> {
  const { data, error } = await (supabase as any).rpc("preview_data_trace_restore", {
    p_deletion_number: normalizeDeletionNumber(deletionNumber),
  });
  if (error) throw new Error(error.message || "Kunne ikke hente gendannelses-preview.");
  return data as DataTraceRestorePreview;
}

export async function executeDataTraceRestore(
  deletionNumber: string,
  confirmation: string,
): Promise<DataTraceRestoreResult> {
  const { data, error } = await (supabase as any).rpc("execute_data_trace_restore", {
    p_deletion_number: normalizeDeletionNumber(deletionNumber),
    p_confirmation: confirmation.trim(),
  });
  if (error) throw new Error(error.message || "Gendannelse kunne ikke gennemføres.");
  return data as DataTraceRestoreResult;
}
