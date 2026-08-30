import { supabase } from "@/lib/supabase";
import {
  CONTRACT_VERSION,
  CONTRACT_STEPS,
  normalizeContractConfirmations,
  type ContractConfirmations,
  type ContractFormData,
  type ContractSnapshot,
  type ContractStatus,
  type ContractWorkflowStatus,
  getLegacyContractStatus,
  getWorkflowStatusFromLegacy,
  getCompletedContractStepIds,
} from "@/lib/contractFlow";

export const DEALER_CONTRACTS_BUCKET = "dealer-contracts";

export type DealerContractRecord = {
  id: string;
  draft_key: string;
  contract_number: string | null;
  dealer_account_number: string | null;
  dealer_account_id: string | null;
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
  contract_status: ContractWorkflowStatus;
  signed_at: string | null;
  guided_review_completed_at: string | null;
  guided_review_completed_by_name: string | null;
  guided_review_completed_by_email: string | null;
  expected_signed_pages: number | null;
  pdf_generated_at: string | null;
  submitted_at: string | null;
  approved_upload_version_id: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approved_by_email: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealerContractUploadVersionStatus = "draft" | "submitted" | "changes_requested" | "approved" | "superseded";

export type DealerContractUploadFile = {
  id: string;
  contract_id: string;
  upload_version_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  page_number: number | null;
  sort_order: number;
  created_at: string;
  signed_url?: string | null;
};

export type DealerContractUploadVersion = {
  id: string;
  contract_id: string;
  version_no: number;
  status: DealerContractUploadVersionStatus;
  review_comment: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
  submitted_by_email: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_by_email: string | null;
  created_at: string;
  updated_at: string;
  files: DealerContractUploadFile[];
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
  const contractStatus = (row.contract_status as ContractWorkflowStatus | null)
    ?? getWorkflowStatusFromLegacy(row.status as string | null);
  return {
    id: String(row.id),
    draft_key: String(row.draft_key),
    contract_number: (row.contract_number as string | null) ?? null,
    dealer_account_number: (row.dealer_account_number as string | null) ?? null,
    dealer_account_id: (row.dealer_account_id as string | null) ?? null,
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
    status: (row.status as ContractStatus) ?? getLegacyContractStatus(contractStatus),
    contract_status: contractStatus,
    signed_at: (row.signed_at as string | null) ?? null,
    guided_review_completed_at: (row.guided_review_completed_at as string | null) ?? null,
    guided_review_completed_by_name: (row.guided_review_completed_by_name as string | null) ?? null,
    guided_review_completed_by_email: (row.guided_review_completed_by_email as string | null) ?? null,
    expected_signed_pages: (row.expected_signed_pages as number | null) ?? null,
    pdf_generated_at: (row.pdf_generated_at as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    approved_upload_version_id: (row.approved_upload_version_id as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    approved_by_name: (row.approved_by_name as string | null) ?? null,
    approved_by_email: (row.approved_by_email as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function rowToUploadFile(row: Record<string, unknown>): DealerContractUploadFile {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    upload_version_id: String(row.upload_version_id),
    storage_bucket: String(row.storage_bucket ?? DEALER_CONTRACTS_BUCKET),
    storage_path: String(row.storage_path),
    file_name: String(row.file_name),
    mime_type: String(row.mime_type),
    file_size: Number(row.file_size ?? 0),
    page_number: (row.page_number as number | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
    created_at: String(row.created_at ?? ""),
  };
}

function rowToUploadVersion(row: Record<string, unknown>): DealerContractUploadVersion {
  const files = Array.isArray(row.dealer_contract_upload_files)
    ? row.dealer_contract_upload_files as Record<string, unknown>[]
    : Array.isArray(row.files)
      ? row.files as Record<string, unknown>[]
      : [];
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    version_no: Number(row.version_no ?? 1),
    status: (row.status as DealerContractUploadVersionStatus) ?? "draft",
    review_comment: (row.review_comment as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    submitted_by_name: (row.submitted_by_name as string | null) ?? null,
    submitted_by_email: (row.submitted_by_email as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    reviewed_by_name: (row.reviewed_by_name as string | null) ?? null,
    reviewed_by_email: (row.reviewed_by_email as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    files: files.map(rowToUploadFile).sort((a, b) => a.sort_order - b.sort_order),
  };
}

function getDraftPersistenceWorkflowStatus(input: SaveDealerContractInput): ContractWorkflowStatus {
  if (input.finalSnapshot?.workflowStatus) return input.finalSnapshot.workflowStatus;
  if (input.status === "Draft") return "draft";
  return "guided_review";
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
    contract_status: getDraftPersistenceWorkflowStatus(input),
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

export async function completeDealerContractGuidedReview(input: {
  contractId: string;
  snapshot: ContractSnapshot;
  expectedSignedPages: number;
}): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc("complete_dealer_contract_guided_review", {
    p_contract_id: input.contractId,
    p_snapshot: input.snapshot,
    p_expected_signed_pages: input.expectedSignedPages,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}

export async function markDealerContractPdfGenerated(
  contractId: string,
  expectedSignedPages?: number | null,
): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc("mark_dealer_contract_pdf_generated", {
    p_contract_id: contractId,
    p_expected_signed_pages: expectedSignedPages ?? null,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}

export async function createDealerContractUploadVersion(
  contractId: string,
): Promise<{ row: DealerContractUploadVersion | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_dealer_contract_upload_version", {
    p_contract_id: contractId,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToUploadVersion(data as Record<string, unknown>) : null, error: null };
}

function safeAttachmentFileName(value: string) {
  return (value || "underskrevet-kontrakt")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "underskrevet-kontrakt";
}

function storageFileId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fall through to timestamp fallback.
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadDealerContractFile(input: {
  contractId: string;
  uploadVersionId: string;
  file: File;
  sortOrder: number;
  pageNumber?: number | null;
}): Promise<{ row: DealerContractUploadFile | null; error: string | null }> {
  const storagePath = `contracts/${input.contractId}/uploads/${input.uploadVersionId}/${String(input.sortOrder + 1).padStart(2, "0")}-${storageFileId()}-${safeAttachmentFileName(input.file.name)}`;
  const contentType = input.file.type || "application/octet-stream";
  const { error: uploadError } = await supabase.storage
    .from(DEALER_CONTRACTS_BUCKET)
    .upload(storagePath, input.file, { contentType, upsert: false });

  if (uploadError) return { row: null, error: uploadError.message };

  const { data, error } = await supabase
    .from("dealer_contract_upload_files")
    .insert({
      contract_id: input.contractId,
      upload_version_id: input.uploadVersionId,
      storage_bucket: DEALER_CONTRACTS_BUCKET,
      storage_path: storagePath,
      file_name: input.file.name,
      mime_type: contentType,
      file_size: input.file.size,
      page_number: input.pageNumber ?? (input.file.type === "application/pdf" ? null : input.sortOrder + 1),
      sort_order: input.sortOrder,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(DEALER_CONTRACTS_BUCKET).remove([storagePath]);
    return { row: null, error: error.message };
  }

  return { row: rowToUploadFile(data as Record<string, unknown>), error: null };
}

export async function deleteDealerContractUploadFile(file: DealerContractUploadFile): Promise<string | null> {
  const { error: removeError } = await supabase.storage
    .from(file.storage_bucket || DEALER_CONTRACTS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) return removeError.message;

  const { error } = await supabase
    .from("dealer_contract_upload_files")
    .delete()
    .eq("id", file.id);
  return error?.message ?? null;
}

export async function reorderDealerContractUploadFiles(files: DealerContractUploadFile[]): Promise<string | null> {
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const { error } = await supabase
      .from("dealer_contract_upload_files")
      .update({
        sort_order: index,
        page_number: file.mime_type === "application/pdf" ? null : index + 1,
      })
      .eq("id", file.id);
    if (error) return error.message;
  }
  return null;
}

export async function fetchDealerContractUploadVersions(
  contractId: string,
): Promise<{ rows: DealerContractUploadVersion[]; error: string | null }> {
  const { data, error } = await supabase
    .from("dealer_contract_upload_versions")
    .select("*, dealer_contract_upload_files(*)")
    .eq("contract_id", contractId)
    .order("version_no", { ascending: false })
    .order("sort_order", { referencedTable: "dealer_contract_upload_files", ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data || []).map((row) => rowToUploadVersion(row as Record<string, unknown>)), error: null };
}

export async function fetchDealerContractFileSignedUrl(
  file: DealerContractUploadFile,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(file.storage_bucket || DEALER_CONTRACTS_BUCKET)
    .createSignedUrl(file.storage_path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}

export async function addSignedUrlsToUploadVersions(
  versions: DealerContractUploadVersion[],
): Promise<DealerContractUploadVersion[]> {
  return Promise.all(versions.map(async (version) => ({
    ...version,
    files: await Promise.all(version.files.map(async (file) => ({
      ...file,
      signed_url: await fetchDealerContractFileSignedUrl(file),
    }))),
  })));
}

export async function submitDealerContractUpload(
  uploadVersionId: string,
): Promise<{ row: DealerContractUploadVersion | null; error: string | null }> {
  const { data, error } = await supabase.rpc("submit_dealer_contract_upload", {
    p_upload_version_id: uploadVersionId,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToUploadVersion(data as Record<string, unknown>) : null, error: null };
}

export async function requestDealerContractNewUpload(
  uploadVersionId: string,
  comment: string,
): Promise<{ row: DealerContractUploadVersion | null; error: string | null }> {
  const { data, error } = await supabase.rpc("request_dealer_contract_new_upload", {
    p_upload_version_id: uploadVersionId,
    p_comment: comment,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToUploadVersion(data as Record<string, unknown>) : null, error: null };
}

export async function approveDealerContractUpload(
  uploadVersionId: string,
): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const { data, error } = await supabase.rpc("approve_dealer_contract_upload", {
    p_upload_version_id: uploadVersionId,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}

export async function fetchDealerContractsForReview(): Promise<{ rows: DealerContractRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("dealer_contracts")
    .select("*")
    .in("contract_status", ["submitted_for_approval", "changes_requested", "approved", "awaiting_signed_upload"])
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data || []).map((row) => rowToContractRecord(row as Record<string, unknown>)), error: null };
}

export async function fetchDealerContractsForDealerAccount(
  dealerAccountNumber: string,
): Promise<{ rows: DealerContractRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from("dealer_contracts")
    .select("*")
    .eq("dealer_account_number", dealerAccountNumber)
    .in("contract_status", ["ready_for_signature", "awaiting_signed_upload", "submitted_for_approval", "changes_requested", "approved", "archived"])
    .order("updated_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data || []).map((row) => rowToContractRecord(row as Record<string, unknown>)), error: null };
}
