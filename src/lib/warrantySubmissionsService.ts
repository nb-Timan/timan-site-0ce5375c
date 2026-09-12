import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type WarrantySubmissionStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface WarrantySubmission {
  id: string;
  submissionStatus: WarrantySubmissionStatus;
  machineSerial: string;
  machineModel: string;
  dealerName: string;
  dealerAccountNumber: string;
  customerName: string;
  deliveryDate: string;
  createdAt: string;
  matchedMachineRegistrationId: string | null;
  approvedRegistrationId: string | null;
  approvedAt: string | null;
}

interface SubmissionRow {
  id: string;
  submission_status: WarrantySubmissionStatus;
  machine_serial_number: string;
  machine_model: string;
  dealer_name_snapshot: string;
  dealer_account_number: string;
  customer_name: string;
  delivery_date: string;
  created_at: string;
  matched_machine_registration_id: string | null;
  approved_registration_id: string | null;
  approved_at: string | null;
}

function mapSubmission(row: SubmissionRow): WarrantySubmission {
  return {
    id: row.id,
    submissionStatus: row.submission_status,
    machineSerial: row.machine_serial_number,
    machineModel: row.machine_model,
    dealerName: row.dealer_name_snapshot,
    dealerAccountNumber: row.dealer_account_number,
    customerName: row.customer_name,
    deliveryDate: row.delivery_date,
    createdAt: row.created_at,
    matchedMachineRegistrationId: row.matched_machine_registration_id,
    approvedRegistrationId: row.approved_registration_id,
    approvedAt: row.approved_at,
  };
}

export async function fetchWarrantySubmissions(): Promise<WarrantySubmission[]> {
  const { data, error } = await supabase
    .from("warranty_submissions")
    .select(
      "id, submission_status, machine_serial_number, machine_model, dealer_name_snapshot, dealer_account_number, customer_name, delivery_date, created_at, matched_machine_registration_id, approved_registration_id, approved_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as SubmissionRow[]).map(mapSubmission);
}

export async function approveWarrantySubmission(id: string): Promise<void> {
  const { error } = await supabase.rpc("approve_pending_portal_warranty_submission", {
    p_submission_id: id,
  });
  if (!error) return;
  if (error.code === "23505") {
    throw new Error("Maskinen har allerede en godkendt garanti med SP-nummer.");
  }
  if (error.code === "42501") {
    throw new Error("Du har ikke adgang til at godkende garantiindsendelser.");
  }
  throw new Error("Garantiregistreringen kunne ikke godkendes. Prøv igen eller kontakt Timan Service.");
}

export function useWarrantySubmissionsDb() {
  const [submissions, setSubmissions] = useState<WarrantySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchWarrantySubmissions();
      setSubmissions(rows);
      setError(null);
    } catch (err) {
      setSubmissions([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { submissions, loading, error, reload };
}
