/**
 * Price list service (Phase 25). Backend/Admin only.
 *
 * - Master data: public.price_list_items
 * - Bulk import via SECURITY DEFINER RPC public.upsert_price_list_items
 * - Single-row edit via RPC public.update_price_list_item
 * - Audit log: public.price_list_import_logs
 *
 * The configurator does NOT read from this table yet. Quotes/orders are unchanged.
 * Empty CSV cells never overwrite existing values (handled server-side via COALESCE).
 * No DELETE anywhere.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export interface PriceListItem {
  id: string;
  item_number: string;
  renamed_from_item_number: string | null;
  item_text_da: string | null;
  price_dkk: number | null;
  price_eur: number | null;
  price_sek: number | null;
  cost_price_dkk: number | null;
  cost_price_source: string | null;
  cost_price_updated_at: string | null;
  updated_at: string;
  updated_by_email: string | null;
  is_dirty: boolean;
  last_published_at: string | null;
}

export interface PriceListImportLog {
  id: string;
  imported_by_email: string | null;
  imported_at: string;
  file_name: string | null;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
}

export const PRICE_FIELDS = ["item_text_da", "cost_price_dkk", "price_dkk", "price_sek", "price_eur"] as const;
export type PriceField = typeof PRICE_FIELDS[number];

export interface CsvPriceRow {
  item_number: string;
  item_text_da?: string;
  cost_price_dkk?: string;
  price_dkk?: string;
  price_eur?: string;
  price_sek?: string;
}

export type PreviewBucket = "create" | "update" | "skip" | "error";

export interface FieldChange {
  field: PriceField;
  oldValue: string | null;
  newValue: string;
}

export interface PreviewRow {
  rowIndex: number;
  bucket: PreviewBucket;
  item_number: string | null;
  raw: CsvPriceRow;
  existing: PriceListItem | null;
  changes: FieldChange[];
  errorMessage?: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { item_number: string | null; error: string }[];
}

/* ---------------- Reads ---------------- */

export async function listPriceItems(): Promise<PriceListItem[]> {
  const { data, error } = await supabase
    .from("price_list_items")
    .select("id, item_number, renamed_from_item_number, item_text_da, price_dkk, price_eur, price_sek, cost_price_dkk, cost_price_source, cost_price_updated_at, updated_at, updated_by_email, is_dirty, last_published_at")
    .order("item_number", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[priceListService] listPriceItems:", error);
    return [];
  }
  return (data ?? []) as PriceListItem[];
}

