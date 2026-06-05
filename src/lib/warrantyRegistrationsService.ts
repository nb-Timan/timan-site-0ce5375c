/**
 * Reads warranty registrations from public.warranty_registrations (Supabase).
 *
 * RLS controls dealer-scope visibility. We additionally filter
 * `is_active_in_source = true` so the lists never show stale rows that were
 * removed from SharePoint. Backend / Service still see needs_review +
 * unmatched rows (this is enforced by RLS policies + has_global flag).
 *
 * Rows are mapped to the existing `WarrantyRegistration` shape used by the
 * dashboard + registrations table, plus a couple of DB-only extras
 * (matchStatus / accountNumber / postalCode / spModifiedAt).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { WarrantyRegistration } from "@/lib/warranty-store";

export interface DbWarrantyRegistration extends WarrantyRegistration {
  dealerMatchStatus: "matched" | "needs_review" | "unmatched";
  dealerAccountNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  sharepointItemId: string | null;
  sharepointModifiedAt: string | null;
  registrationDate: string | null;
  isActiveInSource: boolean;
}

interface Row {
  id: string;
  sharepoint_item_id: string | null;
  sharepoint_modified_at: string | null;
  machine_serial_number: string | null;
  machine_model: string | null;
  tool_serials: string[] | null;
  dealer_name_snapshot: string | null;
  dealer_account_id: string | null;
  dealer_account_number: string | null;
  dealer_match_status: "matched" | "needs_review" | "unmatched";
  customer_name: string | null;
  customer_address: string | null;
  customer_postal_code: string | null;
  customer_city: string | null;
  customer_country: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  delivery_date: string | null;
  registration_date: string | null;
  language: string | null;
  is_demo: boolean | null;
  replacement_brand: string | null;
  comment: string | null;
  is_active_in_source: boolean;
  created_at: string;
  updated_at: string;
}

function fmtPostalCity(pc?: string | null, city?: string | null): string {
  return [pc?.trim(), city?.trim()].filter(Boolean).join(" ");
}

function buildCertificateNumber(row: Row): string {
  if (row.sharepoint_item_id) return `SP-${row.sharepoint_item_id}`;
  return row.id.slice(0, 8).toUpperCase();
}

function mapRow(row: Row): DbWarrantyRegistration {
  const submitted =
    row.registration_date ??
    row.sharepoint_modified_at ??
    row.created_at;
  return {
    id: row.id,
    certificateNumber: buildCertificateNumber(row),
    source: "import",
    createdAt: row.created_at,
    submittedAt: submitted,
    language: row.language,
    dealerName: row.dealer_name_snapshot ?? "Ukendt",
    isDemo: row.is_demo ? "Ja" : "Nej",
    machineSerial: row.machine_serial_number ?? "",
    machineType: row.machine_model ?? "",
    replacementBrand: row.replacement_brand,
    toolSerials: (row.tool_serials ?? []).filter(Boolean),
    deliveryDate: row.delivery_date ?? "",
    customer: row.customer_name ?? "",
    customerAddress: row.customer_address ?? "",
    postalCity: fmtPostalCity(row.customer_postal_code, row.customer_city),
    phone: row.customer_phone ?? "",
    confirmationEmail: row.customer_email ?? "",
    comment: row.comment,
    status: row.is_active_in_source ? "active" : "archived",
    dealerMatchStatus: row.dealer_match_status,
    dealerAccountNumber: row.dealer_account_number,
    postalCode: row.customer_postal_code,
    city: row.customer_city,
    country: row.customer_country,
    sharepointItemId: row.sharepoint_item_id,
    sharepointModifiedAt: row.sharepoint_modified_at,
    registrationDate: row.registration_date,
    isActiveInSource: row.is_active_in_source,
  };
}

export async function fetchWarrantyRegistrations(): Promise<DbWarrantyRegistration[]> {
  const { data, error } = await supabase
    .from("warranty_registrations")
    .select(
      "id, sharepoint_item_id, sharepoint_modified_at, machine_serial_number, machine_model, tool_serials, dealer_name_snapshot, dealer_account_id, dealer_account_number, dealer_match_status, customer_name, customer_address, customer_postal_code, customer_city, customer_country, customer_phone, customer_email, delivery_date, registration_date, language, is_demo, replacement_brand, comment, is_active_in_source, created_at, updated_at",
    )
    .eq("is_active_in_source", true)
    .order("registration_date", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as Row));
}

export function useWarrantyRegistrationsDb() {
  const [records, setRecords] = useState<DbWarrantyRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWarrantyRegistrations()
      .then((rows) => {
        if (cancelled) return;
        setRecords(rows);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? String(e));
        setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { records, loading, error };
}
