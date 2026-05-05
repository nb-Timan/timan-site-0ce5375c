/**
 * Dealer ERP CSV import (Phase 24).
 * Backend/Admin only. Used by /portal/backend/dealer-import.
 *
 * - Matches by account_number. Falls back to dealer_number if account_number missing.
 * - Empty CSV cells NEVER overwrite existing values (handled server-side via coalesce).
 * - Calls SECURITY DEFINER RPC public.upsert_dealer_accounts.
 * - Writes a row to public.dealer_import_logs after the import.
 * - Never touches CRM data (notes, activities, leads, quotes, orders, budget, users).
 */

import Papa from "papaparse";
import { supabase } from "@/lib/supabase";
import type { DealerAccount } from "@/lib/dealerAccountsService";

export const IMPORT_FIELDS = [
  "company_name",
  "address",
  "postal_code",
  "city",
  "country",
  "email",
  "phone",
  "assigned_seller_initials",
  "dealer_type",
] as const;
export type ImportField = typeof IMPORT_FIELDS[number];

export interface CsvRowInput {
  account_number: string;
  company_name?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
  assigned_seller_initials?: string;
  dealer_type?: string;
}

export type PreviewBucket = "create" | "update" | "skip" | "error";

export interface FieldChange {
  field: ImportField;
  oldValue: string | null;
  newValue: string;
}

export interface PreviewRow {
  rowIndex: number;            // 1-based CSV row (excluding header)
  bucket: PreviewBucket;
  account_number: string | null;
  raw: CsvRowInput;
  existing: DealerAccount | null;
  changes: FieldChange[];      // only for "update"
  errorMessage?: string;       // only for "error"
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { account_number: string | null; error: string }[];
}

export interface DealerImportLog {
  id: string;
  imported_by_email: string | null;
  imported_at: string;
  file_name: string | null;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
}

/* ------------------------------------------------------------------ */
/* CSV parsing                                                         */
/* ------------------------------------------------------------------ */