export async function listImportLogs(): Promise<PriceListImportLog[]> {
  const { data, error } = await supabase
    .from("price_list_import_logs")
    .select("id, imported_by_email, imported_at, file_name, created_count, updated_count, skipped_count, error_count")
    .order("imported_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as PriceListImportLog[];
}

/* ---------------- Manual edit ---------------- */

function describeError(e: unknown): string {
  if (!e) return "ukendt fejl";
  if (typeof e === "string") return e;
  const x = e as { message?: string; code?: string };
  if (x.code === "42501") return "Kun backend kan rette prislister.";
  if (x.code === "P0002") return "Varenr findes ikke.";
  return x.message || JSON.stringify(e);
}

export async function updatePriceItem(input: {
  item_number: string;
  new_item_number: string;
  item_text_da: string | null;
  price_dkk: number | null;
  price_eur: number | null;
  price_sek: number | null;
  cost_price_dkk: number | null;
}): Promise<{ ok: boolean; item?: PriceListItem; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("update_price_list_item", {
      p_item_number: input.item_number,
      p_new_item_number: input.new_item_number,
      p_item_text_da: input.item_text_da,
      p_price_dkk: input.price_dkk,
      p_price_eur: input.price_eur,
      p_price_sek: input.price_sek,
      p_cost_price_dkk: input.cost_price_dkk,
    });
    if (error) throw error;
    return { ok: true, item: data as PriceListItem };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/* ---------------- CSV parsing ---------------- */

const HEADER_ALIASES: Record<keyof CsvPriceRow, string[]> = {
  item_number: ["item_number", "Varenr.", "varenr", "varenummer", "item_no", "itemnumber"],
  item_text_da: ["item_text_da", "Varetekst (DA)", "varetekst_da", "varetekst", "text_da", "tekst"],
  cost_price_dkk: ["cost_price_dkk", "Kostpris DKK", "kostpris_dkk", "kostpris", "kost_dkk", "kost", "cost_dkk", "cost_price"],
  price_dkk: ["price_dkk", "Ny pris DKK", "pris_dkk", "ny_pris_dkk", "dkk"],
  price_eur: ["price_eur", "Ny pris EUR", "pris_eur", "ny_pris_eur", "eur"],
  price_sek: ["price_sek", "Ny pris SEK", "pris_sek", "ny_pris_sek", "sek"],
};

function normalizeKey(k: string) {
  return k
    .trim()
    .toLowerCase()
    .replace(/[–-]/g, " ")
    .replace(/[^0-9a-zæøå]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function pickField(row: Record<string, string>, field: keyof CsvPriceRow): string {
  return pickByAliases(row, HEADER_ALIASES[field]);
}

function pickByAliases(row: Record<string, string>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const k of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeKey(k))) {
      const v = (row[k] ?? "").trim();
      if (v !== "") return v;
    }
  }
  return "";
}

function isMassChangeSelected(value: string): boolean {
  return value.trim().toLowerCase() === "x";
}

function pickWorkbookCell(
  values: unknown[],
  headers: string[],
  aliases: string[],
  preferredIndexes: number[] = [],
): string {
  const normalizedAliases = aliases.map(normalizeKey);
  const readAt = (idx: number): string => {
    const value = values[idx];
    return value == null ? "" : String(value).trim();
  };

  for (const idx of preferredIndexes) {
    if (!normalizedAliases.includes(normalizeKey(headers[idx] ?? ""))) continue;
    const value = readAt(idx);
    if (value !== "") return value;
  }

  for (let idx = 0; idx < headers.length; idx++) {
    if (!normalizedAliases.includes(normalizeKey(headers[idx] ?? ""))) continue;
    const value = readAt(idx);
    if (value !== "") return value;
  }

  return "";
}

function pickWorkbookCellAt(
  values: unknown[],
  headers: string[],
  aliases: string[],
  indexes: number[],
): string {
  const normalizedAliases = aliases.map(normalizeKey);
  for (const idx of indexes) {
    if (!normalizedAliases.includes(normalizeKey(headers[idx] ?? ""))) continue;
    const value = values[idx];
    return value == null ? "" : String(value).trim();
  }
  return "";
}

function parseWorkbookPercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("%")) {
    const n = parsePrice(trimmed.slice(0, -1));
    return n == null ? null : n / 100;
  }
  return parsePrice(trimmed);
}

function formatWorkbookNumber(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "" : String(Math.round(value * 100) / 100);
}

export interface ParseResult {
  rows: CsvPriceRow[];
  parseErrors: string[];
}

export function parsePriceCsv(text: string): ParseResult {
  const stripped = text.replace(/^\uFEFF/, "");
  const out = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const parseErrors: string[] = (out.errors || []).map((e) => `Linje ${e.row}: ${e.message}`);
  const rows: CsvPriceRow[] = (out.data || []).map((r) => ({
    item_number: pickField(r, "item_number"),
    item_text_da: pickField(r, "item_text_da"),
    cost_price_dkk: pickField(r, "cost_price_dkk"),
    price_dkk: pickField(r, "price_dkk"),
    price_eur: pickField(r, "price_eur"),
    price_sek: pickField(r, "price_sek"),
  }));
  return { rows, parseErrors };
}

