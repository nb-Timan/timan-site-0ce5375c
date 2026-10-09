import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type WarrantySubmissionStatus =
  | "submitted"
  | "pending"
  | "needs_information"
  | "approved"
  | "rejected"
  | "cancelled";

export interface WarrantySubmission {
  id: string;
  submissionStatus: WarrantySubmissionStatus;
  machineSerial: string;
  machineModel: string;
  isDemo: boolean;
  demoHoursAtSale: number | null;
  dealerName: string;
  dealerAccountNumber: string;
  customerName: string;
  deliveryDate: string;
  createdAt: string;
  matchedMachineRegistrationId: string | null;
  approvedRegistrationId: string | null;
  approvedAt: string | null;
  updatedAt: string;
  currentStatusComment: string | null;
  rejectionReason: string | null;
}

export interface WarrantySubmissionStatusHistoryEntry {
  id: string;
  fromStatus: WarrantySubmissionStatus | null;
  toStatus: WarrantySubmissionStatus;
  comment: string | null;
  actorEmail: string | null;
  createdAt: string;
}

interface SubmissionRow {
  id: string;
  submission_status: WarrantySubmissionStatus;
  machine_serial_number: string;
  machine_model: string;
  is_demo: boolean;
  demo_hours_at_sale: number | null;
  dealer_name_snapshot: string;
  dealer_account_number: string;
  customer_name: string;
  delivery_date: string;
  created_at: string;
  matched_machine_registration_id: string | null;
  approved_registration_id: string | null;
  approved_at: string | null;
  updated_at: string;
  current_status_comment: string | null;
  rejection_reason: string | null;
}

function mapSubmission(row: SubmissionRow): WarrantySubmission {
  return {
    id: row.id,
    submissionStatus: row.submission_status,
    machineSerial: row.machine_serial_number,
    machineModel: row.machine_model,
    isDemo: row.is_demo,
    demoHoursAtSale: row.demo_hours_at_sale,
    dealerName: row.dealer_name_snapshot,
    dealerAccountNumber: row.dealer_account_number,
    customerName: row.customer_name,
    deliveryDate: row.delivery_date,
    createdAt: row.created_at,
    matchedMachineRegistrationId: row.matched_machine_registration_id,
    approvedRegistrationId: row.approved_registration_id,
    approvedAt: row.approved_at,
    updatedAt: row.updated_at,
    currentStatusComment: row.current_status_comment,
    rejectionReason: row.rejection_reason,
  };
}

export async function fetchWarrantySubmissions(): Promise<WarrantySubmission[]> {
  const { data, error } = await supabase
    .from("warranty_submissions")
    .select(
      "id, submission_status, machine_serial_number, machine_model, is_demo, demo_hours_at_sale, dealer_name_snapshot, dealer_account_number, customer_name, delivery_date, created_at, updated_at, current_status_comment, rejection_reason, matched_machine_registration_id, approved_registration_id, approved_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as SubmissionRow[]).map(mapSubmission);
}

export async function fetchWarrantySubmissionStatusHistory(
  submissionId: string,
): Promise<WarrantySubmissionStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from("warranty_submission_status_history")
    .select("id, from_status, to_status, comment, actor_email, created_at")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const entry = row as {
      id: string;
      from_status: WarrantySubmissionStatus | null;
      to_status: WarrantySubmissionStatus;
      comment: string | null;
      actor_email: string | null;
      created_at: string;
    };
    return {
      id: entry.id,
      fromStatus: entry.from_status,
      toStatus: entry.to_status,
      comment: entry.comment,
      actorEmail: entry.actor_email,
      createdAt: entry.created_at,
    };
  });
}

export async function transitionWarrantySubmission(
  id: string,
  targetStatus: "pending" | "needs_information" | "rejected",
  comment?: string,
): Promise<void> {
  const { error } = await supabase.rpc("transition_portal_warranty_submission", {
    p_submission_id: id,
    p_target_status: targetStatus,
    p_comment: comment?.trim() || null,
  });
  if (!error) return;
  if (error.code === "42501") {
    throw new Error("Du har ikke adgang til at behandle garantiindsendelser.");
  }
  if (error.code === "22023") {
    throw new Error(error.message);
  }
  throw new Error("Status kunne ikke opdateres. Prøv igen eller kontakt Timan Service.");
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
