import { supabase } from '@/lib/supabase';
import type { LoanStatus } from '@/lib/loanDomain';

export interface LoanSeller { id: string; display_name: string; initials: string; }
export interface LoanPartner { id: string; account_number: string; company_name: string; customer_type: string | null; }
export interface LoanContact { id: string; name: string; role_title: string | null; email: string | null; phone: string | null; }
export interface LoanMachine {
  id: string; sku: string; product_name: string | null; serial_number: string;
  machine_ident_number: string | null; warehouse_location: string | null; supply_status: string;
}
export interface LoanCase {
  id: string; case_number: string; responsible_user_id: string; dealer_account_id: string;
  dealer_contact_id: string; created_by: string; expected_return_date: string | null;
  status: LoanStatus; notes: string | null; current_version_number: number;
  alternative_delivery_address: boolean; delivery_address: string | null; delivery_postal_code: string | null;
  delivery_city: string | null; delivery_country: string | null; delivery_contact: string | null;
  delivery_note: string | null; created_at: string; updated_at: string;
}
export interface LoanCaseItem {
  id: string; case_id: string; item_type: 'machine' | 'equipment'; product_sku: string;
  planning_supply_unit_id: string | null; usage_reading_value: number | null; usage_reading_unit: 'km' | 'hours' | null;
  driving_use_limit: string | null; responsible_person: string | null; expected_return_date: string | null;
  serial_verified: boolean; serial_snapshot: string | null; product_name_snapshot: string | null;
}

function rows<T>(data: unknown): T[] { return Array.isArray(data) ? data as T[] : []; }

export async function listLoanCases(partnerId?: string | null): Promise<LoanCase[]> {
  let query = supabase.from('loan_cases').select('*').order('created_at', { ascending: false });
  if (partnerId) query = query.eq('dealer_account_id', partnerId);
  const { data, error } = await query;
  if (error) throw error;
  return rows<LoanCase>(data);
}

export async function getLoanCase(caseId: string): Promise<{ loanCase: LoanCase; items: LoanCaseItem[] }> {
  const [caseResult, itemResult] = await Promise.all([
    supabase.from('loan_cases').select('*').eq('id', caseId).single(),
    supabase.from('loan_case_items').select('*').eq('case_id', caseId).order('created_at'),
  ]);
  if (caseResult.error) throw caseResult.error;
  if (itemResult.error) throw itemResult.error;
  return { loanCase: caseResult.data as LoanCase, items: rows<LoanCaseItem>(itemResult.data) };
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
export async function listEligibleLoanMachines(): Promise<LoanMachine[]> {
  const { data, error } = await supabase.rpc('loan_list_eligible_machines');
  if (error) throw error;
  return rows<LoanMachine>(data);
}

export interface CreateLoanCaseInput {
  sellerId: string; partnerId: string; contactId: string; expectedReturnDate: string | null; notes: string | null;
  alternativeDeliveryAddress: boolean; address: string | null; postalCode: string | null; city: string | null;
  country: string | null; addressContact: string | null; addressNote: string | null;
}
export async function createLoanCase(input: CreateLoanCaseInput): Promise<string> {
  const { data, error } = await supabase.rpc('loan_create_case', {
    p_responsible_user_id: input.sellerId, p_dealer_account_id: input.partnerId,
    p_dealer_contact_id: input.contactId, p_expected_return_date: input.expectedReturnDate,
    p_notes: input.notes, p_alternative_delivery_address: input.alternativeDeliveryAddress,
    p_delivery_address: input.address, p_delivery_postal_code: input.postalCode, p_delivery_city: input.city,
    p_delivery_country: input.country, p_delivery_contact: input.addressContact, p_delivery_note: input.addressNote,
  });
  if (error) throw error;
  return String(data);
}

export async function addLoanMachine(caseId: string, supplyUnitId: string, input: {
  usageReadingValue: number | null; usageReadingUnit: 'km' | 'hours' | null;
  drivingUseLimit: string | null; responsiblePerson: string | null; expectedReturnDate: string | null; serialVerified: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('loan_add_machine_item', {
    p_case_id: caseId, p_supply_unit_id: supplyUnitId, p_usage_reading_value: input.usageReadingValue,
    p_usage_reading_unit: input.usageReadingUnit, p_driving_use_limit: input.drivingUseLimit,
    p_responsible_person: input.responsiblePerson, p_expected_return_date: input.expectedReturnDate,
    p_serial_verified: input.serialVerified,
  });
  if (error) throw error;
  return String(data);
}

export async function createLoanCaseVersion(caseId: string): Promise<number> {
  const { data, error } = await supabase.rpc('loan_create_case_version', { p_case_id: caseId });
  if (error) throw error;
  return Number(data);
}

export async function uploadLoanItemPhoto(caseId: string, itemId: string, file: File, kind: 'serial_plate' | 'overview'): Promise<void> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${caseId}/${itemId}/${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage.from('loan-case-media').upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw upload.error;
  const registered = await supabase.rpc('loan_register_item_photo', {
    p_case_id: caseId, p_case_item_id: itemId, p_storage_path: path, p_photo_kind: kind,
    p_file_name: file.name, p_content_type: file.type || null,
  });
  if (registered.error) {
    await supabase.storage.from('loan-case-media').remove([path]);
    throw registered.error;
  }
}