export function parsePriceWorkbook(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], parseErrors: ["Excel-filen har ingen ark."] };
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: "", blankrows: false });
  const itemNumberAliases = HEADER_ALIASES.item_number.map(normalizeKey);
  const headerIndex = rawRows.findIndex((row) =>
    row.some((cell) => itemNumberAliases.includes(normalizeKey(String(cell ?? "")))),
  );
  if (headerIndex < 0) {
    return { rows: [], parseErrors: ["Excel-filen mangler en kolonne med varenr."] };
  }

  const headers = rawRows[headerIndex].map((value) => String(value ?? "").trim());
  const data = rawRows.slice(headerIndex + 1);

  const readSetting = (labelPattern: RegExp): number | null => {
    for (const row of rawRows.slice(0, headerIndex)) {
      for (let idx = 0; idx < row.length; idx++) {
        const label = String(row[idx] ?? "");
        if (!labelPattern.test(label)) continue;
        const rawValue = String(row[idx + 1] ?? "");
        const parsed = parseWorkbookPercent(rawValue) ?? parsePrice(rawValue);
        if (parsed != null) return parsed;
      }
    }
    return null;
  };
  const sekRate = readSetting(/sek\s*kurs/i);
  const eurRate = readSetting(/eur\s*kurs/i);
  const massChangePct = readSetting(/masse/i) ?? 0;

  const rows: CsvPriceRow[] = data
    .map((values) => {
      const itemNumber = pickWorkbookCell(values, headers, HEADER_ALIASES.item_number, [1]);
      const currentDkk = parsePrice(pickWorkbookCell(values, headers, ["Nuværende pris DKK", "nuværende_pris_dkk", "current_price_dkk"], [4]));
      const manualDkk = parsePrice(pickWorkbookCellAt(values, headers, ["Ny pris DKK", "manuel_ny_pris_dkk", "manual_new_price_dkk"], [9]));
      const rowChangePct = parseWorkbookPercent(pickWorkbookCell(values, headers, ["Prisændring %", "prisændring_pct", "price_change_pct"], [10]));
      const massSelected = isMassChangeSelected(pickWorkbookCell(values, headers, ["Masseændring - skriv X", "Masseændring – skriv X", "masseændring_skriv_x", "masseaendring_skriv_x", "vælg_til_masseændring", "vaelg_til_masseaendring", "mass_change", "mass_change_selected"], [11]));
      const existingNewDkk = parsePrice(pickWorkbookCellAt(values, headers, ["Ny pris DKK", "ny_pris_dkk", "price_dkk", "pris_dkk", "dkk"], [12]));
      const calculatedDkk = manualDkk != null
        ? manualDkk
        : massSelected && massChangePct !== 0 && currentDkk != null
            ? currentDkk * (1 + massChangePct)
            : rowChangePct != null && rowChangePct !== 0 && currentDkk != null
              ? currentDkk * (1 + rowChangePct)
              : existingNewDkk != null && currentDkk != null && existingNewDkk !== currentDkk
                ? existingNewDkk
                : "";
      const calculatedSek = typeof calculatedDkk === "number" && sekRate != null && sekRate !== 0
        ? (calculatedDkk / sekRate) * 100
        : null;
      const calculatedEur = typeof calculatedDkk === "number" && eurRate != null && eurRate !== 0
        ? calculatedDkk / eurRate
        : null;
      return {
        item_number: itemNumber,
        item_text_da: pickWorkbookCell(values, headers, HEADER_ALIASES.item_text_da, [2]),
        cost_price_dkk: pickWorkbookCell(values, headers, HEADER_ALIASES.cost_price_dkk, [3]),
        price_dkk: formatWorkbookNumber(calculatedDkk),
        price_eur: formatWorkbookNumber(calculatedEur),
        price_sek: formatWorkbookNumber(calculatedSek),
      };
    })
    .filter((r) => {
      const itemNumber = r.item_number.trim();
      return itemNumber !== "" && !/\s/.test(itemNumber);
    });

  return { rows, parseErrors: [] };
}

/* ---------------- Preview ---------------- */

