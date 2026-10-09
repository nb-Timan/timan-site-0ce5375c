import { supabase } from '@/lib/supabase';
import type { LoanReturnPresentationState, LoanStatus } from '@/lib/loanDomain';

export interface LoanSeller { id: string; display_name: string; initials: string; }
export interface LoanPartner { id: string; account_number: string; company_name: string; customer_type: string | null; }
export interface LoanContact { id: string; name: string; role_title: string | null; email: string | null; phone: string | null; }
export interface LoanAsset {
  id: string;
  sku: string;
  product_name: string | null;
  serial_number: string;
  machine_ident_number: string | null;
  warehouse_location: string | null;
  supply_status: string;
  item_type: 'machine' | 'equipment';
}
export interface LoanCase {
  id: string;
  loan_number: string;
  case_number: string;
  responsible_user_id: string;
  dealer_account_id: string;
  dealer_contact_id: string;
  created_by: string;
  loan_date: string | null;
  expected_return_date: string | null;
  status: LoanStatus;
  notes: string | null;
  current_version_number: number;
  alternative_delivery_address: boolean;
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  delivery_country: string | null;
  delivery_contact: string | null;
  delivery_note: string | null;
  serial_numbers_confirmed_by: string | null;
  serial_numbers_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface LoanCaseSummary {
  id: string;
  loan_number: string;
  case_number: string;
  responsible_user_id: string;
  responsible_name: string;
  dealer_account_id: string;
  partner_name: string;
  dealer_contact_id: string;
  loan_date: string | null;
  expected_return_date: string | null;
  status: LoanStatus;
  asset_count: number;
  can_edit_expected_return: boolean;
  created_at: string;
  updated_at: string;
  return_state?: LoanCaseReturnState;
}
export interface LoanCaseReturnState {
  case_id: string;
  outstanding_asset_count: number;
  received_asset_count: number;
  review_required_count: number;
  can_receive: boolean;
  presentation_state: LoanReturnPresentationState;
}
export interface LoanCaseEvent {
  id: string;
  event_type: string;
  actor_user_id: string;
  actor_name: string;
  from_status: string | null;
  to_status: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface LoanCaseItem {
  id: string;
  case_id: string;
  item_type: 'machine' | 'equipment';
  product_sku: string;
  planning_supply_unit_id: string | null;
  fabric_asset_id?: string | null;
  usage_reading_value: number | null;
  usage_reading_unit: 'km' | 'hours' | null;
  driving_use_limit: string | null;
  responsible_person: string | null;
  expected_return_date: string | null;
  serial_verified: boolean;
  serial_snapshot: string | null;
  asset_instance_id_snapshot: string | null;
  brik_number_snapshot: number | null;
  product_name_snapshot: string | null;
  warehouse_snapshot: string | null;
  warehouse_location_code_snapshot: string | null;
  fabric_account_number_snapshot: string | null;
  fabric_order_number_snapshot: string | null;
}
export type LoanPhotoKind = 'serial_plate' | 'overview' | 'hour_meter' | 'return_meter' | 'return_condition';
export interface LoanItemPhoto {
  id: string;
  case_id: string;
  case_item_id: string;
  storage_path: string;
  photo_kind: LoanPhotoKind;
  file_name: string;
  content_type: string | null;
  preview_url: string | null;
  return_item_inspection_id?: string | null;
}
export interface LoanReturnSummary {
  case_item_id: string;
  item_type: 'machine' | 'equipment';
  product_sku: string;
  product_name: string | null;
  serial_number: string | null;
  brik_number: number | null;
  checkout_usage_reading: number | null;
  usage_reading_unit: 'km' | 'hours' | null;
  return_usage_reading: number | null;
  calculated_usage: number | null;
  serial_confirmed: boolean;
  brik_confirmed: boolean;
  receipt_status: 'RECEIVED' | 'REVIEW_REQUIRED' | null;
  returned_at: string | null;
  returned_by_name: string | null;
  notes: string | null;
  lower_reading_explanation: string | null;
  is_outstanding: boolean;
  has_return_meter_photo: boolean;
  has_return_condition_photo: boolean;
}

const LOAN_MEDIA_BUCKET = 'loan-case-media';
const LOAN_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LOAN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function rows<T>(data: unknown): T[] { return Array.isArray(data) ? data as T[] : []; }

export async function listLoanCases(partnerId?: string | null): Promise<LoanCaseSummary[]> {
  const [casesResult, stateResult] = await Promise.all([
    supabase.rpc('loan_list_case_overview', { p_partner_id: partnerId || null }),
    supabase.rpc('loan_list_case_return_states'),
  ]);
  if (casesResult.error) throw casesResult.error;
  if (stateResult.error) throw stateResult.error;
  const stateByCase = new Map(rows<LoanCaseReturnState>(stateResult.data).map((state) => [state.case_id, state]));
  return rows<LoanCaseSummary>(casesResult.data).map((loanCase) => ({
    ...loanCase,
    return_state: stateByCase.get(loanCase.id),
  }));
}

export async function getLoanCase(caseId: string): Promise<{
  loanCase: LoanCase;
  items: LoanCaseItem[];
  photos: LoanItemPhoto[];
  returnSummary: LoanReturnSummary[];
  returnState: LoanCaseReturnState | null;
}> {
  const [caseResult, itemResult, photoResult, summaryResult, stateResult] = await Promise.all([
    supabase.from('loan_cases').select('*').eq('id', caseId).single(),
    supabase.from('loan_case_items').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('loan_case_item_photos').select('*').eq('case_id', caseId).order('created_at'),
    supabase.rpc('loan_list_return_summary', { p_case_id: caseId }),
    supabase.rpc('loan_list_case_return_states'),
  ]);
  if (caseResult.error) throw caseResult.error;
  if (itemResult.error) throw itemResult.error;
  if (photoResult.error) throw photoResult.error;
  if (summaryResult.error) throw summaryResult.error;
  if (stateResult.error) throw stateResult.error;

  const rawPhotos = rows<Omit<LoanItemPhoto, 'preview_url'>>(photoResult.data);
  const photos = await Promise.all(rawPhotos.map(async (photo) => {
    const { data } = await supabase.storage.from(LOAN_MEDIA_BUCKET).createSignedUrl(photo.storage_path, 15 * 60);
    return { ...photo, preview_url: data?.signedUrl ?? null };
  }));
  const returnState = rows<LoanCaseReturnState>(stateResult.data).find((state) => state.case_id === caseId) ?? null;
  return {
    loanCase: caseResult.data as LoanCase,
    items: rows<LoanCaseItem>(itemResult.data),
    photos,
    returnSummary: rows<LoanReturnSummary>(summaryResult.data),
    returnState,
  };
}

export async function listLoanSellers(): Promise<LoanSeller[]> {
  const { data, error } = await supabase.rpc('loan_list_sellers');
  if (error) throw error;
  return rows<LoanSeller>(data);
}
export async function listLoanPartners(sellerId: string): Promise<LoanPartner[]> {
  const { data, error } = await supabase.rpc('loan_list_partners_for_seller', { p_seller_id: sellerId });
  if (error) throw error;
  return rows<LoanPartner>(data);
}
export async function listLoanContacts(partnerId: string): Promise<LoanContact[]> {
  const { data, error } = await supabase.rpc('loan_list_partner_contacts', { p_dealer_account_id: partnerId });
  if (error) throw error;
  return rows<LoanContact>(data);
}
export async function listEligibleLoanAssets(warehouseLocation?: string | null): Promise<LoanAsset[]> {
  const { data, error } = await supabase.rpc('loan_list_eligible_assets', {
    p_warehouse_location: warehouseLocation || null,
  });
  if (error) throw error;
  return rows<LoanAsset>(data);
}

export interface LoanCaseDraftInput {
  loanDate: string | null;
  expectedReturnDate: string | null;
  notes: string | null;
  alternativeDeliveryAddress: boolean;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  addressContact: string | null;
  addressNote: string | null;
}
export interface CreateLoanCaseInput extends LoanCaseDraftInput {
  sellerId: string;
  partnerId: string;
  contactId: string;
}
export async function createLoanCase(input: CreateLoanCaseInput): Promise<string> {
  const { data, error } = await supabase.rpc('loan_create_case', {
    p_responsible_user_id: input.sellerId,
    p_dealer_account_id: input.partnerId,
    p_dealer_contact_id: input.contactId,
    p_loan_date: input.loanDate,
    p_expected_return_date: input.expectedReturnDate,
    p_notes: input.notes,
    p_alternative_delivery_address: input.alternativeDeliveryAddress,
    p_delivery_address: input.address,
    p_delivery_postal_code: input.postalCode,
    p_delivery_city: input.city,
    p_delivery_country: input.country,
    p_delivery_contact: input.addressContact,
    p_delivery_note: input.addressNote,
  });
  if (error) throw error;
  return String(data);
}

export async function updateLoanDraft(caseId: string, input: LoanCaseDraftInput): Promise<void> {
  const { error } = await supabase.rpc('loan_update_draft_case', {
    p_case_id: caseId,
    p_loan_date: input.loanDate,
    p_expected_return_date: input.expectedReturnDate,
    p_notes: input.notes,
    p_alternative_delivery_address: input.alternativeDeliveryAddress,
    p_delivery_address: input.address,
    p_delivery_postal_code: input.postalCode,
    p_delivery_city: input.city,
    p_delivery_country: input.country,
    p_delivery_contact: input.addressContact,
    p_delivery_note: input.addressNote,
  });
  if (error) throw error;
}

export async function addLoanAsset(caseId: string, supplyUnitId: string, usageReadingValue: number | null): Promise<string> {
  const { data, error } = await supabase.rpc('loan_add_asset_item', {
    p_case_id: caseId,
    p_supply_unit_id: supplyUnitId,
    p_usage_reading_value: usageReadingValue,
  });
  if (error) throw error;
  return String(data);
}

export async function updateLoanItemUsage(caseId: string, itemId: string, input: {
  value: number | null;
  unit: 'km' | 'hours' | null;
  limit: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('loan_update_item_usage', {
    p_case_id: caseId,
    p_case_item_id: itemId,
    p_usage_reading_value: input.value,
    p_usage_reading_unit: input.unit,
    p_driving_use_limit: input.limit,
  });
  if (error) throw error;
}

export async function removeLoanItem(caseId: string, itemId: string): Promise<void> {
  const { error } = await supabase.rpc('loan_remove_draft_item', { p_case_id: caseId, p_case_item_id: itemId });
  if (error) throw error;
}

export async function createLoanCaseVersion(caseId: string, serialNumbersConfirmed: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('loan_create_case_version', {
    p_case_id: caseId,
    p_serial_numbers_confirmed: serialNumbersConfirmed,
  });
  if (error) throw error;
  return Number(data);
}

export async function submitLoanCaseForReview(caseId: string, serialNumbersConfirmed: boolean): Promise<void> {
  const { error } = await supabase.rpc('loan_submit_for_review', {
    p_case_id: caseId,
    p_serial_numbers_confirmed: serialNumbersConfirmed,
  });
  if (error) throw error;
}

export async function updateLoanCaseRelationships(caseId: string, input: {
  sellerId: string;
  partnerId: string;
  contactId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('loan_update_case_relationships', {
    p_case_id: caseId,
    p_responsible_user_id: input.sellerId,
    p_dealer_account_id: input.partnerId,
    p_dealer_contact_id: input.contactId,
  });
  if (error) throw error;
}

export async function reopenLoanForEdit(caseId: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('loan_reopen_for_edit', { p_case_id: caseId, p_note: note || null });
  if (error) throw error;
}

export async function updateLoanExpectedReturn(caseId: string, expectedReturnDate: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('loan_update_expected_return', {
    p_case_id: caseId,
    p_expected_return_date: expectedReturnDate,
    p_note: note,
  });
  if (error) throw error;
}

export async function listLoanCaseHistory(caseId: string): Promise<LoanCaseEvent[]> {
  const { data, error } = await supabase.rpc('loan_list_case_history', { p_case_id: caseId });
  if (error) throw error;
  return rows<LoanCaseEvent>(data);
}

export async function confirmLoanDraftSerials(caseId: string, confirmed: boolean): Promise<void> {
  const { error } = await supabase.rpc('loan_confirm_draft_serials', { p_case_id: caseId, p_confirmed: confirmed });
  if (error) throw error;
}

export function validateLoanImage(file: File): void {
  if (!LOAN_IMAGE_TYPES.has(file.type)) throw new Error('loan_image_type');
  if (file.size > LOAN_IMAGE_MAX_BYTES) throw new Error('loan_image_size');
}

export async function uploadLoanItemPhoto(
  caseId: string,
  itemId: string,
  file: File,
  kind: LoanPhotoKind,
  onProgress?: (value: number) => void,
): Promise<void> {
  validateLoanImage(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${caseId}/${itemId}/${kind}-${crypto.randomUUID()}-${safeName}`;
  onProgress?.(10);
  const upload = await supabase.storage.from(LOAN_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;
  onProgress?.(75);
  const registered = await supabase.rpc('loan_register_item_photo', {
    p_case_id: caseId,
    p_case_item_id: itemId,
    p_storage_path: path,
    p_photo_kind: kind,
    p_file_name: file.name,
    p_content_type: file.type || null,
  });
  if (registered.error) {
    await supabase.storage.from(LOAN_MEDIA_BUCKET).remove([path]);
    throw registered.error;
  }
  onProgress?.(100);
}

export async function removeLoanItemPhoto(caseId: string, photo: LoanItemPhoto): Promise<void> {
  const { data, error } = await supabase.rpc('loan_remove_item_photo', { p_case_id: caseId, p_photo_id: photo.id });
  if (error) throw error;
  const path = typeof data === 'string' ? data : photo.storage_path;
  const removal = await supabase.storage.from(LOAN_MEDIA_BUCKET).remove([path]);
  if (removal.error) throw removal.error;
}

export async function uploadLoanReturnPhoto(
  caseId: string,
  itemId: string,
  file: File,
  kind: 'return_meter' | 'return_condition',
  onProgress?: (value: number) => void,
): Promise<void> {
  validateLoanImage(file);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${caseId}/${itemId}/return-${kind === 'return_meter' ? 'meter' : 'condition'}-${crypto.randomUUID()}-${safeName}`;
  onProgress?.(10);
  const upload = await supabase.storage.from(LOAN_MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upload.error) throw upload.error;
  onProgress?.(75);
  const registered = await supabase.rpc('loan_register_return_photo', {
    p_case_id: caseId,
    p_case_item_id: itemId,
    p_storage_path: path,
    p_photo_kind: kind,
    p_file_name: file.name,
    p_content_type: file.type || null,
  });
  if (registered.error) {
    await supabase.storage.from(LOAN_MEDIA_BUCKET).remove([path]);
    throw registered.error;
  }
  onProgress?.(100);
}

export async function removeLoanReturnPhoto(caseId: string, photo: LoanItemPhoto): Promise<void> {
  const { data, error } = await supabase.rpc('loan_remove_return_photo', {
    p_case_id: caseId,
    p_photo_id: photo.id,
  });
  if (error) throw error;
  const path = typeof data === 'string' ? data : photo.storage_path;
  const removal = await supabase.storage.from(LOAN_MEDIA_BUCKET).remove([path]);
  if (removal.error) throw removal.error;
}

export interface ReceiveLoanAssetInput {
  caseItemId: string;
  serialConfirmed: boolean;
  brikNumber: string;
  returnReading: string;
  lowerReadingExplanation: string;
  requiresReview: boolean;
  discrepancyNote: string;
  note: string;
}

export async function receiveLoanAssets(
  caseId: string,
  requestKey: string,
  items: ReceiveLoanAssetInput[],
  notes?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('loan_receive_assets', {
    p_case_id: caseId,
    p_request_key: requestKey,
    p_items: items.map((item) => ({
      case_item_id: item.caseItemId,
      serial_confirmed: item.serialConfirmed,
      brik_number: item.brikNumber.trim() || null,
      return_reading: item.returnReading.trim() || null,
      lower_reading_explanation: item.lowerReadingExplanation.trim() || null,
      requires_review: item.requiresReview,
      discrepancy_note: item.discrepancyNote.trim() || null,
      note: item.note.trim() || null,
    })),
    p_notes: notes?.trim() || null,
  });
  if (error) throw error;
  return String(data);
}
