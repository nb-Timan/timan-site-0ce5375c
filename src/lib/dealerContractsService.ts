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
import { normalizeContractPartnerType } from "@/lib/contractPartnerTerms";
import {
  normalizeContractSecondaryTerritoryArea,
  normalizeContractTerritoryArea,
} from "@/lib/contractTerritory";
import { normalizeContractServiceHourlyRateDkk } from "@/lib/contractServiceTerms";
import { normalizeContractPaymentTerm } from "@/lib/contractPaymentTerms";
import { normalizeContractAssociatedPartners } from "@/lib/contractAssociatedPartners";
import { fetchDealerAccountByNumber, fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";

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

export type DealerContractAccessWindow = {
  id: string;
  dealer_account_id: string;
  dealer_account_number: string;
  contract_id: string | null;
  user_id: string | null;
  opens_at: string;
  closes_at: string;
  status: "planned" | "open" | "revoked";
  activated_by_user_id: string | null;
  activated_by_name: string | null;
  activated_by_email: string | null;
  activated_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  revoked_by_name: string | null;
  revoked_by_email: string | null;
  created_by_user_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type DealerContractPartnerUser = {
  id: string;
  email: string;
  name: string;
  portal_role: string | null;
  dealer_number: string | null;
};

export type DealerContractOverviewStatusFilter =
  | "all"
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "terminated";

export type DealerContractOverviewStatusGroup =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "terminated";

export type DealerContractOverviewScope = {
  portalRole: string | null | undefined;
  sellerId?: string | null;
  sellerEmail?: string | null;
  sellerInitials?: string | null;
};

export type DealerContractOverviewFilters = DealerContractOverviewScope & {
  query?: string;
  status?: DealerContractOverviewStatusFilter;
  partnerType?: string;
  sellerFilter?: {
    id?: string | null;
    email?: string | null;
    initials?: string | null;
  } | null;
};

export type DealerContractOverviewRow = {
  contract: DealerContractRecord;
  partnerName: string;
  accountNumber: string;
  partnerType: string;
  country: string;
  sellerId: string | null;
  sellerInitials: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  statusGroup: DealerContractOverviewStatusGroup;
  statusLabel: string;
  actionLabel: string;
};

export type DealerContractOverviewCounts = Record<"all" | DealerContractOverviewStatusGroup, number>;

export type PartnerAgreementHistoryEventType =
  | "partner_info_received"
  | "partner_approved"
  | "contract_access_activated"
  | "contract_access_extended"
  | "contract_access_revoked"
  | "contract_review_completed"
  | "contract_received"
  | "contract_approved"
  | "new_agreement"
  | "collaboration_partner_added"
  | "partner_relation_changed"
  | "service_partner_added"
  | "dealer_customer_added"
  | "cooperation_ended";

export type PartnerAgreementHistoryEvent = {
  id: string;
  dealer_account_id: string;
  dealer_account_number: string;
  event_type: PartnerAgreementHistoryEventType;
  event_title: string;
  event_description: string | null;
  contract_id: string | null;
  upload_version_id: string | null;
  partner_relation_id: string | null;
  document_bucket: string | null;
  document_path: string | null;
  metadata: Record<string, unknown>;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  occurred_at: string;
  created_at: string;
};

export type CreatePartnerAgreementHistoryEventInput = {
  dealerAccountId: string;
  eventType: PartnerAgreementHistoryEventType;
  eventTitle: string;
  eventDescription?: string | null;
  occurredAt?: string | null;
  contractId?: string | null;
  uploadVersionId?: string | null;
  partnerRelationId?: string | null;
  documentBucket?: string | null;
  documentPath?: string | null;
  metadata?: Record<string, unknown>;
};

export type SaveDealerContractInput = {
  id?: string | null;
  draftKey?: string | null;
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

export function buildNewDealerContractDraftKey(ownerEmail: string, dealerAccountNumber: string | null | undefined, instanceId: string) {
  const instance = instanceId.trim().toLowerCase();
  return `${buildDealerContractDraftKey(ownerEmail, dealerAccountNumber)}:new:${instance || "manual"}`;
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
      partnerType: normalizeContractPartnerType(formData.partnerType) ?? "",
      dealerName: formData.dealerName ?? "",
      dealerAddress: formData.dealerAddress ?? "",
      dealerPostalCode: formData.dealerPostalCode ?? "",
      dealerCity: formData.dealerCity ?? "",
      dealerCountry: formData.dealerCountry ?? "",
      dealerCvr: formData.dealerCvr ?? "",
      contactPerson: formData.contactPerson ?? "",
      contactTitle: formData.contactTitle ?? "",
      timanSellerName: formData.timanSellerName ?? "",
      timanSellerEmail: formData.timanSellerEmail ?? "",
      timanSellerPhone: formData.timanSellerPhone ?? "",
      contractDate: formData.contractDate ?? "",
      primaryTerritory: normalizeContractTerritoryArea(formData.primaryTerritory),
      secondaryTerritory: normalizeContractSecondaryTerritoryArea(formData.secondaryTerritory),
      associatedPartners: normalizeContractAssociatedPartners(formData.associatedPartners),
      serviceHourlyRateDkk: normalizeContractServiceHourlyRateDkk(formData.serviceHourlyRateDkk),
      paymentTerm: normalizeContractPaymentTerm(formData.paymentTerm),
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

function rowToAccessWindow(row: Record<string, unknown>): DealerContractAccessWindow {
  return {
    id: String(row.id),
    dealer_account_id: String(row.dealer_account_id),
    dealer_account_number: String(row.dealer_account_number),
    contract_id: (row.contract_id as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    opens_at: String(row.opens_at ?? row.activated_at ?? ""),
    closes_at: String(row.closes_at ?? row.expires_at ?? ""),
    status: (row.status as DealerContractAccessWindow["status"] | null) ?? "open",
    activated_by_user_id: (row.activated_by_user_id as string | null) ?? null,
    activated_by_name: (row.activated_by_name as string | null) ?? null,
    activated_by_email: (row.activated_by_email as string | null) ?? null,
    activated_at: String(row.activated_at ?? ""),
    expires_at: String(row.expires_at ?? ""),
    revoked_at: (row.revoked_at as string | null) ?? null,
    revoked_by_user_id: (row.revoked_by_user_id as string | null) ?? null,
    revoked_by_name: (row.revoked_by_name as string | null) ?? null,
    revoked_by_email: (row.revoked_by_email as string | null) ?? null,
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function rowToPartnerUser(row: Record<string, unknown>): DealerContractPartnerUser {
  const email = String(row.email ?? "");
  const name = String(row.display_name ?? row.full_name ?? row.name ?? email);
  return {
    id: String(row.id),
    email,
    name,
    portal_role: (row.portal_role as string | null) ?? null,
    dealer_number: (row.dealer_number as string | null) ?? null,
  };
}

function rowToAgreementHistoryEvent(row: Record<string, unknown>): PartnerAgreementHistoryEvent {
  return {
    id: String(row.id),
    dealer_account_id: String(row.dealer_account_id),
    dealer_account_number: String(row.dealer_account_number),
    event_type: row.event_type as PartnerAgreementHistoryEventType,
    event_title: String(row.event_title ?? ""),
    event_description: (row.event_description as string | null) ?? null,
    contract_id: (row.contract_id as string | null) ?? null,
    upload_version_id: (row.upload_version_id as string | null) ?? null,
    partner_relation_id: (row.partner_relation_id as string | null) ?? null,
    document_bucket: (row.document_bucket as string | null) ?? null,
    document_path: (row.document_path as string | null) ?? null,
    metadata: ((row.metadata as Record<string, unknown> | null) ?? {}),
    created_by_user_id: (row.created_by_user_id as string | null) ?? null,
    created_by_name: (row.created_by_name as string | null) ?? null,
    created_by_email: (row.created_by_email as string | null) ?? null,
    occurred_at: String(row.occurred_at ?? row.created_at ?? ""),
    created_at: String(row.created_at ?? ""),
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

export async function fetchDealerContractById(
  contractId: string,
): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from("dealer_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  return { row: data ? rowToContractRecord(data as Record<string, unknown>) : null, error: null };
}

function normalizeOverviewText(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function normalizeOverviewInitials(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

export function getDealerContractOverviewStatusGroup(
  status: ContractWorkflowStatus,
): DealerContractOverviewStatusGroup {
  if (status === "pending_decision") return "pending";
  if (status === "approved") return "approved";
  if (status === "archived") return "terminated";
  if (status === "changes_requested") return "rejected";
  if (status === "draft" || status === "guided_review") return "draft";
  return "pending";
}

export function getDealerContractOverviewStatusLabel(status: ContractWorkflowStatus) {
  if (status === "pending_decision") return "Afventer";
  if (status === "draft") return "Kladde";
  if (status === "guided_review") return "Klargjort / klar til gennemgang";
  if (status === "ready_for_signature" || status === "awaiting_signed_upload") return "Gennemgang / afventer partner";
  if (status === "submitted_for_approval") return "Modtaget / afventer Timan";
  if (status === "approved") return "Godkendt";
  if (status === "changes_requested") return "Ikke godkendt / afvist";
  return "Opsagt / ophørt";
}

function getDealerContractOverviewActionLabel(status: ContractWorkflowStatus) {
  if (status === "pending_decision") return "Start";
  if (status === "draft" || status === "guided_review") return "Fortsæt";
  if (status === "approved" || status === "archived") return "Åbn";
  return "Gennemgå";
}

function sellerMatchesScope(
  row: DealerContractOverviewRow,
  scope: Pick<DealerContractOverviewScope, "sellerId" | "sellerEmail" | "sellerInitials">,
) {
  const sellerId = normalizeOverviewText(scope.sellerId);
  const sellerEmail = normalizeOverviewText(scope.sellerEmail);
  const sellerInitials = normalizeOverviewInitials(scope.sellerInitials);
  const contractForm = row.contract.form_data;
  const candidateIds = [row.sellerId].map(normalizeOverviewText);
  const candidateEmails = [
    row.sellerEmail,
    contractForm.timanSellerEmail,
    row.contract.guided_review_completed_by_email,
    row.contract.owner_email,
  ].map(normalizeOverviewText);
  const candidateInitials = [row.sellerInitials].map(normalizeOverviewInitials);

  return Boolean(
    (sellerId && candidateIds.includes(sellerId))
      || (sellerEmail && candidateEmails.includes(sellerEmail))
      || (sellerInitials && candidateInitials.includes(sellerInitials)),
  );
}

function buildOverviewRow(contract: DealerContractRecord, dealer: DealerAccount | null): DealerContractOverviewRow {
  const statusGroup = getDealerContractOverviewStatusGroup(contract.contract_status);
  const formData = contract.form_data;
  return {
    contract,
    partnerName: dealer?.company_name || formData.dealerName || "Ukendt partner",
    accountNumber: dealer?.account_number || contract.dealer_account_number || "",
    partnerType: formData.partnerType || dealer?.customer_type_label || dealer?.customer_type || dealer?.dealer_type || "",
    country: dealer?.country || "",
    sellerId: dealer?.assigned_seller_id ?? null,
    sellerInitials: dealer?.assigned_seller_initials ?? null,
    sellerName: dealer?.assigned_seller_name || formData.timanSellerName || null,
    sellerEmail: dealer?.assigned_seller_email || formData.timanSellerEmail || null,
    createdAt: contract.created_at,
    updatedAt: contract.updated_at,
    statusGroup,
    statusLabel: getDealerContractOverviewStatusLabel(contract.contract_status),
    actionLabel: getDealerContractOverviewActionLabel(contract.contract_status),
  };
}

function countOverviewRows(rows: DealerContractOverviewRow[]): DealerContractOverviewCounts {
  return rows.reduce<DealerContractOverviewCounts>((counts, row) => {
    counts.all += 1;
    counts[row.statusGroup] += 1;
    return counts;
  }, {
    all: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    terminated: 0,
  });
}

export async function fetchInternalDealerContractOverview(
  filters: DealerContractOverviewFilters,
): Promise<{ rows: DealerContractOverviewRow[]; counts: DealerContractOverviewCounts; error: string | null }> {
  const portalRole = filters.portalRole;
  if (portalRole !== "timan_backend" && portalRole !== "timan_seller") {
    return { rows: [], counts: countOverviewRows([]), error: "Kontraktoversigten er kun til Timan Backend og Timan-sælgere." };
  }

  const { data, error } = await supabase
    .from("dealer_contracts")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return { rows: [], counts: countOverviewRows([]), error: error.message };

  const dealerResult = await fetchDealerAccounts({ includeDeleted: true });
  const dealersById = new Map<string, DealerAccount>();
  const dealersByAccount = new Map<string, DealerAccount>();
  dealerResult.rows.forEach((dealer) => {
    dealersById.set(dealer.id, dealer);
    dealersByAccount.set(dealer.account_number, dealer);
  });

  const allRows = (data || []).map((raw) => {
    const contract = rowToContractRecord(raw as Record<string, unknown>);
    const dealer = (contract.dealer_account_id ? dealersById.get(contract.dealer_account_id) : null)
      || (contract.dealer_account_number ? dealersByAccount.get(contract.dealer_account_number) : null)
      || null;
    return buildOverviewRow(contract, dealer);
  });

  const scopeSeller = filters.sellerFilter || {
    id: filters.sellerId,
    email: filters.sellerEmail,
    initials: filters.sellerInitials,
  };
  const scopedRows = portalRole === "timan_seller" || filters.sellerFilter
    ? allRows.filter((row) => sellerMatchesScope(row, scopeSeller))
    : allRows;
  const query = normalizeOverviewText(filters.query);
  const partnerType = normalizeOverviewText(filters.partnerType);
  const status = filters.status || "all";

  const filteredRows = scopedRows.filter((row) => {
    if (status !== "all" && row.statusGroup !== status) return false;
    if (partnerType && normalizeOverviewText(row.partnerType) !== partnerType) return false;
    if (!query) return true;
    return [
      row.partnerName,
      row.accountNumber,
      row.country,
      row.sellerInitials,
      row.sellerName,
      row.sellerEmail,
      row.statusLabel,
      row.contract.contract_number,
    ].some((value) => normalizeOverviewText(value).includes(query));
  });

  return {
    rows: filteredRows,
    counts: countOverviewRows(scopedRows),
    error: dealerResult.error ?? null,
  };
}

export async function saveDealerContractDraft(
  input: SaveDealerContractInput,
): Promise<{ row: DealerContractRecord | null; error: string | null }> {
  const draftKey = input.draftKey?.trim().toLowerCase()
    || buildDealerContractDraftKey(input.ownerEmail, input.dealerAccountNumber);
  const finalSnapshot = input.finalSnapshot ?? null;
  let dealerAccountId: string | null = null;
  if (input.dealerAccountNumber) {
    const dealer = await fetchDealerAccountByNumber(input.dealerAccountNumber);
    if (dealer.error) return { row: null, error: dealer.error };
    dealerAccountId = dealer.row?.id ?? null;
  }
  const payload = {
    id: input.id || undefined,
    draft_key: draftKey,
    dealer_account_number: input.dealerAccountNumber || null,
    dealer_account_id: dealerAccountId,
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

export async function deleteDealerContract(contractId: string): Promise<{ deleted: boolean; error: string | null }> {
  const { error } = await supabase.rpc("delete_dealer_contract", {
    p_contract_id: contractId,
  });

  if (error) return { deleted: false, error: error.message };
  return { deleted: true, error: null };
}

export async function fetchActiveDealerContractAccessWindow(input: {
  dealerAccountNumber: string;
  contractId?: string | null;
}): Promise<{ row: DealerContractAccessWindow | null; error: string | null }> {
  const now = new Date().toISOString();
  let query = supabase
    .from("dealer_contract_access_windows")
    .select("*")
    .eq("dealer_account_number", input.dealerAccountNumber)
    .is("revoked_at", null)
    .lte("opens_at", now)
    .gt("closes_at", now)
    .order("closes_at", { ascending: false });

  if (input.contractId) {
    query = query.eq("contract_id", input.contractId);
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToAccessWindow(data as Record<string, unknown>) : null, error: null };
}

export async function fetchDealerContractAccessWindows(
  contractId: string,
): Promise<{ rows: DealerContractAccessWindow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("dealer_contract_access_windows")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data || []).map((row) => rowToAccessWindow(row as Record<string, unknown>)), error: null };
}

export async function fetchDealerContractPartnerUsers(
  dealerAccountNumber: string,
): Promise<{ rows: DealerContractPartnerUser[]; error: string | null }> {
  const externalRoles = ["timan_dealer", "dealer_user", "timan_importer", "timan_service_partner", "dealer_customer"];
  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,full_name,display_name,portal_role,dealer_number,approved,is_active,status")
    .eq("dealer_number", dealerAccountNumber)
    .eq("approved", true)
    .eq("is_active", true)
    .in("portal_role", externalRoles)
    .order("email", { ascending: true });
  if (error) return { rows: [], error: error.message };
  const rows = (data || [])
    .filter((row) => row.status !== "blocked" && row.status !== "pending")
    .map((row) => rowToPartnerUser(row as Record<string, unknown>));
  return { rows, error: null };
}

export async function activateDealerContractAccessWindow(input: {
  dealerAccountNumber: string;
  contractId: string;
  userId: string;
  opensAt: string;
  closesAt: string;
  note?: string | null;
}): Promise<{ row: DealerContractAccessWindow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("activate_dealer_contract_access_window", {
    p_dealer_account_number: input.dealerAccountNumber,
    p_contract_id: input.contractId,
    p_user_id: input.userId,
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_note: input.note ?? null,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToAccessWindow(data as Record<string, unknown>) : null, error: null };
}

export async function extendDealerContractAccessWindow(input: {
  windowId: string;
  closesAt: string;
}): Promise<{ row: DealerContractAccessWindow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("extend_dealer_contract_access_window", {
    p_window_id: input.windowId,
    p_closes_at: input.closesAt,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToAccessWindow(data as Record<string, unknown>) : null, error: null };
}

export async function revokeDealerContractAccessWindow(
  windowId: string,
): Promise<{ row: DealerContractAccessWindow | null; error: string | null }> {
  const { data, error } = await supabase.rpc("revoke_dealer_contract_access_window", {
    p_window_id: windowId,
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToAccessWindow(data as Record<string, unknown>) : null, error: null };
}

export async function fetchPartnerAgreementHistory(
  dealerAccountNumber: string,
): Promise<{ rows: PartnerAgreementHistoryEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from("partner_agreement_history")
    .select("*")
    .eq("dealer_account_number", dealerAccountNumber)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data || []).map((row) => rowToAgreementHistoryEvent(row as Record<string, unknown>)), error: null };
}

export async function createPartnerAgreementHistoryEvent(
  input: CreatePartnerAgreementHistoryEventInput,
): Promise<{ row: PartnerAgreementHistoryEvent | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_partner_agreement_history_event", {
    p_dealer_account_id: input.dealerAccountId,
    p_event_type: input.eventType,
    p_event_title: input.eventTitle,
    p_event_description: input.eventDescription ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_contract_id: input.contractId ?? null,
    p_upload_version_id: input.uploadVersionId ?? null,
    p_partner_relation_id: input.partnerRelationId ?? null,
    p_document_bucket: input.documentBucket ?? null,
    p_document_path: input.documentPath ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) return { row: null, error: error.message };
  return { row: data ? rowToAgreementHistoryEvent(data as Record<string, unknown>) : null, error: null };
}

export async function fetchPartnerAgreementHistoryDocumentUrl(
  event: Pick<PartnerAgreementHistoryEvent, "document_bucket" | "document_path">,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!event.document_bucket || !event.document_path) return null;
  const { data, error } = await supabase.storage
    .from(event.document_bucket)
    .createSignedUrl(event.document_path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl || null;
}