function parsePrice(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  // Accept "1.234,56" and "1234.56"
  const normalized = t.includes(",") && !t.includes(".")
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function existingValue(item: PriceListItem, field: PriceField): string | null {
  const v = item[field];
  return v == null ? null : String(v);
}

function rawValue(r: CsvPriceRow, field: PriceField): string {
  const raw = (r[field] ?? "").trim();
  if (!raw) return "";
  if (field === "item_text_da") return raw;
  const n = parsePrice(raw);
  return n == null ? "" : String(n);
}

export function buildPreview(rows: CsvPriceRow[], existing: PriceListItem[]): PreviewRow[] {
  const byKey = new Map<string, PriceListItem>();
  for (const x of existing) byKey.set(x.item_number.trim(), x);

  const seen = new Set<string>();
  const out: PreviewRow[] = [];

  rows.forEach((raw, idx) => {
    const rowIndex = idx + 1;
    const key = (raw.item_number || "").trim();

    if (!key) {
      out.push({
        rowIndex, bucket: "error", item_number: null,
        raw, existing: null, changes: [],
        errorMessage: "Mangler varenr.",
      });
      return;
    }
    if (seen.has(key)) {
      out.push({
        rowIndex, bucket: "error", item_number: key,
        raw, existing: byKey.get(key) ?? null, changes: [],
        errorMessage: "Duplikeret varenr i CSV-filen.",
      });
      return;
    }
    seen.add(key);

    // Validate numeric fields explicitly so user sees parse errors.
    for (const f of ["cost_price_dkk", "price_dkk", "price_sek", "price_eur"] as const) {
      const v = (raw[f] ?? "").trim();
      if (v && parsePrice(v) == null) {
        out.push({
          rowIndex, bucket: "error", item_number: key,
          raw, existing: byKey.get(key) ?? null, changes: [],
          errorMessage: `Ugyldig pris i ${f}: "${v}"`,
        });
        return;
      }
    }

    const existingRow = byKey.get(key) ?? null;
    if (!existingRow) {
      out.push({ rowIndex, bucket: "create", item_number: key, raw, existing: null, changes: [] });
      return;
    }

    const changes: FieldChange[] = [];
    for (const field of PRICE_FIELDS) {
      const newVal = rawValue(raw, field);
      if (!newVal) continue; // empty CSV cell -> never overwrites
      const oldVal = existingValue(existingRow, field);
      if ((oldVal ?? "") !== newVal) changes.push({ field, oldValue: oldVal, newValue: newVal });
    }

    out.push({
      rowIndex,
      bucket: changes.length > 0 ? "update" : "skip",
      item_number: key,
      raw, existing: existingRow, changes,
    });
  });

  return out;
}

/* ---------------- Run import ---------------- */

export async function runImport(
  preview: PreviewRow[],
  fileName: string | null,
): Promise<{ ok: boolean; summary?: ImportSummary; error?: string }> {
  const toSend = preview
    .filter((p) => p.bucket === "create" || p.bucket === "update")
    .map((p) => {
      const r = p.raw;
      const dkk = parsePrice(r.price_dkk);
      const eur = parsePrice(r.price_eur);
      const sek = parsePrice(r.price_sek);
      const costDkk = parsePrice(r.cost_price_dkk);
      return {
        item_number: p.item_number!,
        item_text_da: r.item_text_da?.trim() || "",
        cost_price_dkk: costDkk == null ? "" : String(costDkk),
        price_dkk: dkk == null ? "" : String(dkk),
        price_eur: eur == null ? "" : String(eur),
        price_sek: sek == null ? "" : String(sek),
      };
    });

  try {
    const { data, error } = await supabase.rpc("upsert_price_list_items", {
      payload: { rows: toSend, file_name: fileName },
    });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    const rpcSummary: ImportSummary = {
      created: Number(d.created ?? 0),
      updated: Number(d.updated ?? 0),
      skipped: Number(d.skipped ?? 0),
      errors: Array.isArray(d.errors) ? (d.errors as ImportSummary["errors"]) : [],
    };

    const csvErrors = preview.filter((p) => p.bucket === "error");
    const totalErrors = rpcSummary.errors.length + csvErrors.length;
    const totalSkipped = rpcSummary.skipped + preview.filter((p) => p.bucket === "skip").length;

    try {
      const { data: sess } = await supabase.auth.getUser();
      await supabase.from("price_list_import_logs").insert({
        imported_by: sess.user?.id ?? null,
        imported_by_email: sess.user?.email ?? null,
        file_name: fileName,
        created_count: rpcSummary.created,
        updated_count: rpcSummary.updated,
        skipped_count: totalSkipped,
        error_count: totalErrors,
        errors: [
          ...rpcSummary.errors,
          ...csvErrors.map((e) => ({ item_number: e.item_number, error: e.errorMessage || "csv error" })),
        ],
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.warn("[priceListService] log insert failed:", logErr);
    }

    return {
      ok: true,
      summary: {
        ...rpcSummary,
        skipped: totalSkipped,
        errors: [
          ...rpcSummary.errors,
          ...csvErrors.map((e) => ({ item_number: e.item_number, error: e.errorMessage || "csv error" })),
        ],
      },
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/* ---------------- Export ---------------- */

export function exportCsv(items: PriceListItem[]): string {
  const rows = items.map((i) => ({
    varenr: i.item_number,
    varetekst_da: i.item_text_da ?? "",
    kostpris_dkk: i.cost_price_dkk ?? "",
    pris_dkk: i.price_dkk ?? "",
    pris_sek: i.price_sek ?? "",
    pris_eur: i.price_eur ?? "",
  }));
  return Papa.unparse(rows, { quotes: true });
}
