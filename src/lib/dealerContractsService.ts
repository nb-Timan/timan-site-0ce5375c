import { supabase } from "@/lib/supabase";
import {
  CONTRACT_VERSION,
  CONTRACT_STEPS,
  normalizeContractConfirmations,
  type ContractConfirmations,
  type ContractFormData,
  type ContractSnapshot,
  type ContractStatus,
  getCompletedContractStepIds,
} from "@/lib/contractFlow";

export type DealerContractRecord = {
  id: string;
  draft_key: string;
  dealer_account_number: string | null;
  owner_auth_user_id: string | null;
  owner_email: string;
  owner_name: string | null;
  current_step: string;
  completed_steps: string[];
  confirmations: ContractConfirmations;
  form_data: ContractFormData;
  contract_version: string;
  final_snapshot: ContractSnapshot | null;
  signature_data_url: string | null;
  status: ContractStatus;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveDealerContractInput = {
  id?: string | null;
  ownerEmail: string;
  ownerName?: string | null;
  dealerAccountNumber?: string | null;
  activeStepIndex: number;
  form: ContractFormData;
  confirmations: ContractConfirmations;
  status: ContractStatus;
  finalSnapshot?: ContractSnapshot | null;
};

export function buildDealerContractDraftKey(ownerEmail: string, dealerAccountNumber?: string | null) {
  const owner = ownerEmail.trim().toLowerCase();
  const dealer = (dealerAccountNumber || "manual").trim().toLowerCase();
  return `${owner}:${dealer}`;
}

export function getCurrentStepId(activeStepIndex: number) {
  return CONTRACT_STEPS[Math.min(Math.max(activeStepIndex, 0), CONTRACT_STEPS.length - 1)]?.id ?? "parties";
}

function removeSignatureFromFormData(form: ContractFormData) {
  return {
    ...form,
    signatureDataUrl: null,
  };
}

function rowToContractRecord(row: Record<string, unknown>): DealerContractRecord {
  const formData = (row.form_data || {}) as Partial<ContractFormData>;
  const signatureDataUrl = (row.signature_data_url as string | null) ?? null;
  return {
    id: String(row.id),
    draft_key: String(row.draft_key),
    dealer_account_number: (row.dealer_account_number as string | null) ?? null,
    owner_auth_user_id: (row.owner_auth_user_id as string | null) ?? null,
    owner_email: String(row.owner_email),
    owner_name: (row.owner_name as string | null) ?? null,
    current_step: String(row.current_step ?? "parties"),
    completed_steps: Array.isArray(row.completed_steps) ? (row.completed_steps as string[]) : [],
    confirmations: normalizeContractConfirmations((row.confirmations || {}) as Partial<Record<string, { confirmed: boolean; confirmedAt?: string; confirmedBy?: string }>>),
    form_data: {
      dealerName: formData.dealerName ?? "",
      dealerAddress: formData.dealerAddress ?? "",
      dealerPostalCode: formData.dealerPostalCode ?? "",
      dealerCity: formData.dealerCity ?? "",
      dealerCvr: formData.dealerCvr ?? "",
      contactPerson: formData.contactPerson ?? "",
      contactTitle: formData.contactTitle ?? "",
      timanSellerName: formData.timanSellerName ?? "",
      timanSellerEmail: formData.timanSellerEmail ?? "",
      timanSellerPhone: formData.timanSellerPhone ?? "",
      contractDate: formData.contractDate ?? "",
      signatureDataUrl,
    },
    contract_version: String(row.contract_version ?? CONTRACT_VERSION),
    final_snapshot: (row.final_snapshot as ContractSnapshot | null) ?? null,
    signature_data_url: signatureDataUrl,
    status: (row.status as ContractStatus) ?? "Draft",
    signed_at: (row.signed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function fetchDealerContractDraft(input: {
  ownerEmail: string;
  dealerAccountNumber?: string | null;
}): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const draftKey = buildDealerContractDraftKey(input.ownerEmail, input.dealerAccountNumber);
  const { data, error } = await supabase
    .from("dealer_contracts")
    .select("*")
    .eq("draft_key", draftKey)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}

export async function saveDealerContractDraft(
  input: SaveDealerContractInput,
): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const draftKey = buildDealerContractDraftKey(input.ownerEmail, input.dealerAccountNumber);
  const finalSnapshot = input.finalSnapshot ?? null;
  const payload = {
    id: input.id || undefined,
    draft_key: draftKey,
    dealer_account_number: input.dealerAccountNumber || null,
    owner_email: input.ownerEmail.trim().toLowerCase(),
    owner_name: input.ownerName || null,
    current_step: getCurrentStepId(input.activeStepIndex),
    completed_steps: getCompletedContractStepIds(input.activeStepIndex, input.confirmations),
    confirmations: input.confirmations,
    form_data: removeSignatureFromFormData(input.form),
    contract_version: CONTRACT_VERSION,
    final_snapshot: finalSnapshot,
    signature_data_url: input.form.signatureDataUrl,
    status: input.status,
    signed_at: input.status === "Signed" ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("dealer_contracts")
    .upsert(payload, { onConflict: "draft_key" })
    .select("*")
    .single();

  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}