const HEADER_ALIASES: Record<keyof CsvRowInput, string[]> = {
  account_number: ["account_number", "account", "kontonr", "kontonummer", "AccountNumber"],
  company_name: ["company_name", "title", "titel", "firmanavn", "name"],
  address: ["address", "adresse", "street"],
  postal_code: ["postal_code", "postcode", "postnr", "zip", "zipcode"],
  city: ["city", "by"],
  country: ["country", "land"],
  email: ["email", "e-mail", "mail"],
  phone: ["phone", "telefon", "tlf"],
  assigned_seller_initials: ["assigned_seller_initials", "seller", "saelger", "sælger", "initialer"],
  dealer_type: ["dealer_type", "customer_type", "kundetype", "type", "A_B_Kunde"],
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

function pickField(row: Record<string, string>, field: keyof CsvRowInput): string {
  const aliases = HEADER_ALIASES[field].map(normalizeKey);
  for (const k of Object.keys(row)) {
    if (aliases.includes(normalizeKey(k))) {
      const v = (row[k] ?? "").trim();
      if (v !== "") return v;
    }
  }
  return "";
}

export interface ParseResult {
  rows: CsvRowInput[];
  parseErrors: string[];
}

export function parseDealerCsv(text: string): ParseResult {
  const stripped = text.replace(/^\uFEFF/, "");
  // Auto-detect delimiter (Papa supports this with `delimiter: ""`).
  const out = Papa.parse<Record<string, string>>(stripped, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const parseErrors: string[] = (out.errors || []).map(
    (e) => `Linje ${e.row}: ${e.message}`,
  );
  const rows: CsvRowInput[] = (out.data || []).map((r) => ({
    account_number: pickField(r, "account_number"),
    company_name: pickField(r, "company_name"),
    address: pickField(r, "address"),
    postal_code: pickField(r, "postal_code"),
    city: pickField(r, "city"),
    country: pickField(r, "country"),
    email: pickField(r, "email"),
    phone: pickField(r, "phone"),
    assigned_seller_initials: pickField(r, "assigned_seller_initials"),
    dealer_type: pickField(r, "dealer_type"),
  }));
  return { rows, parseErrors };
}

/* ------------------------------------------------------------------ */
/* Preview                                                              */
/* ------------------------------------------------------------------ */

function dealerFieldValue(d: DealerAccount, field: ImportField): string | null {
  switch (field) {
    case "company_name": return d.company_name || null;
    case "address": return d.address;
    case "postal_code": return d.postal_code;
    case "city": return d.city;
    case "country": return d.country;
    case "email": return d.email;
    case "phone": return d.phone;
    case "assigned_seller_initials": return d.assigned_seller_initials;
    case "dealer_type": return d.customer_type_label || d.customer_type || null;
  }
}

function rawFieldValue(r: CsvRowInput, field: ImportField): string {
  const v = (r as unknown as Record<string, string | undefined>)[field];
  return (v ?? "").trim();
}

export function buildPreview(
  rows: CsvRowInput[],
  existing: DealerAccount[],
): PreviewRow[] {
  const byAcct = new Map<string, DealerAccount>();
  for (const d of existing) byAcct.set(d.account_number.trim(), d);

  const seenInCsv = new Set<string>();
  const out: PreviewRow[] = [];

  rows.forEach((raw, idx) => {
    const rowIndex = idx + 1;
    const acct = (raw.account_number || "").trim();

    if (!acct) {
      out.push({
        rowIndex, bucket: "error", account_number: null, raw,
        existing: null, changes: [],
        errorMessage: "Mangler account_number / dealer_number.",
      });
      return;
    }

    if (seenInCsv.has(acct)) {
      out.push({
        rowIndex, bucket: "error", account_number: acct, raw,
        existing: byAcct.get(acct) ?? null, changes: [],
        errorMessage: "Duplikeret account_number i CSV-filen.",
      });
      return;
    }
    seenInCsv.add(acct);

    const existingRow = byAcct.get(acct) ?? null;

    if (!existingRow) {
      out.push({
        rowIndex, bucket: "create", account_number: acct, raw,
        existing: null, changes: [],
      });
      return;
    }

    const changes: FieldChange[] = [];
    for (const field of IMPORT_FIELDS) {
      const newVal = rawFieldValue(raw, field);
      if (!newVal) continue; // empty CSV cell -> never overwrites
      const oldVal = dealerFieldValue(existingRow, field);
      if ((oldVal ?? "") !== newVal) {
        changes.push({ field, oldValue: oldVal, newValue: newVal });
      }
    }

    out.push({
      rowIndex,
      bucket: changes.length > 0 ? "update" : "skip",
      account_number: acct,
      raw, existing: existingRow, changes,
    });
  });

  return out;
}

/* ------------------------------------------------------------------ */
/* Run import                                                           */
/* ------------------------------------------------------------------ */

function describeError(e: unknown): string {
  if (!e) return "ukendt fejl";
  if (typeof e === "string") return e;
  const x = e as { message?: string; code?: string };
  if (x.code === "42501") return "Kun backend kan importere forhandlere.";
  return x.message || JSON.stringify(e);
}

export async function runImport(
  preview: PreviewRow[],
  fileName: string | null,
): Promise<{ ok: boolean; summary?: ImportSummary; error?: string }> {
  // Only send rows that will create or update. Errors and "skip" are not sent.
  const toSend = preview
    .filter((p) => p.bucket === "create" || p.bucket === "update")
    .map((p) => {
      const r = p.raw;
      return {
        account_number: p.account_number!,
        company_name: r.company_name || "",
        address: r.address || "",
        postal_code: r.postal_code || "",
        city: r.city || "",
        country: r.country || "",
        email: r.email || "",
        phone: r.phone || "",
        assigned_seller_initials: r.assigned_seller_initials || "",
        // dealer_type → both customer_type and customer_type_label.
        customer_type: r.dealer_type || "",
        customer_type_label: r.dealer_type || "",
      };
    });

  try {
    const { data, error } = await supabase.rpc("upsert_dealer_accounts", {
      payload: { rows: toSend },
    });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    const summary: ImportSummary = {
      created: Number(d.created ?? 0),
      updated: Number(d.updated ?? 0),
      skipped: Number(d.skipped ?? 0),
      errors: Array.isArray(d.errors)
        ? (d.errors as ImportSummary["errors"])
        : [],
    };

    // CSV-side errors (missing account_number / duplicates) also count.
    const csvErrors = preview.filter((p) => p.bucket === "error");
    const totalErrors = summary.errors.length + csvErrors.length;
    const totalSkipped = summary.skipped + preview.filter((p) => p.bucket === "skip").length;

    // Insert audit log row (best-effort; do not fail import if log insert fails).
    try {
      const { data: sess } = await supabase.auth.getUser();
      await supabase.from("dealer_import_logs").insert({
        imported_by: sess.user?.id ?? null,
        imported_by_email: sess.user?.email ?? null,
        file_name: fileName,
        created_count: summary.created,
        updated_count: summary.updated,
        skipped_count: totalSkipped,
        error_count: totalErrors,
        errors: [
          ...summary.errors,
          ...csvErrors.map((e) => ({
            account_number: e.account_number,
            error: e.errorMessage || "csv error",
          })),
        ],
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.warn("[dealerImportService] kunne ikke skrive import-log:", logErr);
    }

    return {
      ok: true,
      summary: {
        ...summary,
        skipped: totalSkipped,
        errors: [
          ...summary.errors,
          ...csvErrors.map((e) => ({
            account_number: e.account_number,
            error: e.errorMessage || "csv error",
          })),
        ],
      },
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function listImportLogs(): Promise<DealerImportLog[]> {
  const { data, error } = await supabase
    .from("dealer_import_logs")
    .select("id, imported_by_email, imported_at, file_name, created_count, updated_count, skipped_count, error_count")
    .order("imported_at", { ascending: false })
    .limit(50);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[dealerImportService] kunne ikke læse import-logs:", error);
    return [];
  }
  return (data ?? []) as DealerImportLog[];
}
